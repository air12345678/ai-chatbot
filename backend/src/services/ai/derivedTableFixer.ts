/**
 * SQL Server Derived Table Scope Fixer
 * 
 * This module provides functions to automatically detect and fix common derived table scope issues,
 * particularly those related to table references in outer queries that should be using the derived table alias.
 */

/**
 * Fixes derived table scope issues in SQL queries, where column references in outer queries
 * incorrectly reference the original table rather than the derived table alias.
 * 
 * Common errors fixed:
 * - "The multi-part identifier 'TableName.ColumnName' could not be bound" in derived table contexts
 * 
 * @param {string} sqlQuery - The SQL query to fix
 * @return {Object} - Result containing the fixed query and any warnings
 */
export function fixDerivedTableScopeIssues(sqlQuery: string): { 
  fixedQuery: string;
  warnings: string[];
} {
  const warnings: string[] = [];
  if (!sqlQuery) return { fixedQuery: sqlQuery, warnings };
  
  let fixedQuery = sqlQuery;
  
  // Pattern to find derived tables with their aliases - improved to handle more complex patterns
  // This matches: FROM (SELECT ...) [AS] alias - capturing the entire subquery content
  const derivedTablePattern = /\bFROM\s+\(\s*(?:WITH\s+[\s\S]*?)?SELECT\b[\s\S]*?\)\s+(?:AS\s+)?(\w+)/gis;
  let match;
  
  // Collect all derived table aliases
  const derivedTables: {
    alias: string;
    tableReferences: string[];
    fullMatch: string;
    subquery: string;
    startPos: number; // Track position for better context analysis
    endPos: number;   // Track end position
  }[] = [];
  
  while ((match = derivedTablePattern.exec(sqlQuery)) !== null) {
    const fullMatch = match[0];
    const derivedTableAlias = match[1];
    
    // Extract the subquery content
    const subqueryStart = fullMatch.indexOf('(') + 1;
    const subqueryContent = extractBalancedSubstring(fullMatch.substring(subqueryStart));
    
    // Find table references in the subquery
    const tableReferences = findTableReferences(subqueryContent);
    
    derivedTables.push({
      alias: derivedTableAlias,
      tableReferences,
      fullMatch: match[0],
      subquery: subqueryContent,
      startPos: match.index || 0,
      endPos: (match.index || 0) + match[0].length
    });
  }

  // Also look for CTE (Common Table Expressions) as they act like derived tables
  const ctePattern = /\bWITH\s+(\w+)(?:\s*\([^)]*\))?\s+AS\s*\(\s*SELECT\b.*?\)/gis;
  while ((match = ctePattern.exec(sqlQuery)) !== null) {
    const fullMatch = match[0];
    const cteName = match[1];
    
    // Extract the CTE content (everything inside the parentheses after AS)
    const asIndex = fullMatch.toUpperCase().indexOf(' AS ');
    const cteStart = fullMatch.indexOf('(', asIndex) + 1;
    const cteContent = extractBalancedSubstring(fullMatch.substring(cteStart));
    
    // Find table references in the CTE
    const tableReferences = findTableReferences(cteContent);
    
    derivedTables.push({
      alias: cteName,
      tableReferences,
      fullMatch: match[0],
      subquery: cteContent,
      startPos: match.index || 0,
      endPos: (match.index || 0) + match[0].length
    });
  }
  
  // Process nested CTEs - find CTEs that reference other CTEs
  for (const derivedTable of derivedTables) {
    const otherCTEReferences = derivedTables
      .filter(dt => dt.alias !== derivedTable.alias)
      .filter(dt => derivedTable.subquery.includes(dt.alias));
    
    for (const referencedCTE of otherCTEReferences) {
      // Add the tables referenced by the referenced CTE to this CTE's references
      derivedTable.tableReferences = [
        ...derivedTable.tableReferences,
        ...referencedCTE.tableReferences
      ];
    }
  }
  
  // For each derived table, look for references to original tables in outer query
  // and replace them with the derived table alias
  for (const derivedTable of derivedTables) {
    const alias = derivedTable.alias;
    const tables = derivedTable.tableReferences;
    
    // Skip if we couldn't find the tables or alias
    if (!alias || !tables || tables.length === 0) continue;
    
    // Find context after this derived table definition
    // Use the tracked positions for more accurate context determination
    const contextAfterDerivedTable = sqlQuery.substring(derivedTable.endPos);
    
    // For each original table reference, check if it's used incorrectly
    for (const table of tables) {
      // Look for patterns like "Table.Column" where Table is an original table name
      // that should be using the derived table alias instead
      const incorrectReferencePattern = new RegExp(`\\b${table}\\.([\\w\\[\\]]+)\\b`, 'gi');
      
      // Find all references in the remaining SQL
      let refMatch;
      while ((refMatch = incorrectReferencePattern.exec(contextAfterDerivedTable)) !== null) {
        const originalReference = refMatch[0];
        const columnName = refMatch[1];
        const correctedReference = `${alias}.${columnName}`;
        
        warnings.push(`Fixed table reference: ${originalReference} -> ${correctedReference}`);
        
        // Replace in the full query
        fixedQuery = fixedQuery.replace(
          new RegExp(`\\b${table}\\.${columnName}\\b`, 'g'), 
          `${alias}.${columnName}`
        );
      }
    }
  }
  
  // Special case for GROUP BY clauses with source table references
  // instead of derived table aliases
  const groupByPattern = /GROUP\s+BY\s+([^,]+)(?:,\s*([^,]+))*?(?:$|WHERE|HAVING|ORDER|UNION|;)/gis;
  for (const derivedTable of derivedTables) {
    let groupByMatch;
    while ((groupByMatch = groupByPattern.exec(fixedQuery)) !== null) {
      const groupByClause = groupByMatch[0];
      let modifiedClause = groupByClause;
      
      // Check each column in the GROUP BY
      for (const table of derivedTable.tableReferences) {
        const tableRefPattern = new RegExp(`\\b${table}\\.([\\w\\[\\]]+)\\b`, 'gi');
        let colMatch;
        
        while ((colMatch = tableRefPattern.exec(groupByClause)) !== null) {
          const originalRef = colMatch[0];
          const columnName = colMatch[1];
          const correctedRef = `${derivedTable.alias}.${columnName}`;
          
          warnings.push(`Fixed table reference in GROUP BY: ${originalRef} -> ${correctedRef}`);
          modifiedClause = modifiedClause.replace(originalRef, correctedRef);
        }
      }
      
      if (modifiedClause !== groupByClause) {
        fixedQuery = fixedQuery.replace(groupByClause, modifiedClause);
      }
    }
  }
  
  // Special case for PARTITION BY clauses with source table references
  // instead of derived table aliases
  const partitionByPattern = /PARTITION\s+BY\s+([^)]+)/gi;
  for (const derivedTable of derivedTables) {
    let partitionMatch;
    while ((partitionMatch = partitionByPattern.exec(fixedQuery)) !== null) {
      const partitionClause = partitionMatch[0];
      let modifiedClause = partitionClause;
      
      // Check each column in the PARTITION BY
      for (const table of derivedTable.tableReferences) {
        const tableRefPattern = new RegExp(`\\b${table}\\.([\\w\\[\\]]+)\\b`, 'gi');
        let colMatch;
        
        while ((colMatch = tableRefPattern.exec(partitionClause)) !== null) {
          const originalRef = colMatch[0];
          const columnName = colMatch[1];
          const correctedRef = `${derivedTable.alias}.${columnName}`;
          
          warnings.push(`Fixed table reference in PARTITION BY: ${originalRef} -> ${correctedRef}`);
          modifiedClause = modifiedClause.replace(originalRef, correctedRef);
        }
      }
      
      if (modifiedClause !== partitionClause) {
        fixedQuery = fixedQuery.replace(partitionClause, modifiedClause);
      }
    }
  }
  
  // Enhance GROUP BY fixing to handle more complex patterns and square brackets
  const enhancedGroupByPattern = /GROUP\s+BY\s+(?:\[?(\w+)\]?\.\[?(\w+)\]?)(?:,\s*(?:\[?(\w+)\]?\.\[?(\w+)\]?))*?(?:$|WHERE|HAVING|ORDER|UNION|;)/gis;
  let gbMatch;
  
  while ((gbMatch = enhancedGroupByPattern.exec(fixedQuery)) !== null) {
    const fullGroupByClause = gbMatch[0];
    let modifiedGroupByClause = fullGroupByClause;
    
    // Extract all table.column references from GROUP BY
    const groupByColumns = fullGroupByClause.match(/\[?(\w+)\]?\.\[?(\w+)\]?/g) || [];
    
    for (const columnRef of groupByColumns) {
      // Extract table and column names with or without brackets
      const tableColMatch = columnRef.match(/\[?(\w+)\]?\.\[?(\w+)\]?/);
      if (!tableColMatch) continue;
      
      const tableName = tableColMatch[1];
      const columnName = tableColMatch[2];
      
      // Find if this table is referenced in any derived table
      for (const derivedTable of derivedTables) {
        if (derivedTable.tableReferences.includes(tableName)) {
          const originalRef = columnRef;
          // Preserve bracket style in the replacement
          const hasTableBrackets = originalRef.includes(`[${tableName}]`);
          const hasColBrackets = originalRef.includes(`[${columnName}]`);
          
          const correctedRef = hasTableBrackets || hasColBrackets ? 
            `${derivedTable.alias}.[${columnName}]` : 
            `${derivedTable.alias}.${columnName}`;
          
          warnings.push(`Fixed dynamic table reference in GROUP BY: ${originalRef} -> ${correctedRef}`);
          modifiedGroupByClause = modifiedGroupByClause.replace(
            new RegExp(originalRef.replace(/[[\]]/g, '\\$&'), 'gi'), 
            correctedRef
          );
        }
      }
    }
    
    if (modifiedGroupByClause !== fullGroupByClause) {
      fixedQuery = fixedQuery.replace(fullGroupByClause, modifiedGroupByClause);
    }
  }
  
  // Enhance WHERE clause fixing for derived tables
  const whereClausePattern = /WHERE\s+([^;)]+?)(?:GROUP\s+BY|ORDER\s+BY|HAVING|;|\))/gis;
  for (const derivedTable of derivedTables) {
    let whereMatch;
    while ((whereMatch = whereClausePattern.exec(fixedQuery)) !== null) {
      const whereClause = whereMatch[0];
      let modifiedClause = whereClause;
      
      // Check for table references in WHERE conditions
      for (const table of derivedTable.tableReferences) {
        const tableRefPattern = new RegExp(`\\b${table}\\.([\\w\\[\\]]+)\\b`, 'gi');
        let colMatch;
        
        while ((colMatch = tableRefPattern.exec(whereClause)) !== null) {
          const originalRef = colMatch[0];
          const columnName = colMatch[1];
          
          // Only replace if this table reference is in the outer query scope
          const refPosition = sqlQuery.indexOf(originalRef);
          if (refPosition > derivedTable.endPos) {
            const correctedRef = `${derivedTable.alias}.${columnName}`;
            warnings.push(`Fixed table reference in WHERE clause: ${originalRef} -> ${correctedRef}`);
            modifiedClause = modifiedClause.replace(originalRef, correctedRef);
          }
        }
      }
      
      if (modifiedClause !== whereClause) {
        fixedQuery = fixedQuery.replace(whereClause, modifiedClause);
      }
    }
  }

  // Fix ON clauses in JOIN conditions that reference original tables
  const joinOnPattern = /\bJOIN\s+[^\s]+(?:\s+(?:AS\s+)?(\w+))?\s+ON\s+([^)]+?)(?:WHERE|GROUP\s+BY|ORDER\s+BY|LEFT|RIGHT|INNER|OUTER|JOIN|;|\))/gis;
  for (const derivedTable of derivedTables) {
    let joinMatch;
    while ((joinMatch = joinOnPattern.exec(fixedQuery)) !== null) {
      const joinClause = joinMatch[0];
      let modifiedClause = joinClause;
      
      // Check for table references in JOIN ON conditions
      for (const table of derivedTable.tableReferences) {
        const tableRefPattern = new RegExp(`\\b${table}\\.([\\w\\[\\]]+)\\b`, 'gi');
        let colMatch;
        
        while ((colMatch = tableRefPattern.exec(joinClause)) !== null) {
          const originalRef = colMatch[0];
          const columnName = colMatch[1];
          
          // Only replace if this JOIN is after the derived table definition
          const joinPosition = sqlQuery.indexOf(joinClause);
          if (joinPosition > derivedTable.endPos) {
            const correctedRef = `${derivedTable.alias}.${columnName}`;
            warnings.push(`Fixed table reference in JOIN condition: ${originalRef} -> ${correctedRef}`);
            modifiedClause = modifiedClause.replace(originalRef, correctedRef);
          }
        }
      }
      
      if (modifiedClause !== joinClause) {
        fixedQuery = fixedQuery.replace(joinClause, modifiedClause);
      }
    }
  }
  
  return { fixedQuery, warnings };
}

/**
 * Complete SQL validation and derived table scope fix
 * This is a higher-level function that combines checks and fixes for various derived table issues
 * 
 * @param {string} sqlQuery - SQL query to validate and fix
 * @return {Object} - Result with fixed query and warnings
 */
export function validateAndFixDerivedTableIssues(sqlQuery: string): {
  isValid: boolean;
  fixedQuery: string;
  warnings: string[];
} {
  const warnings: string[] = [];
  
  try {
    // Detect potential derived table scope issues
    if (sqlQuery.match(/FROM\s+\(\s*SELECT[\s\S]*?\)\s+AS\s+(\w+)[\s\S]*?GROUP\s+BY/i)) {
      warnings.push('Detected potential derived table scope issues, applying scope binding fixes');
    }
    
    // Apply the fixes
    const { fixedQuery, warnings: fixWarnings } = fixDerivedTableScopeIssues(sqlQuery);
    warnings.push(...fixWarnings);
    
    return {
      isValid: true,
      fixedQuery,
      warnings
    };
  }
  catch (error) {
    return {
      isValid: false,
      fixedQuery: sqlQuery,
      warnings: [`Error fixing derived table scope issues: ${error instanceof Error ? error.message : String(error)}`]
    };
  }
}

/**
 * Extract a substring with balanced parentheses starting from the given string
 * Assumes the opening parenthesis is already excluded from the input
 * 
 * @param str - The string to extract from (starting after the opening parenthesis)
 * @returns The substring with balanced parentheses
 */
function extractBalancedSubstring(str: string): string {
  let depth = 1; // Start with depth 1 as we've already consumed the opening parenthesis
  let i = 0;
  
  for (i = 0; i < str.length; i++) {
    if (str[i] === '(') {
      depth++;
    } else if (str[i] === ')') {
      depth--;
      if (depth === 0) {
        return str.substring(0, i);
      }
    }
  }
  
  // If we get here, parentheses weren't balanced
  return str;
}

/**
 * Find table references in a SQL query
 * 
 * @param sqlQuery - The SQL query to search for table references
 * @returns Array of table names referenced in the query
 */
function findTableReferences(sqlQuery: string): string[] {
  const references = new Set<string>();
  
  // Find FROM and JOIN clauses
  const fromPattern = /\bFROM\s+([^\s,(]+)(?:\s+(?:AS\s+)?(\w+))?/gi;
  const joinPattern = /\bJOIN\s+([^\s,(]+)(?:\s+(?:AS\s+)?(\w+))?/gi;
  
  let match;
  while ((match = fromPattern.exec(sqlQuery)) !== null) {
    references.add(match[1].replace(/[\[\]]/g, ''));
  }
  
  while ((match = joinPattern.exec(sqlQuery)) !== null) {
    references.add(match[1].replace(/[\[\]]/g, ''));
  }
  
  return Array.from(references);
}
