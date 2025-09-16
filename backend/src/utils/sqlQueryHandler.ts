/**
 * sqlQueryHandler.ts
 * 
 * A general-purpose service for handling SQL query execution with automatic
 * error detection and correction. This service can be used throughout your
 * application to execute any SQL query with built-in error handling.
 */

import { DynamicSqlExecutor } from './dynamicSqlExecutor';

export class SqlQueryHandler {
  /**
   * Executes any SQL query with automatic error correction
   * 
   * @param sqlQuery The SQL query to execute
   * @param params Optional parameters for query
   * @returns Query results
   */
  public static async executeQuery<T = any>(sqlQuery: string, params?: any[]): Promise<T[]> {
    return await DynamicSqlExecutor.executeSql<T>(sqlQuery, {
      verbose: true,
      maxRetries: 3,
      throwOnFailure: true
    }) as T[];
  }
  
  /**
   * Executes a business intelligence query that might have aggregation
   * or GROUP BY issues. Optimized for reports and analytics.
   * 
   * @param sqlQuery The SQL query to execute
   * @returns Query results
   */
  public static async executeAnalyticsQuery<T = any>(sqlQuery: string): Promise<T[]> {
    return await DynamicSqlExecutor.executeSql<T>(sqlQuery, {
      verbose: true,
      maxRetries: 3,
      throwOnFailure: true,
      // Increase the chance of fixing complex analytical queries
      autoFixGroupBy: true,
      useCteRestructuring: true
    }) as T[];
  }
  
  /**
   * Executes a sales prediction query with optimal fixes for aggregation issues
   * 
   * @param sqlQuery The SQL query to execute
   * @returns Prediction results
   */
  public static async executeSalesPrediction<T = any>(sqlQuery: string): Promise<T[]> {
    return await DynamicSqlExecutor.executeSql<T>(sqlQuery, {
      verbose: true,
      maxRetries: 3,
      throwOnFailure: true,
      autoFixGroupBy: true,
      useCteRestructuring: true
    }) as T[];
  }
}
