/**
 * dynamicSqlExecutor.ts
 * 
 * A service that dynamically executes SQL queries with automatic error detection
 * and correction. It handles common SQL errors including GROUP BY issues with
 * aggregation functions.
 */

import { executeQuery } from '../db/database';
import { fixSqlQuery, SQLFixOptions } from '../utils/sqlQueryFixer';
import { appConfig } from '../config/config';

export interface DynamicSqlExecutionOptions extends SQLFixOptions {
  /**
   * Maximum attempts to fix and retry a failing query
   */
  maxRetries?: number;
  
  /**
   * Whether to throw an error if the query can't be fixed after retries
   */
  throwOnFailure?: boolean;
}

export class DynamicSqlExecutor {
  /**
   * Executes a SQL query with automatic error detection and correction
   * 
   * @param sqlQuery - The SQL query to execute
   * @param options - Configuration options for execution and fixing
   * @returns The query results or null if execution failed
   */
  public static async executeSql<T = any>(
    sqlQuery: string, 
    options: DynamicSqlExecutionOptions = {}
  ): Promise<T[] | null> {
    // Default options from configuration
    const opts = {
      maxRetries: appConfig.sql.maxRetries,
      throwOnFailure: appConfig.sql.throwOnFailure,
      autoFixGroupBy: appConfig.sql.autoFixGroupBy,
      useCteRestructuring: appConfig.sql.useCteRestructuring,
      verbose: appConfig.sql.verboseLogging,
      ...options
    };
    
    let currentQuery = sqlQuery;
    let attempts = 0;
    let error: Error | null = null;
    
    while (attempts < opts.maxRetries) {
      attempts++;
      
      try {
        if (opts.verbose) {
          console.log(`Executing SQL (attempt ${attempts}/${opts.maxRetries})...`);
        }
        
        // Execute the query
        const results = await executeQuery(currentQuery);
        
        // Success! Return results
        if (opts.verbose) {
          console.log(`SQL executed successfully after ${attempts} attempt(s)`);
        }
        
        return results as T[];
      } catch (err: any) {
        error = err;
        console.error(`SQL execution error (attempt ${attempts}/${opts.maxRetries}):`, err.message);
        
        // Check for specific error types and apply fixes
        if (this.isGroupByError(err)) {
          console.log('Detected GROUP BY or aggregation error, applying dynamic fix...');
          currentQuery = this.fixGroupByAggregationError(currentQuery);
        } else if (this.isSyntaxError(err)) {
          console.log('Detected SQL syntax error, attempting to clean query...');
          currentQuery = this.cleanSqlQuery(currentQuery);
        } else {
          // If it's not a fixable error, stop trying
          console.error('Error is not automatically fixable');
          break;
        }
      }
    }
    
    // If we get here, all attempts failed
    if (opts.throwOnFailure && error) {
      throw error;
    }
    
    return null;
  }
  
  /**
   * Checks if an error is a GROUP BY related error
   */
  private static isGroupByError(error: any): boolean {
    const errorMessage = error.message || '';
    return /column.*invalid in the select list because it is not contained in.*GROUP BY/i.test(errorMessage) ||
           /must appear in the GROUP BY clause/i.test(errorMessage);
  }
  
  /**
   * Checks if an error is a general SQL syntax error
   */
  private static isSyntaxError(error: any): boolean {
    const errorMessage = error.message || '';
    return /syntax error/i.test(errorMessage) ||
           /incorrect syntax/i.test(errorMessage);
  }
  
  /**
   * Performs basic cleaning of SQL queries
   */
  private static cleanSqlQuery(query: string): string {
    // Remove backticks (MySQL style) that cause errors in SQL Server
    let cleaned = query.replace(/`/g, '');
    
    // Fix common issues with quoted identifiers
    cleaned = cleaned.replace(/(?<!\[)(\w+\.\w+)(?!\])/g, '[$1]');
    
    return cleaned;
  }

  /**
   * Universal fix for GROUP BY aggregation errors
   * This method analyzes any SQL query and restructures it to fix GROUP BY issues
   */
  private static fixGroupByAggregationError(query: string): string {
    console.log("🔄 Analyzing query structure to fix GROUP BY aggregation error...");

    // Step 1: Extract the final SELECT statement that's causing the GROUP BY error
    const finalSelectMatch = query.match(/(?:^|[\s\S]*\))\s*SELECT([\s\S]*?)FROM(?:\s+(?!\s*\w+\s*\()[\s\S]*?)?$/i);
    
    if (!finalSelectMatch) {
      console.warn("❌ Could not identify the final SELECT statement");
      return query;
    }

    const selectClause = finalSelectMatch[1].trim();
    const beforeFinalSelect = query.substring(0, query.length - finalSelectMatch[0].length + finalSelectMatch[0].indexOf('SELECT'));
    const finalSelect = finalSelectMatch[0].substring(finalSelectMatch[0].indexOf('SELECT'));

    console.log("✓ Found final SELECT statement causing GROUP BY error");

    // Step 2: Parse columns from SELECT clause
    const columns = this.parseSelectColumns(selectClause);
    const aggregateColumns = columns.filter(col => this.isAggregateColumn(col.expression));
    const nonAggregateColumns = columns.filter(col => !this.isAggregateColumn(col.expression));
    
    console.log(`✓ Found ${aggregateColumns.length} aggregate columns and ${nonAggregateColumns.length} non-aggregate columns`);
    
    // Step 3: If we have both aggregate and non-aggregate columns, we need to restructure
    if (aggregateColumns.length > 0 && nonAggregateColumns.length > 0) {
      return this.restructureQueryWithSeparateAggregation(query, beforeFinalSelect, finalSelect, aggregateColumns, nonAggregateColumns);
    }

    console.warn("⚠️ No obvious GROUP BY fix could be applied");
    return query;
  }
  
  /**
   * Parse SELECT columns into structured format
   */
  private static parseSelectColumns(selectClause: string): Array<{expression: string, alias: string}> {
    const columns: Array<{expression: string, alias: string}> = [];
    
    // Split by comma, but be careful of commas inside functions
    let depth = 0;
    let currentColumn = '';
    
    for (let i = 0; i < selectClause.length; i++) {
      const char = selectClause[i];
      
      if (char === '(') depth++;
      else if (char === ')') depth--;
      else if (char === ',' && depth === 0) {
        if (currentColumn.trim()) {
          columns.push(this.parseColumn(currentColumn.trim()));
        }
        currentColumn = '';
        continue;
      }
      
      currentColumn += char;
    }
    
    // Add the last column
    if (currentColumn.trim()) {
      columns.push(this.parseColumn(currentColumn.trim()));
    }
    
    return columns;
  }
  
  /**
   * Parse individual column expression
   */
  private static parseColumn(columnText: string): {expression: string, alias: string} {
    // Check for alias (AS keyword)
    const asMatch = columnText.match(/^(.+?)\s+AS\s+(.+)$/i);
    if (asMatch) {
      return {
        expression: asMatch[1].trim(),
        alias: asMatch[2].trim().replace(/[\[\]]/g, '')
      };
    }
    
    // For expressions without AS, generate a proper alias
    let alias = columnText;
    
    // If it contains a dot (table.column), extract just the column name
    if (columnText.includes('.')) {
      const parts = columnText.split('.');
      alias = parts[parts.length - 1].replace(/[\[\]]/g, '');
    } else {
      alias = columnText.replace(/[\[\]]/g, '');
    }
    
    return {
      expression: columnText.trim(),
      alias: alias.trim()
    };
  }
  
  /**
   * Check if a column expression contains aggregate functions
   */
  private static isAggregateColumn(expression: string): boolean {
    return /\b(AVG|SUM|MAX|MIN|COUNT|STDEV|VAR)\s*\(/i.test(expression);
  }
  
  /**
   * Restructure query by adding proper GROUP BY clause
   */
  private static restructureQueryWithSeparateAggregation(
    originalQuery: string,
    beforeFinalSelect: string,
    finalSelect: string,
    aggregateColumns: Array<{expression: string, alias: string}>,
    nonAggregateColumns: Array<{expression: string, alias: string}>
  ): string {
    console.log("🔧 Restructuring query by adding GROUP BY clause...");
    
    // Extract the final SELECT statement components
    const selectMatch = finalSelect.match(/^SELECT\s+([\s\S]*?)\s+FROM\s+([\s\S]*?)(?:\s+WHERE\s+([\s\S]*?))?(?:\s+GROUP\s+BY\s+([\s\S]*?))?(?:\s+ORDER\s+BY\s+([\s\S]*?))?$/i);
    
    if (!selectMatch) {
      console.warn("❌ Could not parse final SELECT statement components");
      return originalQuery;
    }

    const [, selectClause, fromClause, whereClause, existingGroupBy, orderClause] = selectMatch;
    
    // Build the GROUP BY clause from non-aggregate columns
    const groupByColumns = nonAggregateColumns.map(col => col.expression).join(', ');
    
    // Reconstruct the final SELECT with GROUP BY
    let newFinalSelect = `SELECT\n  ${selectClause.trim()}\nFROM ${fromClause.trim()}`;
    
    if (whereClause) {
      newFinalSelect += `\nWHERE ${whereClause.trim()}`;
    }
    
    newFinalSelect += `\nGROUP BY ${groupByColumns}`;
    
    if (orderClause) {
      newFinalSelect += `\nORDER BY ${orderClause.trim()}`;
    }
    
    // Combine with the before part
    const fixedQuery = beforeFinalSelect + newFinalSelect;
    
    console.log("✅ Added GROUP BY clause to fix aggregation error");
    return fixedQuery;
  }
  
  /**
   * Get appropriate column reference for the restructured query
   */
  private static getColumnReference(column: {expression: string, alias: string}, fromClause: string): string {
    // If the expression already has a table alias, use it as-is
    if (column.expression.includes('.')) {
      return `${column.expression} AS ${column.alias}`;
    }
    
    // Try to infer the main table alias from the FROM clause
    const mainAlias = this.getMainTableAlias(fromClause);
    if (mainAlias) {
      return `${mainAlias}.${column.expression} AS ${column.alias}`;
    }
    
    return `${column.expression} AS ${column.alias}`;
  }
  
  /**
   * Extract the main table alias from FROM clause
   */
  private static getMainTableAlias(fromClause: string): string {
    // Look for the first table alias in the FROM clause
    const aliasMatch = fromClause.match(/(?:FROM\s+)?[^\s]+\s+(\w+)/i);
    return aliasMatch ? aliasMatch[1] : '';
  }
  
  /**
   * Add missing GROUP BY clause (simpler case)
   */
  private static addMissingGroupBy(query: string, finalSelect: string): string {
    console.log("Attempting to add missing GROUP BY clause...");
    
    // This is a more complex case that would require deeper analysis
    // For now, return the original query
    console.warn("GROUP BY addition not implemented for this case");
    return query;
  }
}
