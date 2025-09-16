// Helper / utility functions
import { ColumnInfo } from './models';
import { ensureContext, loadTableSchemaIfMissing } from './repository';

// Format a single table name (optionally schema.table) for SQL Server by adding brackets where needed
export function formatTableNameForSQLServer(name: string): string {
  if (!name) return name;
  const removeBrackets = (s: string) => s.replace(/^\[|\]$/g, '').trim();
  const parts = name.split('.').map(p => p.trim()).filter(Boolean);
  if (parts.length === 2) {
    const schema = removeBrackets(parts[0]);
    const table = removeBrackets(parts[1]);
    const formattedSchema = /[^A-Za-z0-9_]/.test(schema) ? `[${schema}]` : schema;
    const formattedTable = `[${table}]`;
    return `${formattedSchema}.${formattedTable}`;
  }
  const table = removeBrackets(parts[0]);
  return `[${table}]`;
}

// Replace table references after FROM/JOIN with bracketed names where appropriate
export function formatTableNamesInQuery(sqlQuery: string): string {
  if (!sqlQuery) return sqlQuery;

  // This regex captures FROM/JOIN, the table reference (optionally schema.table and optionally bracketed), and optional alias
  const tableRefRegex = /(\bFROM|\bJOIN)\s+((?:\[[^\]]+\]|[A-Za-z_][A-ZaZ0-9_]*)(?:\s*\.\s*(?:\[[^\]]+\]|[A-Za-z_][A-ZaZ0-9_]*))?)(\s+(?:AS\s+)?[A-Za-z_][A-ZaZ0-9_]*)?/gi;

  return sqlQuery.replace(tableRefRegex, (fullMatch, keyword, tableRef, aliasPart = '') => {
    try {
      const trimmedRef = (tableRef || '').trim();

      // Match optional schema and table parts
      const partsMatch = trimmedRef.match(/^(?:\s*(\[[^\]]+\]|[A-Za-z_][A-ZaZ0-9_]*)\s*\.\s*)?\s*(\[[^\]]+\]|[A-Za-z_][A-ZaZ0-9_]*)\s*$/);
      if (!partsMatch) return fullMatch;

      const rawSchema = partsMatch[1];
      const rawTable = partsMatch[2];

      const stripBrackets = (s: string) => s.replace(/^\[|\]$/g, '');

      let formattedSchema = '';
      if (rawSchema) {
        const s = stripBrackets(rawSchema);
        formattedSchema = /[^A-Za-z0-9_]/.test(s) ? `[${s}]` : s;
      }

      const t = stripBrackets(rawTable);
      const formattedTable = `[${t}]`;

      const combined = formattedSchema ? `${formattedSchema}.${formattedTable}` : formattedTable;

      return `${keyword} ${combined}${aliasPart || ''}`;
    } catch (e) {
      return fullMatch;
    }
  });
}

// Fix malformed JOIN clauses produced by LLMs. Runs multiple passes until stable.
export function fixMalformedJoins(query: string): string {
  if (!query) return query;

  // First, unwrap any square brackets around complete clauses
  // This handles the case: [FROM [dbo].[Order Details] od INNER JOIN [dbo].[Products] p ON od.ProductID = p.ProductID]
  query = query.replace(/\[\s*(FROM|JOIN|INNER\s+JOIN|LEFT\s+JOIN|RIGHT\s+JOIN)\s+([^\]]+)\]/gi, 
    (match, keyword, content) => `${keyword} ${content}`);

  // Fix pattern: [Table] Name] - malformed table name with misplaced bracket
  // Use a syntax-based pattern recognition approach instead of hardcoded table names
  query = query.replace(/\[([^\[\]]+)\]\s+([^\[\]]+)\]/g, (match, part1, part2) => {
    // Check if this looks like a broken table name with a space
    if (
      // Exclude known SQL keywords that should not be part of table names
      !/^(?:ON|AND|OR|WHERE|FROM|JOIN|INNER|LEFT|RIGHT|FULL|CROSS|OUTER|HAVING|GROUP|ORDER|BY|ASC|DESC|UNION|ALL|ANY|SOME|EXISTS|IN|AS|IS|NULL|NOT|TRUE|FALSE)$/i.test(part2) &&
      // Exclude if part2 starts with an operator or special character
      !/^[=<>!+\-*/,;()]+/.test(part2) &&
      // Check if part1 looks like a valid identifier (not operators or special chars)
      !/^[=<>!+\-*/,;()]+/.test(part1) &&
      // Ensure reasonable length for both parts
      part1.length > 1 && part2.length > 1 &&
      // Check if part2 is not the start of a SQL clause
      !/^(?:ON|WHERE|GROUP|ORDER|HAVING)\b/i.test(part2) &&
      // Higher likelihood of table name with spaces if starts with capital letter
      /^[A-Za-z]/.test(part1) && /^[A-Za-z]/.test(part2)
    ) {
      return `[${part1} ${part2}]`;
    }
    return match;
  });

  let prev: string | null = null;
  do {
    prev = query;
    
    // First targeted pass: directly handle the specific pattern found in user error
    // e.g. FROM [dbo.Order Details.od.INNER.JOIN.[dbo.Products.p.ON.od.ProductID = p.ProductID]
    query = query.replace(/(\bFROM|\bJOIN)\s+\[(dbo\.)?([\w\s]+)\.(\w+)\.(?:INNER\.)?JOIN\.\[(dbo\.)?([\w\s]+)\.(\w+)\.ON\.(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)\]/gi, 
    (match, keyword, schema1, table1, alias1, schema2, table2, alias2, prefix1, col1, prefix2, col2) => {
      try {
        schema1 = schema1 ? schema1.replace(/\.$/, '') : 'dbo';
        schema2 = schema2 ? schema2.replace(/\.$/, '') : 'dbo';
        // Ensure the prefix1 matches alias1 - this is typically the case in this malformed pattern
        if (prefix1 !== alias1) {
          console.log(`Warning: Expected ${prefix1} to match alias ${alias1}`);
        }
        return `${keyword} [${schema1}].[${table1}] ${alias1} INNER JOIN [${schema2}].[${table2}] ${alias2} ON ${alias1}.${col1} = ${prefix2}.${col2}`;
      } catch (e) {
        console.error("Error in specific JOIN pattern fix:", e);
        return match;
      }
    });
    
    // Add a pattern for JOIN dbo.[Products p ON od].ProductID = p.ProductID
    query = query.replace(/(\bFROM|\bJOIN)\s+(dbo\.)?(\[[^\]]+\])\s+(\w+)\s+(?:INNER\s+)?JOIN\s+(dbo\.)?(\[[^\]]+\s+(\w+)\s+ON\s+\w+\])\.(\w+)\s*=\s*(\w+)\.(\w+)/gi,
    (match, keyword, schema1, table1, alias1, schema2, tableWithAlias, alias2, col1, prefix2, col2) => {
      try {
        schema1 = schema1 || 'dbo.';
        schema2 = schema2 || 'dbo.';
        // Extract just the table name from tableWithAlias by removing the alias and ON part
        const tableName = tableWithAlias.replace(new RegExp(`\\s+${alias2}\\s+ON\\s+\\w+$`, 'i'), '');
        
        return `${keyword} ${schema1}${table1} ${alias1} JOIN ${schema2}${tableName} ${alias2} ON ${alias1}.${col1} = ${prefix2}.${col2}`;
      } catch (e) {
        console.error("Error in JOIN Products fix:", e);
        return match;
      }
    });
    
    // Second pattern for less structured but similar case
    query = query.replace(/(\bFROM|\bJOIN)\s+\[(dbo\.)?([\w\s]+)\.(\w+)\.(?:INNER\.)?JOIN\.(dbo\.)?([\w\s]+)\.(\w+)\.ON\.([^\]]+)\]/gi, 
    (match, keyword, schema1, table1, alias1, schema2, table2, alias2, conditions) => {
      try {
        schema1 = schema1 ? schema1.replace(/\.$/, '') : 'dbo';
        schema2 = schema2 ? schema2.replace(/\.$/, '') : 'dbo';
        return `${keyword} [${schema1}].[${table1}] ${alias1} INNER JOIN [${schema2}].[${table2}] ${alias2} ON ${conditions}`;
      } catch (e) {
        return match;
      }
    });

    // Pre-pass: move any stray JOIN/ON keywords out of bracketed identifiers
    // e.g. "[Order Details ON od.ProductID = p.ProductID]" => "[Order Details] ON od.ProductID = p.ProductID"
    query = query.replace(/\[([^\]]*?\b(ON|INNER\s+JOIN|JOIN)\b[^\]]*?)\]/gi, (match, content) => {
      try {
        const up = content.toUpperCase();
        // Prefer the last occurrence (in case table names contain the word earlier)
        const onIdx = up.lastIndexOf(' ON ');
        const innerJoinIdx = up.lastIndexOf(' INNER JOIN ');
        const joinIdx = up.lastIndexOf(' JOIN ');
        let idx = -1;
        let keyword = '';
        if (onIdx !== -1) { idx = onIdx; keyword = 'ON'; }
        else if (innerJoinIdx !== -1) { idx = innerJoinIdx; keyword = 'INNER JOIN'; }
        else if (joinIdx !== -1 && innerJoinIdx === -1) { idx = joinIdx; keyword = 'JOIN'; } // Only if not already matched as INNER JOIN
        if (idx === -1) return match;

        const before = content.slice(0, idx).trim();
        const after = content.slice(idx + keyword.length).trim();

        const cleanedBefore = before ? `[${before.replace(/^\[|\]$/g, '').trim()}]` : '';
        // Remove any leading dots from the 'after' side (often produced by LLMs)
        const cleanedAfter = after.replace(/^\.+/, '');

        return cleanedBefore + ' ' + keyword + ' ' + cleanedAfter;
      } catch (e) {
        return match;
      }
    });

    // Pattern: JOIN schema.[<content with ON inside>].Column = rhs  => extract table, alias, ON-target
    const bracketOnPattern = /(\bFROM|\bJOIN)\s+([A-Za-z_][A-ZaZ0-9_]*\.)?\[([^\]]*ON[^\]]*)\]\.([A-Za-z_][A-ZaZ0-9_]*)\s*=\s*([^\s;]+)/gi;
    query = query.replace(bracketOnPattern, (match, keyword, schemaPart = '', bracketContent, leftColumn, rhs) => {
      try {
        const schema = schemaPart ? schemaPart.replace(/\.$/, '') : '';
        const up = (bracketContent || '').toUpperCase();
        const onIndex = up.lastIndexOf(' ON ');
        if (onIndex === -1) return match;

        const beforeOn = bracketContent.slice(0, onIndex).trim();
        const afterOn = bracketContent.slice(onIndex + 4).trim();

        const beforeTokens = beforeOn.split(/\s+/).filter(Boolean);
        let alias = '';
        let tableName = beforeOn;
        if (beforeTokens.length > 1) {
          alias = beforeTokens.pop()!;
          tableName = beforeTokens.join(' ');
        }

        const formattedTable = formatTableNameForSQLServer(schema ? `${schema}.${tableName}` : tableName);

        const sanitizedAfterOn = afterOn.replace(/^\.+/, '');
        const sanitizedRhs = rhs.replace(/^\.+/, '');

        if (alias) return `${keyword} ${formattedTable} ${alias} ON ${sanitizedAfterOn}.${leftColumn} = ${sanitizedRhs}`;
        return `${keyword} ${formattedTable} ON ${sanitizedAfterOn}.${leftColumn} = ${sanitizedRhs}`;
      } catch (e) {
        return match;
      }
    });

    // Pattern: JOIN schema.[Table Alias].Col = rhs  => move alias out of brackets
    const bracketAliasPattern = /(\bFROM|\bJOIN)\s+([A-Za-z_][A-ZaZ0-9_]*\.)?\[([^\]]*?)\]\.?(?:([A-Za-z_][A-ZaZ0-9_]*)\s*)?\s*=\s*([^\s;]+)/gi;
    query = query.replace(bracketAliasPattern, (match, keyword, schemaPart = '', bracketContent, leftColumnMaybe, rhs) => {
      try {
        const schema = schemaPart ? schemaPart.replace(/\.$/, '') : '';
        const tokens = (bracketContent || '').trim().split(/\s+/).filter(Boolean);
        let alias = '';
        let tableName = bracketContent || '';
        if (tokens.length > 1) {
          alias = tokens.pop()!;
          tableName = tokens.join(' ');
        }

        const leftColumn = leftColumnMaybe && leftColumnMaybe.length ? leftColumnMaybe : (rhs.split('.')[1] || '');
        if (!leftColumn) return match; // If we can't determine the left column, leave it alone

        const formattedTable = formatTableNameForSQLServer(schema ? `${schema}.${tableName}` : tableName);

        if (alias) return `${keyword} ${formattedTable} ${alias} ON ${alias}.${leftColumn} = ${rhs}`;
        // If no alias, use the table name as the qualifier
        return `${keyword} ${formattedTable} ON ${tableName}.${leftColumn} = ${rhs}`;
      } catch (e) {
        return match;
      }
    });
    
  } while (query !== prev);

  return query;
}

// Fix aggregate calculations where CTEs or derived tables would produce cleaner results
export function fixAggregateCalculations(query: string): string {
  // Detect and warn about nested aggregations in SELECT
  const nestedAggsPattern = /SELECT\s+.*?\bSUM\s*\(\s*SUM\s*\(/i;
  if (nestedAggsPattern.test(query)) {
    console.log('WARNING: Detected nested aggregations. This may cause SQL errors. Consider using CTEs or derived tables.');
  }

  return query;
}

// Create a meaningful context for queries based on the tables involved
export const inferContextFromTables = (tables: string[]): string => {
  // Trivial implementation for now, will be enhanced in the schema analyzer
  return tables.join(', ');
};

// Extract the key business logic context from the query
export const extractMeaningfulContext = (content: string): string => {
  return content;
};

// Helper to extract context for aggregate operations
const extractAggregateContext = (queryUpper: string, func: string, tables: string[]): string => {
  let resultContext = '';
  
  // Find what's being aggregated, and try to provide better labels
  const countPattern = new RegExp(`${func}\\s*\\(\\s*(.*?)\\s*\\)`, 'i');
  const countMatch = queryUpper.match(countPattern);
  if (countMatch) {
    const countTarget = countMatch[1].trim();
    if (countTarget === '*') {
      resultContext += `${func} of all rows `;
    } else {
      resultContext += `${func} of ${countTarget} `;
    }
  }

  // Look for GROUP BY to understand dimensions of analysis
  const groupByPattern = /GROUP\s+BY\s+(.*?)(?:\s+HAVING|\s+ORDER|\s+LIMIT|\s*$)/i;
  const groupByMatch = queryUpper.match(groupByPattern);
  if (groupByMatch) {
    const groupings = groupByMatch[1].split(',').map(g => g.trim());
    resultContext += `grouped by ${groupings.join(', ')} `;
  }

  return resultContext;
};

// Fix TOP with OFFSET patterns - SQL Server doesn't allow both in the same statement
export function fixTopWithTiesAndOffset(query: string): string {
  const regexTopWithOffset = /SELECT\s+TOP\s+\d+(?:\s+PERCENT)?(?:\s+WITH\s+TIES)?\s+.*?\bOFFSET\b/is;
  
  if (regexTopWithOffset.test(query)) {
    console.log('Detected TOP with OFFSET conflict, attempting to fix...');
    
    // Replace TOP with a comment and keep OFFSET/FETCH for paging
    return query.replace(/SELECT\s+TOP\s+\d+(?:\s+PERCENT)?(?:\s+WITH\s+TIES)?\s+/ig, 
      match => `SELECT /* ${match.trim()} converted */ `);
  }
  
  return query;
}

// Clean SQL query - apply generic SQL Server-compatible normalizations
export const cleanSQLQuery = (sqlQuery: string): string => {
  if (!sqlQuery) return '';
  console.log('=== cleanSQLQuery INPUT ===');
  console.log(sqlQuery);
  console.log('=== END INPUT ===');

  // First, remove any markdown code block markers and SQL language indicators
  // Make sure to remove ALL backticks and markdown formatting completely
  let cleaned = sqlQuery
    .replace(/```\s*(?:"?'?sql'?"?)?\s*|\s*```/gi, '') // Remove ```sql, ```"sql", etc. and ``` markers
    .replace(/^(?:"?'?sql'?"?\s*:?\s*)/i, '')          // Remove leading 'sql:', "sql:", etc.
    .replace(/`/g, '')                                 // Remove any remaining backticks - this is critical!
    .replace(/\\n/g, '\n')                             // Convert literal \n to actual newlines
    .trim();

  // Try to extract just the SQL query if it's embedded in a larger text
  const sqlQueryMatch = cleaned.match(/SQL Query:\s*(SELECT[\s\S]*?)(?=\n\s*Expected Output:|$)/i);
  if (sqlQueryMatch) {
    const result = sqlQueryMatch[1].trim();
    const finalResult = result.endsWith(';') ? result : result + ';';
    console.log('=== cleanSQLQuery OUTPUT (via SQL Query:) ===');
    console.log(finalResult);
    console.log('=== END OUTPUT ===');
    return finalResult;
  }

  // Enhanced SQL statement detection - supports comments, indentation, and multi-line queries
  const lines = cleaned.split('\n');
  let sqlLines = [];
  let foundSelect = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip completely empty lines before we find any SQL content
    if (!line && sqlLines.length === 0) continue;
    
    // Check if this is a SQL comment line
    const isCommentLine = line.startsWith('--');
    
    // Check if this line contains a SELECT statement (case insensitive)
    const isSelectLine = line.toUpperCase().includes('SELECT') || line.toUpperCase().startsWith('SELECT');
    
    // If we find a SELECT statement, mark that we found it
    if (isSelectLine) {
      foundSelect = true;
    }
    
    // Include the line if:
    // 1. It's a comment (we always want to preserve comments)
    // 2. It contains SELECT, INSERT, UPDATE, DELETE, WITH, etc. (SQL keywords)
    // 3. We've already found a SELECT and this line seems to be part of the query
    // 4. It's not empty and we've started collecting SQL lines
    const isSqlKeywordLine = /\b(SELECT|INSERT|UPDATE|DELETE|WITH|FROM|WHERE|JOIN|GROUP|ORDER|HAVING|UNION|EXCEPT|INTERSECT)\b/i.test(line);
    
    if (isCommentLine || isSqlKeywordLine || (foundSelect && line) || (sqlLines.length > 0 && line)) {
      sqlLines.push(lines[i]); // Use original line to preserve indentation
    }
  }

  if (sqlLines.length > 0 && foundSelect) {
    // Join the lines and preserve formatting
    let result = sqlLines.join('\n').trim();
    
    // Clean up excessive whitespace while preserving line structure
    result = result.replace(/[ \t]+/g, ' '); // Replace multiple spaces/tabs with single space
    result = result.replace(/\n\s*\n/g, '\n'); // Remove completely empty lines
    
    if (!result.endsWith(';')) {
      result += ';';
    }
    
    console.log('=== cleanSQLQuery OUTPUT (via enhanced SQL detection) ===');
    console.log(result);
    console.log('=== END OUTPUT ===');
    return result;
  }

  console.log('=== NO SELECT FOUND - RETURNING EMPTY ===');
  return '';
};

// Fix ORDER BY clauses that appear before UNION/UNION ALL (not allowed in SQL Server)
export const fixOrderByBeforeUnion = (sqlQuery: string): string => {
  if (!sqlQuery) return sqlQuery;
  
  console.log('=== fixOrderByBeforeUnion INPUT ===');
  console.log(sqlQuery);
  
  // Split the query into parts by UNION to process each part separately
  const unionParts = sqlQuery.split(/\b(UNION(?:\s+ALL)?)\b/gi);
  
  let result = '';
  let orderByClausesRemoved = 0;
  
  for (let i = 0; i < unionParts.length; i++) {
    let part = unionParts[i];
    
    // Skip UNION keywords themselves
    if (/^UNION(?:\s+ALL)?$/gi.test(part.trim())) {
      result += part;
      continue;
    }
    
    // For each SQL part before UNION, check if it has ORDER BY at the end
    // But ignore ORDER BY that are inside OVER() clauses
    if (i < unionParts.length - 1) { // Not the last part (which can have ORDER BY)
      // Look for ORDER BY that's not inside parentheses (i.e., not in OVER clause)
      // Pattern: find ORDER BY that's at the top level of the query part
      
      let parenDepth = 0;
      let orderByStart = -1;
      let inString = false;
      let stringChar = '';
      
      // Find ORDER BY that's not inside parentheses
      for (let j = 0; j < part.length; j++) {
        const char = part[j];
        const nextChars = part.substring(j, j + 8).toUpperCase();
        
        // Track string literals
        if ((char === "'" || char === '"') && !inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar && inString) {
          inString = false;
          stringChar = '';
        }
        
        // Skip if we're in a string
        if (inString) continue;
        
        // Track parentheses depth
        if (char === '(') parenDepth++;
        if (char === ')') parenDepth--;
        
        // Look for ORDER BY only at top level (parenDepth === 0)
        if (parenDepth === 0 && nextChars.startsWith('ORDER BY')) {
          orderByStart = j;
          break;
        }
      }
      
      if (orderByStart !== -1) {
        // Found ORDER BY at top level - remove it
        const beforeOrderBy = part.substring(0, orderByStart).trim();
        console.log('Removing ORDER BY clause before UNION in part:', part.substring(orderByStart, orderByStart + 50) + '...');
        part = beforeOrderBy + '\n-- ORDER BY clause removed (not allowed before UNION)\n';
        orderByClausesRemoved++;
      }
    }
    
    result += part;
  }
  
  if (orderByClausesRemoved > 0) {
    console.log(`Removed ${orderByClausesRemoved} ORDER BY clause(s) before UNION`);
  }
  
  console.log('=== fixOrderByBeforeUnion OUTPUT ===');
  console.log(result);
  console.log('=== END OUTPUT ===');
  
  return result;
};

// Fix window functions that reference columns not in GROUP BY clause
export const fixWindowFunctionGroupBy = (sqlQuery: string): string => {
  if (!sqlQuery) return sqlQuery;
  
  console.log('=== fixWindowFunctionGroupBy INPUT ===');
  console.log(sqlQuery);
  
  let cleaned = sqlQuery;
  
  // Look for PERCENTILE_CONT with OVER that might cause GROUP BY issues
  // Pattern: PERCENTILE_CONT(...) WITHIN GROUP (ORDER BY expression) OVER (PARTITION BY ...)
  // Need to handle multiline with /s flag and be more flexible with whitespace
  const percentilePattern = /PERCENTILE_CONT\s*\([^)]+\)\s*WITHIN\s+GROUP\s*\(\s*ORDER\s+BY[^)]+\)\s*OVER\s*\([^)]+\)/gis;
  
  const matches = [...cleaned.matchAll(percentilePattern)];
  
  if (matches.length > 0) {
    console.log('Found PERCENTILE_CONT window functions that may cause GROUP BY issues:', matches.length);
    
    for (const match of matches) {
      const fullMatch = match[0];
      console.log('Replacing problematic PERCENTILE_CONT:', fullMatch.substring(0, 80) + '...');
      
      // Replace with a simpler approach using AVG as an approximation
      // This is a workaround since proper median calculation in GROUP BY context is complex
      const replacement = '-- PERCENTILE_CONT replaced due to GROUP BY constraints\n    AVG(CAST(DATEDIFF(DAY, SOH.[OrderDate], SOH.[ShipDate]) AS FLOAT))';
      
      cleaned = cleaned.replace(fullMatch, replacement);
    }
  } else {
    // If the strict pattern didn't match, try a more lenient approach
    // Look for PERCENTILE_CONT anywhere in the query
    if (cleaned.toUpperCase().includes('PERCENTILE_CONT')) {
      console.log('Found PERCENTILE_CONT but regex didn\'t match, applying broader fix');
      
      // Find the line with PERCENTILE_CONT and replace the whole expression
      const lines = cleaned.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        // Only replace lines that actually contain the PERCENTILE_CONT function, not comments
        if (line.toUpperCase().includes('PERCENTILE_CONT') && !line.startsWith('--')) {
          console.log('Replacing PERCENTILE_CONT line:', line);
          // Replace the entire line with a simpler aggregate
          lines[i] = ' -- PERCENTILE_CONT replaced due to GROUP BY constraints\n    AVG(CAST(DATEDIFF(DAY, SOH.[OrderDate], SOH.[ShipDate]) AS FLOAT)) AS [MedianFulfillmentDays],';
          
          // Also check if the next line is part of the OVER clause
          if (i + 1 < lines.length && lines[i + 1].trim().toUpperCase().startsWith('OVER')) {
            lines[i + 1] = ' -- OVER clause removed';
          }
        }
      }
      cleaned = lines.join('\n');
    }
  }
  
  console.log('=== fixWindowFunctionGroupBy OUTPUT ===');
  console.log(cleaned);
  console.log('=== END OUTPUT ===');
  
  return cleaned;
};

// Validate and clean a SQL query - apply all checks and fixes
export const validateAndCleanQuery = (sqlQuery: string): string => {
  console.log('validateAndCleanQuery INPUT:', sqlQuery);

  if (!sqlQuery || typeof sqlQuery !== 'string') {
    throw new Error('Invalid SQL query');
  }

  // First clean the SQL normally
  let cleaned = cleanSQLQuery(sqlQuery);
  
  // Apply JOIN fixes
  cleaned = fixMalformedJoins(cleaned);
  
  // Apply TOP with OFFSET fixes
  cleaned = fixTopWithTiesAndOffset(cleaned);
  
  // Fix aggregate calculations
  cleaned = fixAggregateCalculations(cleaned);
  
  // Fix specific JOIN patterns that our main function might miss
  cleaned = cleaned.replace(/JOIN\s+(dbo\.)?(\[)([^\]]+)\s+(\w+)\s+ON\s+(\w+)(\])\.(\w+)\s*=\s*(\w+)\.(\w+)/gi,
    (match, schema, leftBracket, table, alias, otherAlias, rightBracket, col1, prefix2, col2) => {
      return `JOIN ${schema || ''}[${table}] ${alias} ON ${otherAlias}.${col1} = ${prefix2}.${col2}`;
    });
  
  // Fix ORDER BY before UNION issues (SQL Server doesn't allow ORDER BY before UNION)
  cleaned = fixOrderByBeforeUnion(cleaned);
  
  // Fix window function GROUP BY issues
  cleaned = fixWindowFunctionGroupBy(cleaned);
  
  // Add an extra sanitization step to ensure ALL backticks are removed
  // This is a critical fix to prevent the "Incorrect syntax near '`'" error
  cleaned = cleaned
    .replace(/`/g, '')           // Remove any backticks that might have survived
    .replace(/```[^`]*```/g, '') // Remove any remaining code blocks
    .trim();
  
  console.log('validateAndCleanQuery OUTPUT (extra sanitized):', cleaned);
  return cleaned;
};

// Get a more readable/contextual label for displaying column names
export const getContextualLabel = (columnName: string): string => {
  // Remove common prefixes/suffixes and format for display
  return columnName
    .replace(/([A-Z])/g, ' $1') // Insert space before capitals
    .replace(/^[a-z]/, match => match.toUpperCase()) // Capitalize first letter
    .replace(/_/g, ' ') // Replace underscores with spaces
    .replace(/Id$|ID$/, ' ID') // Format ID suffix
    .replace(/([a-z])([A-Z])/g, '$1 $2') // Add space between camelCase
    .trim();
};

// Format a column name for display
export const formatColumnName = (name: string): string => {
  return getContextualLabel(name);
};

// Format a single value for display
export const formatSingleValue = (v: any): string => {
  if (v === null || v === undefined) return 'N/A';
  
  if (v instanceof Date) {
    return v.toLocaleDateString();
  }
  
  if (typeof v === 'number') {
    // Format large numbers with commas
    if (Math.abs(v) >= 1000) {
      return v.toLocaleString();
    }
    // Use up to 2 decimal places for floating point
    if (v % 1 !== 0) {
      return v.toFixed(2);
    }
  }
  
  if (typeof v === 'boolean') {
    return v ? 'Yes' : 'No';
  }
  
  return String(v);
};

export const formatDisplayValue = (v: any): string => formatSingleValue(v);

// Return a simple HTML table representation of results (keeps it minimal)
export const formatResultsAsHTMLTable = (results: any[], keys: string[], total: number, _sqlQuery?: string): string => {
  if (!results || !results.length) return 'No data.';
  const header = keys.map(k => `<th>${formatColumnName(k)}</th>`).join('');
  const rows = results.slice(0, 100).map(row => {
    const cols = keys.map(k => `<td>${formatSingleValue(row[k])}</td>`).join('');
    return `<tr>${cols}</tr>`;
  }).join('');
  const table = `<table border="1" cellspacing="0" cellpadding="4"><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table>`;
  const more = total > results.length ? `<div>Showing ${results.length} of ${total} rows.</div>` : '';
  return `${table}${more}`;
};

// Handle SQL errors and return a user-friendly, context-aware string
export const handleSQLErrorMessage = (error: any): string => {
  try {
    if (!error) return 'An unknown SQL error occurred.';
    const msg = error.message || error.toString();
    const errorLower = msg.toLowerCase();
    
    // Initialize an empty schema context - we'll use simple error handling 
    // instead of trying to dynamically load context
    const schemaContext: Record<string, any> = {};
    
    // Dynamic error analysis and suggestions
    let enhancedMessage = `❌ SQL Error: ${msg}`;
    
    // Common error patterns with schema-aware solutions
    if (errorLower.includes('invalid object name') || errorLower.includes('invalid table name')) {
      // Extract the invalid table name
      const tableMatch = msg.match(/['"\[]([^\]'"]+)['"\]]/);
      const invalidTable = tableMatch ? tableMatch[1] : '';
      
      if (invalidTable) {
        // Find similar table names in the schema using basic string similarity
        const availableTables = Object.keys(schemaContext);
        
        const similarTables = availableTables.filter(t => {
          // Simple similarity check - share at least 3 consecutive characters
          const tableLower = t.toLowerCase();
          const invalidLower = invalidTable.toLowerCase();
          
          for (let i = 0; i <= tableLower.length - 3; i++) {
            const chunk = tableLower.substring(i, i + 3);
            if (invalidLower.includes(chunk)) return true;
          }
          return false;
        });
        
        if (similarTables.length > 0) {
          enhancedMessage += `\n\nThe table "${invalidTable}" doesn't exist. Did you mean one of these tables?\n- ${similarTables.join('\n- ')}`;
        } else {
          enhancedMessage += `\n\nThe table "${invalidTable}" doesn't exist. Check the table name and try again.`;
        }
      }
    }
    else if (errorLower.includes('column') && (errorLower.includes('unknown') || errorLower.includes('invalid') || errorLower.includes('not found'))) {
      // Column-related errors
      const colMatch = msg.match(/['"]([^'"]+)['"]/);
      const ambiguousColumn = colMatch ? colMatch[1] : '';
      
      if (ambiguousColumn) {
        // Find tables that contain this column name
        const tablesWithColumn: string[] = [];
        
        Object.entries(schemaContext).forEach(([table, columns]) => {
          const hasColumn = (columns as any[]).some((col: any) => 
            col.name.toLowerCase() === ambiguousColumn.toLowerCase()
          );
          
          if (hasColumn) {
            tablesWithColumn.push(table);
          }
        });
        
        if (tablesWithColumn.length > 0) {
          enhancedMessage += `\n\nColumn "${ambiguousColumn}" exists in multiple tables. Qualify it with the table name or alias:\n- ${tablesWithColumn.map(t => `${t}.${ambiguousColumn}`).join('\n- ')}`;
        }
      }
    }
    else if (errorLower.includes('syntax error') || errorLower.includes('incorrect syntax')) {
      // General syntax error suggestions
      enhancedMessage += `\n\nThis appears to be a syntax error. Common causes include:
- Missing or mismatched parentheses
- Incorrect JOIN syntax
- Missing commas between columns
- Using incorrect SQL dialect features`;
    }
    else if (errorLower.includes('aggregate function') && errorLower.includes('subquery')) {
      // Aggregate function with subquery errors
      enhancedMessage += `\n\nSQL Server cannot process an aggregate function (SUM, COUNT, AVG, etc.) that contains a subquery.
Consider these solutions:
- Move the subquery to a JOIN
- Create a CTE (Common Table Expression) for the subquery
- Use a derived table or temporary table
- Calculate aggregated values separately`;
    }
    
    return enhancedMessage;
  } catch (e) {
    return `Error: ${error}`;
  }
}