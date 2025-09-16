/**
 * sqlQueryFixer.ts
 * 
 * A utility to dynamically fix common SQL errors, particularly issues with
 * GROUP BY clauses and aggregation functions.
 */

export interface SQLFixOptions {
  /**
   * Whether to automatically add missing GROUP BY columns
   */
  autoFixGroupBy?: boolean;
  
  /**
   * Whether to attempt restructuring with CTEs to avoid GROUP BY issues
   */
  useCteRestructuring?: boolean;
  
  /**
   * Whether to log the fixes made
   */
  verbose?: boolean;
}

/**
 * Dynamically fixes common SQL query problems like missing GROUP BY columns
 * and aggregation function issues
 * 
 * @param sqlQuery - The original SQL query to fix
 * @param options - Configuration options for the fixer
 * @returns Fixed SQL query
 */
export function fixSqlQuery(sqlQuery: string, options: SQLFixOptions = {}): string {
  // Default options
  const opts = {
    autoFixGroupBy: true,
    useCteRestructuring: true,
    verbose: true,
    ...options
  };
  
  let fixedQuery = sqlQuery;
  let fixesApplied = false;
  
  // Track if we've made any changes
  const changes: string[] = [];

  // Check for potential GROUP BY issues with aggregates
  if (opts.useCteRestructuring && hasGroupByAggregationIssue(fixedQuery)) {
    fixedQuery = restructureWithCte(fixedQuery);
    changes.push("Restructured query to use CTE for aggregation");
    fixesApplied = true;
  }

  // Log fixes if verbose
  if (opts.verbose && fixesApplied) {
    console.log("SQL Query Fixes Applied:");
    changes.forEach(change => console.log(`- ${change}`));
  }

  return fixedQuery;
}

/**
 * Detects if a query likely has GROUP BY aggregation issues
 * by looking for key patterns
 */
function hasGroupByAggregationIssue(query: string): boolean {
  // Common pattern: SELECT with aggregate function alongside non-aggregated columns without GROUP BY
  const hasAggregateFunction = /\b(AVG|SUM|MAX|MIN|COUNT)\s*\(/i.test(query);
  const hasSelectWithoutAggregation = /\bSELECT\b(?:(?!\bGROUP\s+BY\b).)*\b(AVG|SUM|MAX|MIN|COUNT)\s*\(/is.test(query);
  
  return hasAggregateFunction && hasSelectWithoutAggregation;
}

/**
 * Restructures a query that might have GROUP BY issues by splitting
 * the aggregations into a separate CTE
 */
function restructureWithCte(query: string): string {
  // This is a simplified implementation - a production version would need more robust parsing
  
  // If already has WITH, append to existing CTEs
  if (/\bWITH\b/i.test(query)) {
    // Extract the final SELECT statement
    const selectMatch = query.match(/(?:.*?)(\s*SELECT\s+(?:.|\s)+)$/is);
    if (!selectMatch) return query;
    
    const baseQuery = query.replace(selectMatch[1], '');
    const selectPart = selectMatch[1];
    
    // Extract aggregate functions
    const aggregateFunctions = extractAggregateFunctions(selectPart);
    if (aggregateFunctions.length === 0) return query;
    
    // Create new CTE for aggregations
    const aggregationCte = createAggregationCte(selectPart, aggregateFunctions);
    
    // Build the new query with the additional CTE
    return `${baseQuery.trim()},
AggregatedData AS (
  ${aggregationCte}
)
SELECT
  ${createSelectListWithAggregates(selectPart, aggregateFunctions)}
FROM AggregatedData`;
  } else {
    // If no WITH, wrap the entire query in a CTE
    const aggregateFunctions = extractAggregateFunctions(query);
    if (aggregateFunctions.length === 0) return query;
    
    return `WITH SourceData AS (
  ${query.replace(/;$/, '')}
),
AggregatedData AS (
  SELECT 
    ${aggregateFunctions.map(fn => `${fn.function} AS ${fn.alias}`).join(',\n    ')}
  FROM SourceData
)
SELECT
  ${createSelectListWithAggregates(query, aggregateFunctions)}
FROM AggregatedData;`;
  }
}

/**
 * Extracts aggregate functions from a SQL statement
 */
function extractAggregateFunctions(sql: string): Array<{function: string, alias: string}> {
  const aggregateFunctions: Array<{function: string, alias: string}> = [];
  
  // Extract SELECT clause
  const selectMatch = sql.match(/\bSELECT\b(.*?)(?:\bFROM\b|$)/is);
  if (!selectMatch) return aggregateFunctions;
  
  const selectClause = selectMatch[1];
  
  // Match aggregate functions
  const functionRegex = /\b(AVG|SUM|MAX|MIN|COUNT)\s*\(([^)]+)\)(?:\s+AS\s+([^\s,]+))?/ig;
  let match;
  
  while ((match = functionRegex.exec(selectClause)) !== null) {
    const functionName = match[1];
    const argument = match[2].trim();
    // Use alias if provided, otherwise generate one
    const alias = match[3] ? match[3].trim() : `${functionName}_${argument.replace(/[^\w]/g, '_')}`;
    
    aggregateFunctions.push({
      function: `${functionName}(${argument})`,
      alias: alias
    });
  }
  
  return aggregateFunctions;
}

/**
 * Creates a SELECT statement for the aggregation CTE
 */
function createAggregationCte(sql: string, aggregates: Array<{function: string, alias: string}>): string {
  // Extract FROM and WHERE clauses
  const fromMatch = sql.match(/\bFROM\b(.*?)(?:\bWHERE\b|$)/is);
  const whereMatch = sql.match(/\bWHERE\b(.*?)(?:\bGROUP\s+BY\b|$)/is);
  
  if (!fromMatch) return '';
  
  const fromClause = fromMatch[1];
  const whereClause = whereMatch ? `WHERE ${whereMatch[1]}` : '';
  
  return `SELECT
    ${aggregates.map(fn => `${fn.function} AS ${fn.alias}`).join(',\n    ')}
  FROM${fromClause}
  ${whereClause}`;
}

/**
 * Creates a new SELECT list replacing aggregate functions with references
 * to the aggregation CTE
 */
function createSelectListWithAggregates(sql: string, aggregates: Array<{function: string, alias: string}>): string {
  // Extract original SELECT columns
  const selectMatch = sql.match(/\bSELECT\b(.*?)(?:\bFROM\b|$)/is);
  if (!selectMatch) return '*';
  
  let selectClause = selectMatch[1];
  
  // Replace aggregate functions with their aliases from the CTE
  aggregates.forEach(fn => {
    const regex = new RegExp(fn.function.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1"), 'gi');
    selectClause = selectClause.replace(regex, `AggregatedData.${fn.alias}`);
  });
  
  return selectClause;
}

/**
 * Helper function to wrap a SELECT query in a CTE structure
 * to avoid GROUP BY issues
 */
export function wrapQueryInAggregateCte(sql: string): string {
  if (!sql.trim().toLowerCase().startsWith('select')) {
    return sql; // Not a SELECT query
  }
  
  // Simple approach - extract the main parts of the query
  const selectMatch = sql.match(/\bSELECT\b(.*?)\bFROM\b/is);
  const fromAndRestMatch = sql.match(/\bFROM\b(.*)/is);
  
  if (!selectMatch || !fromAndRestMatch) return sql;
  
  const selectList = selectMatch[1].trim();
  const fromAndRest = fromAndRestMatch[1];
  
  // Check for aggregate functions
  const hasAggregateFunction = /\b(AVG|SUM|MAX|MIN|COUNT)\s*\(/i.test(selectList);
  if (!hasAggregateFunction) return sql;
  
  // Extract non-aggregated columns from the SELECT clause
  const nonAggregateColumns: string[] = [];
  const aggregateColumns: string[] = [];
  
  const columns = selectList.split(',').map(col => col.trim());
  
  columns.forEach(col => {
    if (/\b(AVG|SUM|MAX|MIN|COUNT)\s*\(/i.test(col)) {
      aggregateColumns.push(col);
    } else {
      nonAggregateColumns.push(col);
    }
  });
  
  // If no non-aggregate columns, no restructuring needed
  if (nonAggregateColumns.length === 0) return sql;
  
  // Create CTE with non-aggregate columns in GROUP BY
  return `WITH BaseData AS (
  SELECT ${nonAggregateColumns.join(', ')}
  FROM${fromAndRest}
  ${nonAggregateColumns.length > 0 ? 'GROUP BY ' + nonAggregateColumns.join(', ') : ''}
),
AggregateData AS (
  SELECT
    ${aggregateColumns.join(',\n    ')}
  FROM${fromAndRest}
)
SELECT
  ${[...nonAggregateColumns.map(col => `b.${col.split(' ').pop()}`), 
     ...aggregateColumns.map(col => `a.${col.split(' AS ').pop() || col}`)].join(',\n  ')}
FROM BaseData b
CROSS JOIN AggregateData a;`;
}
