// // Helper / utility functions
// import { ColumnInfo } from './models';
// import { ensureContext, loadTableSchemaIfMissing } from './repository';

// // Format a single table name (optionally schema.table) for SQL Server by adding brackets where needed
// export function formatTableNameForSQLServer(name: string): string {
//   if (!name) return name;
//   const removeBrackets = (s: string) => s.replace(/^\[|\]$/g, '').trim();
//   const parts = name.split('.').map(p => p.trim()).filter(Boolean);
//   if (parts.length === 2) {
//     const schema = removeBrackets(parts[0]);
//     const table = removeBrackets(parts[1]);
//     const formattedSchema = /[^A-Za-z0-9_]/.test(schema) ? `[${schema}]` : schema;
//     const formattedTable = `[${table}]`;
//     return `${formattedSchema}.${formattedTable}`;
//   }
//   const table = removeBrackets(parts[0]);
//   return `[${table}]`;
// }

// // Replace table references after FROM/JOIN with bracketed names where appropriate
// export function formatTableNamesInQuery(sqlQuery: string): string {
//   if (!sqlQuery) return sqlQuery;

//   // This regex captures FROM/JOIN, the table reference (optionally schema.table and optionally bracketed), and optional alias
//   const tableRefRegex = /(\bFROM|\bJOIN)\s+((?:\[[^\]]+\]|[A-Za-z_][A-Za-z0-9_]*)(?:\s*\.\s*(?:\[[^\]]+\]|[A-Za-z_][A-Za-z0-9_]*))?)(\s+(?:AS\s+)?[A-Za-z_][A-Za-z0-9_]*)?/gi;

//   return sqlQuery.replace(tableRefRegex, (fullMatch, keyword, tableRef, aliasPart = '') => {
//     try {
//       const trimmedRef = (tableRef || '').trim();

//       // Match optional schema and table parts
//       const partsMatch = trimmedRef.match(/^(?:\s*(\[[^\]]+\]|[A-Za-z_][A-Za-z0-9_]*)\s*\.\s*)?\s*(\[[^\]]+\]|[A-Za-z_][A-Za-z0-9_]*)\s*$/);
//       if (!partsMatch) return fullMatch;

//       const rawSchema = partsMatch[1];
//       const rawTable = partsMatch[2];

//       const stripBrackets = (s: string) => s.replace(/^\[|\]$/g, '');

//       let formattedSchema = '';
//       if (rawSchema) {
//         const s = stripBrackets(rawSchema);
//         formattedSchema = /[^A-Za-z0-9_]/.test(s) ? `[${s}]` : s;
//       }

//       const t = stripBrackets(rawTable);
//       const formattedTable = `[${t}]`;

//       const combined = formattedSchema ? `${formattedSchema}.${formattedTable}` : formattedTable;

//       return `${keyword} ${combined}${aliasPart || ''}`;
//     } catch (e) {
//       return fullMatch;
//     }
//   });
// }

// // Fix malformed JOIN clauses produced by LLMs. Runs multiple passes until stable.
// export function fixMalformedJoins(query: string): string {
//   if (!query) return query;

//   // First, unwrap any square brackets around complete clauses
//   // This handles the case: [FROM [dbo].[Order Details] od INNER JOIN [dbo].[Products] p ON od.ProductID = p.ProductID]
//   query = query.replace(/\[\s*(FROM|JOIN|INNER\s+JOIN|LEFT\s+JOIN|RIGHT\s+JOIN)\s+([^\]]+)\]/gi, 
//     (match, keyword, content) => `${keyword} ${content}`);

//   // Fix pattern: [Table] Name] - malformed table name with misplaced bracket
//   // Use a syntax-based pattern recognition approach instead of hardcoded table names
//   query = query.replace(/\[([^\[\]]+)\]\s+([^\[\]]+)\]/g, (match, part1, part2) => {
//     // Check if this looks like a broken table name with a space
//     if (
//       // Exclude known SQL keywords that should not be part of table names
//       !/^(?:ON|AND|OR|WHERE|FROM|JOIN|INNER|LEFT|RIGHT|FULL|CROSS|OUTER|HAVING|GROUP|ORDER|BY|ASC|DESC|UNION|ALL|ANY|SOME|EXISTS|IN|AS|IS|NULL|NOT|TRUE|FALSE)$/i.test(part2) &&
//       // Exclude if part2 starts with an operator or special character
//       !/^[=<>!+\-*/,;()]+/.test(part2) &&
//       // Check if part1 looks like a valid identifier (not operators or special chars)
//       !/^[=<>!+\-*/,;()]+/.test(part1) &&
//       // Ensure reasonable length for both parts
//       part1.length > 1 && part2.length > 1 &&
//       // Check if part2 is not the start of a SQL clause
//       !/^(?:ON|WHERE|GROUP|ORDER|HAVING)\b/i.test(part2) &&
//       // Higher likelihood of table name with spaces if starts with capital letter
//       /^[A-Za-z]/.test(part1) && /^[A-Za-z]/.test(part2)
//     ) {
//       return `[${part1} ${part2}]`;
//     }
//     return match;
//   });

//   let prev: string | null = null;
//   do {
//     prev = query;
    
//     // First targeted pass: directly handle the specific pattern found in user error
//     // e.g. FROM [dbo.Order Details.od.INNER.JOIN.[dbo.Products.p.ON.od.ProductID = p.ProductID]
//     query = query.replace(/(\bFROM|\bJOIN)\s+\[(dbo\.)?([\w\s]+)\.(\w+)\.(?:INNER\.)?JOIN\.\[(dbo\.)?([\w\s]+)\.(\w+)\.ON\.(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)\]/gi, 
//     (match, keyword, schema1, table1, alias1, schema2, table2, alias2, prefix1, col1, prefix2, col2) => {
//       try {
//         schema1 = schema1 ? schema1.replace(/\.$/, '') : 'dbo';
//         schema2 = schema2 ? schema2.replace(/\.$/, '') : 'dbo';
//         // Ensure the prefix1 matches alias1 - this is typically the case in this malformed pattern
//         if (prefix1 !== alias1) {
//           console.log(`Warning: Expected ${prefix1} to match alias ${alias1}`);
//         }
//         return `${keyword} [${schema1}].[${table1}] ${alias1} INNER JOIN [${schema2}].[${table2}] ${alias2} ON ${alias1}.${col1} = ${prefix2}.${col2}`;
//       } catch (e) {
//         console.error("Error in specific JOIN pattern fix:", e);
//         return match;
//       }
//     });
    
//     // Second pattern for less structured but similar case
//     query = query.replace(/(\bFROM|\bJOIN)\s+\[(dbo\.)?([\w\s]+)\.(\w+)\.(?:INNER\.)?JOIN\.(dbo\.)?([\w\s]+)\.(\w+)\.ON\.([^\]]+)\]/gi, 
//     (match, keyword, schema1, table1, alias1, schema2, table2, alias2, conditions) => {
//       try {
//         schema1 = schema1 ? schema1.replace(/\.$/, '') : 'dbo';
//         schema2 = schema2 ? schema2.replace(/\.$/, '') : 'dbo';
//         return `${keyword} [${schema1}].[${table1}] ${alias1} INNER JOIN [${schema2}].[${table2}] ${alias2} ON ${conditions}`;
//       } catch (e) {
//         return match;
//       }
//     });

//     // Pre-pass: move any stray JOIN/ON keywords out of bracketed identifiers
//     // e.g. "[Order Details ON od.ProductID = p.ProductID]" => "[Order Details] ON od.ProductID = p.ProductID"
//     query = query.replace(/\[([^\]]*?\b(ON|INNER\s+JOIN|JOIN)\b[^\]]*?)\]/gi, (match, content) => {
//       try {
//         const up = content.toUpperCase();
//         // Prefer the last occurrence (in case table names contain the word earlier)
//         const onIdx = up.lastIndexOf(' ON ');
//         const innerJoinIdx = up.lastIndexOf(' INNER JOIN ');
//         const joinIdx = up.lastIndexOf(' JOIN ');
//         let idx = -1;
//         let keyword = '';
//         if (onIdx !== -1) { idx = onIdx; keyword = 'ON'; }
//         else if (innerJoinIdx !== -1) { idx = innerJoinIdx; keyword = 'INNER JOIN'; }
//         else if (joinIdx !== -1 && innerJoinIdx === -1) { idx = joinIdx; keyword = 'JOIN'; } // Only if not already matched as INNER JOIN
//         if (idx === -1) return match;

//         const before = content.slice(0, idx).trim();
//         const after = content.slice(idx + keyword.length).trim();

//         const cleanedBefore = before ? `[${before.replace(/^\[|\]$/g, '').trim()}]` : '';
//         // Remove any leading dots from the 'after' side (often produced by LLMs)
//         const cleanedAfter = after.replace(/^\.+/, '');

//         return cleanedBefore + ' ' + keyword + ' ' + cleanedAfter;
//       } catch (e) {
//         return match;
//       }
//     });

//     // Pattern: JOIN schema.[<content with ON inside>].Column = rhs  => extract table, alias, ON-target
//     const bracketOnPattern = /(\bFROM|\bJOIN)\s+([A-Za-z_][A-Za-z0-9_]*\.)?\[([^\]]*ON[^\]]*)\]\.([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^\s;]+)/gi;
//     query = query.replace(bracketOnPattern, (match, keyword, schemaPart = '', bracketContent, leftColumn, rhs) => {
//       try {
//         const schema = schemaPart ? schemaPart.replace(/\.$/, '') : '';
//         const up = (bracketContent || '').toUpperCase();
//         const onIndex = up.lastIndexOf(' ON ');
//         if (onIndex === -1) return match;

//         const beforeOn = bracketContent.slice(0, onIndex).trim();
//         const afterOn = bracketContent.slice(onIndex + 4).trim();

//         const beforeTokens = beforeOn.split(/\s+/).filter(Boolean);
//         let alias = '';
//         let tableName = beforeOn;
//         if (beforeTokens.length > 1) {
//           alias = beforeTokens.pop()!;
//           tableName = beforeTokens.join(' ');
//         }

//         const formattedTable = formatTableNameForSQLServer(schema ? `${schema}.${tableName}` : tableName);

//         const sanitizedAfterOn = afterOn.replace(/^\.+/, '');
//         const sanitizedRhs = rhs.replace(/^\.+/, '');

//         if (alias) return `${keyword} ${formattedTable} ${alias} ON ${sanitizedAfterOn}.${leftColumn} = ${sanitizedRhs}`;
//         return `${keyword} ${formattedTable} ON ${sanitizedAfterOn}.${leftColumn} = ${sanitizedRhs}`;
//       } catch (e) {
//         return match;
//       }
//     });

//     // Pattern: JOIN schema.[Table Alias].Col = rhs  => move alias out of brackets
//     const bracketAliasPattern = /(\bFROM|\bJOIN)\s+([A-Za-z_][A-ZaZ0-9_]*\.)?\[([^\]]*?)\]\.?(?:([A-Za-z_][A-ZaZ0-9_]*)\s*)?\s*=\s*([^\s;]+)/gi;
//     query = query.replace(bracketAliasPattern, (match, keyword, schemaPart = '', bracketContent, leftColumnMaybe, rhs) => {
//       try {
//         const schema = schemaPart ? schemaPart.replace(/\.$/, '') : '';
//         const tokens = (bracketContent || '').trim().split(/\s+/).filter(Boolean);
//         let alias = '';
//         let tableName = bracketContent || '';
//         if (tokens.length > 1) {
//           alias = tokens.pop()!;
//           tableName = tokens.join(' ');
//         }

//         const leftColumn = leftColumnMaybe && leftColumnMaybe.length ? leftColumnMaybe : (rhs.split('.')[1] || '');
//         if (!leftColumn) return match; // If we can't determine the left column, leave it alone

//         const formattedTable = formatTableNameForSQLServer(schema ? `${schema}.${tableName}` : tableName);

//         if (alias) return `${keyword} ${formattedTable} ${alias} ON ${alias}.${leftColumn} = ${rhs}`;
//         // If no alias, use the table name as the qualifier
//         return `${keyword} ${formattedTable} ON ${tableName}.${leftColumn} = ${rhs}`;
//       } catch (e) {
//         return match;
//       }
//     });
    
//   } while (query !== prev);

//   return query;
// }

// // Fix aggregate calculations where CTEs or derived tables would produce cleaner results
// export function fixAggregateCalculations(query: string): string {
//   // Detect and warn about nested aggregations in SELECT
//   const nestedAggsPattern = /SELECT\s+.*?\bSUM\s*\(\s*SUM\s*\(/i;
//   if (nestedAggsPattern.test(query)) {
//     console.log('WARNING: Detected nested aggregations. This may cause SQL errors. Consider using CTEs or derived tables.');
//   }

//   return query;
// }

// // Create a meaningful context for queries based on the tables involved
// export const inferContextFromTables = (tables: string[]): string => {
//   // Trivial implementation for now, will be enhanced in the schema analyzer
//   return tables.join(', ');
// };

// // Extract the key business logic context from the query
// export const extractMeaningfulContext = (content: string): string => {
//   return content;
// };

// // Helper to extract context for aggregate operations
// const extractAggregateContext = (queryUpper: string, func: string, tables: string[]): string => {
//   let resultContext = '';
  
//   // Find what's being aggregated, and try to provide better labels
//   const countPattern = new RegExp(`${func}\\s*\\(\\s*(.*?)\\s*\\)`, 'i');
//   const countMatch = queryUpper.match(countPattern);
//   if (countMatch) {
//     const countTarget = countMatch[1].trim();
//     if (countTarget === '*') {
//       resultContext += `${func} of all rows `;
//     } else {
//       resultContext += `${func} of ${countTarget} `;
//     }
//   }

//   // Look for GROUP BY to understand dimensions of analysis
//   const groupByPattern = /GROUP\s+BY\s+(.*?)(?:\s+HAVING|\s+ORDER|\s+LIMIT|\s*$)/i;
//   const groupByMatch = queryUpper.match(groupByPattern);
//   if (groupByMatch) {
//     const groupings = groupByMatch[1].split(',').map(g => g.trim());
//     resultContext += `grouped by ${groupings.join(', ')} `;
//   }

//   return resultContext;
// };

// // Fix TOP with OFFSET patterns - SQL Server doesn't allow both in the same statement
// export function fixTopWithTiesAndOffset(query: string): string {
//   const regexTopWithOffset = /SELECT\s+TOP\s+\d+(?:\s+PERCENT)?(?:\s+WITH\s+TIES)?\s+.*?\bOFFSET\b/is;
  
//   if (regexTopWithOffset.test(query)) {
//     console.log('Detected TOP with OFFSET conflict, attempting to fix...');
    
//     // Replace TOP with a comment and keep OFFSET/FETCH for paging
//     return query.replace(/SELECT\s+TOP\s+\d+(?:\s+PERCENT)?(?:\s+WITH\s+TIES)?\s+/ig, 
//       match => `SELECT /* ${match.trim()} converted */ `);
//   }
  
//   return query;
// }

// // Clean SQL query - apply generic SQL Server-compatible normalizations
// export const cleanSQLQuery = (sqlQuery: string): string => {
//   if (!sqlQuery) return '';
//   let query = sqlQuery.trim();
  
//   // 1) Format/clean table names in FROM/JOIN clauses
//   query = formatTableNamesInQuery(query);
  
//   // 2) Fix malformed JOIN clauses (a common issue with LLM output)
//   query = fixMalformedJoins(query);
  
//   // 3) Fix aggregate calculations (avoid nesting aggregates)
//   query = fixAggregateCalculations(query);
  
//   // 4) Fix TOP with TIES and OFFSET conflicts
//   query = fixTopWithTiesAndOffset(query);
  
//   // 5) Fix bracket patterns around alias names [Table].[Column] AS [Alias] -> should be without brackets on alias
//   query = query.replace(/\bAS\s+\[([^\]]+)\]/g, (match, alias) => `AS ${alias}`);
  
//   // 6) Fix TOP vs OFFSET conflict (SQL Server doesn't allow both in the same query/subquery)
//   const topOffsetRegex = /SELECT\s+TOP\s+\d+(?:\s+PERCENT)?\s+.*\b(?:OFFSET\s+\d+\s+ROWS(?:\s+FETCH\s+(?:FIRST|NEXT)\s+\d+\s+ROWS\s+ONLY)?)/gi;
//   query = query.replace(topOffsetRegex, (match) => {
//     // Convert TOP N to OFFSET 0 ROWS FETCH FIRST N ROWS ONLY
//     const topMatch = match.match(/TOP\s+(\d+)(?:\s+PERCENT)?/i);
//     if (topMatch) {
//       const limit = topMatch[1];
//       // Remove the TOP clause and keep the OFFSET/FETCH part
//       return match.replace(/TOP\s+\d+(?:\s+PERCENT)?/i, '/* TOP removed due to OFFSET/FETCH */');
//     }
//     return match;
//   });
  
//   // 7) Ensure query ends with semicolon
//   if (!query.endsWith(';')) {
//     query += ';';
//   }
  
//   return query;
// };

// // Validate and clean a SQL query - apply all checks and fixes
// export const validateAndCleanQuery = (sqlQuery: string): string => {
//   console.log('validateAndCleanQuery INPUT:', sqlQuery);

//   if (!sqlQuery || typeof sqlQuery !== 'string') {
//     throw new Error('Invalid SQL query');
//   }

//   let cleaned = cleanSQLQuery(sqlQuery);
//   console.log('validateAndCleanQuery OUTPUT:', cleaned);
//   return cleaned;
// };

// // Get a more readable/contextual label for displaying column names
// export const getContextualLabel = (columnName: string): string => {
//   // Remove common prefixes/suffixes and format for display
//   return columnName
//     .replace(/([A-Z])/g, ' $1') // Insert space before capitals
//     .replace(/^[a-z]/, match => match.toUpperCase()) // Capitalize first letter
//     .replace(/_/g, ' ') // Replace underscores with spaces
//     .replace(/Id$|ID$/, ' ID') // Format ID suffix
//     .replace(/([a-z])([A-Z])/g, '$1 $2') // Add space between camelCase
//     .trim();
// };

// // Format a column name for display
// export const formatColumnName = (name: string): string => {
//   return getContextualLabel(name);
// };

// // Format a single value for display
// export const formatSingleValue = (v: any): string => {
//   if (v === null || v === undefined) return 'N/A';
  
//   if (v instanceof Date) {
//     return v.toLocaleDateString();
//   }
  
//   if (typeof v === 'number') {
//     // Format large numbers with commas
//     if (Math.abs(v) >= 1000) {
//       return v.toLocaleString();
//     }
//     // Use up to 2 decimal places for floating point
//     if (v % 1 !== 0) {
//       return v.toFixed(2);
//     }
//   }
  
//   if (typeof v === 'boolean') {
//     return v ? 'Yes' : 'No';
//   }
  
//   return String(v);
// };

// export const formatDisplayValue = (v: any): string => formatSingleValue(v);

// // Return a simple HTML table representation of results (keeps it minimal)
// export const formatResultsAsHTMLTable = (results: any[], keys: string[], total: number, _sqlQuery?: string): string => {
//   if (!results || !results.length) return 'No data.';
//   const header = keys.map(k => `<th>${formatColumnName(k)}</th>`).join('');
//   const rows = results.slice(0, 100).map(row => {
//     const cols = keys.map(k => `<td>${formatSingleValue(row[k])}</td>`).join('');
//     return `<tr>${cols}</tr>`;
//   }).join('');
//   const table = `<table border="1" cellspacing="0" cellpadding="4"><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table>`;
//   const more = total > results.length ? `<div>Showing ${results.length} of ${total} rows.</div>` : '';
//   return `${table}${more}`;
// };

// // Handle SQL errors and return a user-friendly, context-aware string
// export const handleSQLErrorMessage = (error: any): string => {
//   try {
//     if (!error) return 'An unknown SQL error occurred.';
//     const msg = error.message || error.toString();
//     const errorLower = msg.toLowerCase();
    
//     // Initialize an empty schema context - we'll use simple error handling 
//     // instead of trying to dynamically load context
//     const schemaContext: Record<string, any> = {};
    
//     // Dynamic error analysis and suggestions
//     let enhancedMessage = `❌ SQL Error: ${msg}`;
    
//     // Common error patterns with schema-aware solutions
//     if (errorLower.includes('invalid object name') || errorLower.includes('invalid table name')) {
//       // Extract the invalid table name
//       const tableMatch = msg.match(/['"\[]([^\]'"]+)['"\]]/);
//       const invalidTable = tableMatch ? tableMatch[1] : '';
      
//       if (invalidTable) {
//         // Find similar table names in the schema using basic string similarity
//         const availableTables = Object.keys(schemaContext);
        
//         const similarTables = availableTables.filter(t => {
//           // Simple similarity check - share at least 3 consecutive characters
//           const tableLower = t.toLowerCase();
//           const invalidLower = invalidTable.toLowerCase();
          
//           for (let i = 0; i <= tableLower.length - 3; i++) {
//             const chunk = tableLower.substring(i, i + 3);
//             if (invalidLower.includes(chunk)) return true;
//           }
//           return false;
//         });
        
//         if (similarTables.length > 0) {
//           enhancedMessage += `\n\nThe table "${invalidTable}" doesn't exist. Did you mean one of these tables?\n- ${similarTables.join('\n- ')}`;
//         } else {
//           enhancedMessage += `\n\nThe table "${invalidTable}" doesn't exist in the database. Check the table name and try again.`;
//         }
//       }
//     }
//     else if (errorLower.includes('column') && (errorLower.includes('unknown') || errorLower.includes('invalid') || errorLower.includes('not found'))) {
//       // Column-related errors
//       const colMatch = msg.match(/['"]([^'"]+)['"]/);
//       const ambiguousColumn = colMatch ? colMatch[1] : '';
      
//       if (ambiguousColumn) {
//         // Find tables that contain this column name
//         const tablesWithColumn: string[] = [];
        
//         Object.entries(schemaContext).forEach(([table, columns]) => {
//           const hasColumn = (columns as any[]).some((col: any) => 
//             col.name.toLowerCase() === ambiguousColumn.toLowerCase()
//           );
          
//           if (hasColumn) {
//             tablesWithColumn.push(table);
//           }
//         });
        
//         if (tablesWithColumn.length > 0) {
//           enhancedMessage += `\n\nColumn "${ambiguousColumn}" exists in multiple tables. Qualify it with the table name or alias:\n- ${tablesWithColumn.map(t => `${t}.${ambiguousColumn}`).join('\n- ')}`;
//         }
//       }
//     }
//     else if (errorLower.includes('syntax error') || errorLower.includes('incorrect syntax')) {
//       // General syntax error suggestions
//       enhancedMessage += `\n\nThis appears to be a syntax error. Common causes include:
// - Missing or mismatched parentheses
// - Incorrect JOIN syntax
// - Missing commas between columns
// - Using incorrect SQL dialect features`;
//     }
//     else if (errorLower.includes('aggregate function') && errorLower.includes('subquery')) {
//       // Aggregate function with subquery errors
//       enhancedMessage += `\n\nSQL Server cannot process an aggregate function (SUM, COUNT, AVG, etc.) that contains a subquery.
// Consider these solutions:
// - Move the subquery to a JOIN
// - Create a CTE (Common Table Expression) for the subquery
// - Use a derived table or temporary table
// - Calculate aggregated values separately`;
//     }
    
//     return enhancedMessage;
//   } catch (e) {
//     return `Error: ${error}`;
//   }
// };
