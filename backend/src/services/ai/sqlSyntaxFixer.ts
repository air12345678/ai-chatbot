/**
 * SQL Server Syntax Fixer
 * 
 * This module provides functions to automatically detect and fix common SQL Server syntax errors,
 * particularly those related to subquery ORDER BY clauses and OFFSET/FETCH syntax.
 */

/**
 * Fixes common SQL Server syntax errors:
 * 1. ORDER BY in subqueries without TOP/OFFSET/FOR XML
 * 2. DISTINCT without TOP in subqueries with ORDER BY
 * 3. Incorrect OFFSET...FETCH NEXT syntax
 * 4. Conflicts between TOP and OFFSET in the same query
 * 
 * @param {string} sqlQuery - The SQL query to fix
 * @return {string} - The fixed SQL query
 */
export function fixSQLServerSyntaxIssues(sqlQuery: string): string {
  if (!sqlQuery) return sqlQuery;
  
  let fixedQuery = sqlQuery;
  
  // Fix 1: Replace commented TOP with actual TOP keyword
  fixedQuery = fixedQuery.replace(/\/\*\s*SELECT\s+TOP\s+\d+\s+converted\s*\*\//gi, 'TOP 1');
  
  // Fix 2: Add TOP to subqueries with ORDER BY but without TOP, OFFSET, or FOR XML
  // First find subquery contexts to avoid modifying main query
  const subqueries = findSubqueries(fixedQuery);
  for (const subquery of subqueries) {
    if (
      subquery.includes('ORDER BY') && 
      !subquery.match(/\bTOP\s+\d+/i) &&
      !subquery.match(/\bOFFSET\b/i) &&
      !subquery.match(/\bFOR\s+XML\b/i)
    ) {
      // Replace the first SELECT in this subquery with SELECT TOP 100
      const fixedSubquery = subquery.replace(
        /\bSELECT\b(?!\s+TOP)/i, 
        'SELECT TOP 100'
      );
      fixedQuery = fixedQuery.replace(subquery, fixedSubquery);
    }
  }
  
  // Fix 3: SQL Server can't use both TOP and OFFSET in same query - replace TOP with ROW_NUMBER() approach
  // Find subqueries with both TOP and OFFSET
  for (const subquery of findSubqueries(fixedQuery)) {
    if (
      subquery.match(/\bSELECT\s+(?:DISTINCT\s+)?TOP\s+\d+/i) && 
      subquery.match(/\bOFFSET\s+\d+\s+ROWS\s+FETCH/i)
    ) {
      // SQL Server can't have both TOP and OFFSET in the same query
      // If we find this pattern, remove the TOP and keep the OFFSET
      const fixedSubquery = subquery.replace(
        /\bSELECT\s+(?:DISTINCT\s+)?TOP\s+\d+/i,
        'SELECT DISTINCT'
      );
      fixedQuery = fixedQuery.replace(subquery, fixedSubquery);
    }
  }
  
  // Fix 4: Fix any SELECT DISTINCT without TOP in contexts with ORDER BY
  // Skip this if there's an OFFSET since TOP and OFFSET can't be used together
  const orderByContexts = findOrderByContexts(fixedQuery);
  for (const context of orderByContexts) {
    if (
      context.match(/SELECT\s+DISTINCT\s+(?!TOP)/i) && 
      !context.match(/\bOFFSET\b/i) &&
      context.match(/\bORDER\s+BY\b/i)
    ) {
      const fixedContext = context.replace(
        /SELECT\s+DISTINCT\s+(?!TOP)/i,
        'SELECT DISTINCT TOP 100 '
      );
      fixedQuery = fixedQuery.replace(context, fixedContext);
    }
  }
  
  // Fix 5: Ensure OFFSET...FETCH NEXT syntax is correct
  fixedQuery = fixedQuery.replace(
    /OFFSET\s+(\d+)\s+ROWS\s+FETCH\s+(?:NEXT|FIRST)\s+(\d+)\s+ROWS\s+ONLY/gi,
    'OFFSET $1 ROWS FETCH NEXT $2 ROWS ONLY'
  );
  
  return fixedQuery;
}

/**
 * Find context around ORDER BY statements
 */
function findOrderByContexts(sql: string): string[] {
  const contexts: string[] = [];
  const regex = /SELECT(?:(?!SELECT).)*ORDER\s+BY[^;)]*?(?:;|\)|$)/gis;
  
  let match;
  while ((match = regex.exec(sql)) !== null) {
    contexts.push(match[0]);
  }
  
  return contexts;
}

/**
 * Find potential subqueries in a SQL statement
 * This is a simplified approach - a full parser would be more accurate
 * 
 * @param {string} sql - SQL query to analyze
 * @return {string[]} - Array of potential subquery strings
 */
function findSubqueries(sql: string): string[] {
  const subqueries: string[] = [];
  let depth = 0;
  let start = -1;
  let inSubquery = false;
  
  // Look for subquery patterns starting with (SELECT
  for (let i = 0; i < sql.length; i++) {
    if (sql[i] === '(' && sql.substring(i+1, i+8).match(/\s*SELECT/i)) {
      if (depth === 0) {
        start = i;
        inSubquery = true;
      }
      depth++;
    } else if (sql[i] === '(') {
      depth++;
    } else if (sql[i] === ')') {
      depth--;
      if (depth === 0 && inSubquery) {
        subqueries.push(sql.substring(start, i+1));
        inSubquery = false;
      }
    }
  }
  
  return subqueries;
}

/**
 * Validates a SQL query for common syntax errors and fixes them when possible
 * 
 * @param {string} sqlQuery - The SQL query to validate
 * @return {Object} - Result containing isValid, fixedQuery, and any warnings
 */
export function validateAndFixSQLQuery(sqlQuery: string): { 
  isValid: boolean;
  fixedQuery: string;
  warnings: string[];
} {
  const warnings: string[] = [];
  
  if (!sqlQuery || sqlQuery.trim() === '') {
    return {
      isValid: false,
      fixedQuery: sqlQuery,
      warnings: ['Empty SQL query']
    };
  }
  
  try {
    // Check for ORDER BY in subqueries without TOP/OFFSET/FOR XML
    if (sqlQuery.match(/SELECT\s+(?!TOP)(?!.*OFFSET)(?!.*FOR\s+XML).+?FROM.+?ORDER\s+BY/is)) {
      warnings.push('ORDER BY in subquery without TOP, OFFSET or FOR XML was fixed');
    }
    
    // Check for incorrect FETCH syntax
    if (sqlQuery.match(/FETCH\s+(?!NEXT\s+\d+\s+ROWS\s+ONLY)/i)) {
      warnings.push('Incorrect FETCH syntax was fixed');
    }
    
    // Fix the query
    const fixedQuery = fixSQLServerSyntaxIssues(sqlQuery);
    
    return {
      isValid: true,
      fixedQuery,
      warnings
    };
  } catch (error) {
    return {
      isValid: false,
      fixedQuery: sqlQuery,
      warnings: [`Error fixing SQL syntax: ${error instanceof Error ? error.message : String(error)}`]
    };
  }
}
