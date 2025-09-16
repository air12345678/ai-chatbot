import OpenAI from 'openai';
import { executeQuery } from '../db/database';
// New separated layers
import { ColumnInfo, MessageAnalysis, QueryVerificationResult } from './ai/models';
import { ensureContext } from './ai/repository';
import { cleanSQLQuery, validateAndCleanQuery, getContextualLabel, formatSingleValue, formatResultsAsHTMLTable, handleSQLErrorMessage, formatColumnName, formatDisplayValue, formatTableNameForSQLServer } from './ai/helpers';
import { SchemaAnalyzer } from './ai/schemaAnalyzer';
import { fixSQLServerSyntaxIssues, validateAndFixSQLQuery } from './ai/sqlSyntaxFixer';
import { fixDerivedTableScopeIssues, validateAndFixDerivedTableIssues } from './ai/derivedTableFixer';
import { appConfig } from '../config/config';

const openai = new OpenAI({
  apiKey: appConfig.ai.apiKey
});

// Use configured AI model
const OPENAI_MODEL = appConfig.ai.model;

class AIService {
  async initializeDatabaseContext() {
    return ensureContext();
  }

  async analyzeUserMessage(message: string): Promise<MessageAnalysis> {
    const ctx = await ensureContext();
    const schemaInfo = Object.keys(ctx.schemas)
      .map(tableName => formatTableNameForSQLServer(tableName))
      .join(', ');
    
    // Dynamically extract keywords from database schema
    const databaseKeywords = new Set<string>();
    
    // Add table names
    Object.keys(ctx.schemas).forEach(tableName => {
      databaseKeywords.add(tableName.toLowerCase());
      // Remove common prefixes/suffixes to get core concepts - make this dynamic
      const cleanTableName = tableName
        .replace(/^[a-zA-Z]+\./i, '') // Remove any schema prefix (e.g., dbo., Sales., etc.)
        .replace(/(header|detail|line|item|table)$/i, ''); // Remove common suffixes
      if (cleanTableName.length > 2) {
        databaseKeywords.add(cleanTableName.toLowerCase());
      }
    });
    
    // Add column names
    Object.values(ctx.schemas).forEach(columns => {
      columns.forEach(col => {
        databaseKeywords.add(col.name.toLowerCase());
        // Add variations of column names
        const cleanColName = col.name.replace(/(id|date|name|number|code)$/i, '');
        if (cleanColName.length > 2) {
          databaseKeywords.add(cleanColName.toLowerCase());
        }
      });
    });
    
    // Add common analytical terms - these are universal
    const analyticalTerms = [
      'analysis', 'show', 'identify', 'calculate', 'compare', 'data', 'report',
      'metrics', 'statistics', 'trend', 'performance', 'declining', 'underperform',
      'monthly', 'yearly', 'total', 'sum', 'count', 'average', 'max', 'min'
    ];
    analyticalTerms.forEach(term => databaseKeywords.add(term));
    
    const messageLower = message.toLowerCase();
    const hasKeywords = Array.from(databaseKeywords).some(keyword => 
      messageLower.includes(keyword)
    );
    
    if (hasKeywords) {
      console.log(`Message contains database keywords, forcing DATABASE classification: "${message}"`);
      return { isDatabase: true, intent: 'database_query', analysisType: 'ANALYTICAL' };
    }
    
    const prompt = `You are an expert business analyst and database assistant.\n\nDATABASE TABLES: ${schemaInfo}\n\nINSTRUCTIONS:\n- If the user prompt is about data, analysis, business problems, metrics, or anything that could be answered with a database query, classify as TYPE: DATABASE.\n- Only classify as GENERAL if it's clearly a greeting, thank you, or completely unrelated to business/data.\n- INTENT should be ANALYTICAL, BUSINESS_PROBLEM, SIMPLE_QUERY, STATISTICAL, REPORTING, or GENERAL_CHAT.\n- When in doubt, choose DATABASE.\n\nUser prompt: "${message}"\n\nRespond with exactly this format: TYPE|INTENT`;

    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 20
    });

    const response = completion.choices[0].message?.content?.trim() || '';
    const [type, intent] = response.split('|');
    const isDatabase = type?.toUpperCase().includes('DATABASE') || false;
    const analysisType = intent || 'SIMPLE_QUERY';
    console.log(`Message analysis: "${message}" -> ${isDatabase ? 'DATABASE' : 'GENERAL'} | ${analysisType}`);
    return { isDatabase, intent: isDatabase ? 'database_query' : 'general_chat', analysisType };
  }

  async generateSQLQuery(message: string): Promise<string> {
    const ctx = await ensureContext();
    const schemaInfo = Object.entries(ctx.schemas)
      .map(([tableName, columns]) => {
        const formattedTableName = formatTableNameForSQLServer(tableName);
        const columnList = columns.map(col => `${col.name} (${col.type}${col.maxLength ? `(${col.maxLength})` : ''})`).join(', ');
        return `${formattedTableName}: ${columnList}`;
      }).join('\n\n');

    // Use SchemaAnalyzer for dynamic schema analysis
    const schemaAnalysis = SchemaAnalyzer.analyzeSchema(ctx, message);
    const sqlExamples = SchemaAnalyzer.generateExamples(ctx);
    
    // Build dynamic context based on schema analysis
    let enhancedContext = '';
    
    // Add schema analysis insights
    if (schemaAnalysis) {
      enhancedContext += `\n\nSCHEMA INSIGHTS:\n${schemaAnalysis}\n`;
    }
    
    // Add SQL examples based on actual schema
    if (sqlExamples) {
      enhancedContext += `\n\nSQL EXAMPLES:\n${sqlExamples}\n`;
    }

    // Check for query type based on user message
    const queryTypeChecks = [
      { pattern: /\b(trend|over time|historical|compare periods)\b/i, type: 'temporal' },
      { pattern: /\b(group|category|segment|classify|type)\b/i, type: 'categorical' },
      { pattern: /\b(sum|total|average|mean|count|max|min|aggregate)\b/i, type: 'aggregate' },
      { pattern: /\b(rank|top|bottom|highest|lowest|best|worst)\b/i, type: 'ranking' },
      { pattern: /\b(join|related|relationship|between|connection)\b/i, type: 'relational' }
    ];
    
    const detectedTypes = queryTypeChecks
      .filter(check => check.pattern.test(message))
      .map(check => check.type);
    
    // Add guidance based on detected query types
    if (detectedTypes.length > 0) {
      enhancedContext += `\nQUERY GUIDANCE: This appears to be a ${detectedTypes.join(', ')} query. `;
      
      // Add specific guidance based on query type
      if (detectedTypes.includes('temporal')) {
        enhancedContext += 'Use date functions and GROUP BY time periods for trend analysis. ';
      }
      if (detectedTypes.includes('categorical')) {
        enhancedContext += 'Use GROUP BY with categorical columns. ';
      }
      if (detectedTypes.includes('aggregate')) {
        enhancedContext += 'Use aggregate functions like SUM, AVG, COUNT, etc. ';
      }
      if (detectedTypes.includes('ranking')) {
        enhancedContext += 'Consider using ORDER BY with LIMIT/TOP or window functions like ROW_NUMBER()/RANK(). ';
      }
      if (detectedTypes.includes('relational')) {
        enhancedContext += 'Use appropriate JOINs between related tables. ';
      }
    }
    
    // Generate final prompt with dynamically generated schema context
    const prompt = `You are an expert SQL developer with deep knowledge of database design patterns.

USER REQUEST: "${message}"

DATABASE SCHEMA:
${schemaInfo}

${enhancedContext}

CRITICAL INSTRUCTIONS:
1. Write a SQL query that directly answers the user's question using ONLY the database schema provided above
2. NEVER use tables or columns that don't exist in the schema - double-check every table and column name
3. Follow SQL Server syntax rules strictly:
   - Use square brackets around ALL table and column names: [TableName].[ColumnName]
   - Use proper JOIN syntax with explicit ON clauses
   - Use TOP instead of LIMIT for SQL Server
   - Format the query with proper indentation and line breaks for readability
4. For aggregations, always include appropriate GROUP BY clauses
5. When filtering dates, use ISO format YYYY-MM-DD in quotes: '2023-01-01'
6. Include clear comments explaining the query purpose
7. Ensure the query is optimized and will execute without errors
8. If the user request cannot be fulfilled with the available schema, explain what's missing
9. Return ONLY the SQL query with comments, no additional text

Generate a complete, executable SQL query:`;

    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,  // Lower temperature for more consistent results
      max_tokens: 1500   // More tokens for complex queries
    });

    const sqlQuery = completion.choices[0].message?.content?.trim() || '';
    return sqlQuery;
  }

  async verifySQLQuery(sqlQuery: string): Promise<QueryVerificationResult> {
    try {
      console.log('Verifying SQL:', sqlQuery);
      
      // Enhanced cleaning and validation
      const cleaned = validateAndCleanQuery(sqlQuery);
      console.log('Cleaned SQL:', cleaned);
      
      // Check if query is empty after cleaning
      if (!cleaned || cleaned.trim().length === 0) {
        return {
          isValid: false,
          errors: ['Query is empty or contains no valid SQL statements'],
          warnings: []
        };
      }
      
      // Fix SQL Server syntax issues like ORDER BY in subqueries and incorrect FETCH syntax
      const syntaxFixResult = validateAndFixSQLQuery(cleaned);
      console.log('Syntax-fixed SQL:', syntaxFixResult.fixedQuery);
      
      // Fix derived table scope issues like "Orders.ShipRegion could not be bound" in outer queries
      const scopeFixResult = validateAndFixDerivedTableIssues(syntaxFixResult.fixedQuery);
      console.log('Scope-fixed SQL:', scopeFixResult.fixedQuery);
      
      // Get the final fixed query after all fixes are applied
      const finalFixedQuery = scopeFixResult.fixedQuery;
      
      // Combine all warnings from different validation steps
      const warnings: string[] = [...syntaxFixResult.warnings, ...scopeFixResult.warnings];
      
      // Check for missing WHERE clause in large tables
      if (!/WHERE\s+/i.test(finalFixedQuery) && /FROM\s+\[\w+\]/i.test(finalFixedQuery)) {
        warnings.push("Query doesn't contain a WHERE clause, which might return a large number of rows");
      }
      
      // Check for potentially slow operations
      if (/SELECT\s+\*/i.test(finalFixedQuery)) {
        warnings.push("Query uses SELECT *, which might be inefficient. Consider selecting only needed columns");
      }
      
      // Check for inefficient JOIN patterns
      if (finalFixedQuery.toLowerCase().includes(' join ') && !finalFixedQuery.toLowerCase().includes(' on ')) {
        warnings.push("Query appears to have JOINs without ON conditions, which could result in a Cartesian product");
      }
      
      // Check for nested aggregates or subqueries inside aggregate functions (SQL Server limitation)
      const nestedAggregatePattern = /\b(SUM|AVG|COUNT|MIN|MAX)\s*\(\s*.*\b(SELECT|SUM|AVG|COUNT|MIN|MAX)\b/i;
      if (nestedAggregatePattern.test(finalFixedQuery)) {
        warnings.push("SQL Server doesn't support nested aggregate functions or subqueries within aggregate functions. Consider restructuring the query to avoid this pattern.");
      }
      
      // Check for common SQL Server syntax issues
      if (finalFixedQuery.toLowerCase().includes('limit ') && !finalFixedQuery.toLowerCase().includes('offset ')) {
        warnings.push("Consider using TOP instead of LIMIT for SQL Server compatibility");
      }
      
      // Validate table and column references against schema
      const ctx = await ensureContext();
      const availableTables = Object.keys(ctx.schemas);
      
      // Extract table references from the query
      const tableRefs = syntaxFixResult.fixedQuery.match(/FROM\s+\[?(\w+)\]?\.?\[?(\w+)\]?/gi) || [];
      const joinRefs = syntaxFixResult.fixedQuery.match(/JOIN\s+\[?(\w+)\]?\.?\[?(\w+)\]?/gi) || [];
      
      for (const ref of [...tableRefs, ...joinRefs]) {
        const tableMatch = ref.match(/(?:FROM|JOIN)\s+\[?(\w+)\]?\.?\[?(\w+)\]?/i);
        if (tableMatch) {
          const schema = tableMatch[1];
          const table = tableMatch[2] || tableMatch[1];
          const fullTableName = tableMatch[2] ? `${schema}.${table}` : `dbo.${table}`;
          
          if (!availableTables.includes(fullTableName) && !availableTables.includes(table)) {
            warnings.push(`Table '${fullTableName}' may not exist in the database schema`);
          }
        }
      }
      
      return { isValid: true, fixedQuery: finalFixedQuery, errors: [], warnings };
    } catch (error: any) {
      console.error('SQL verification failed:', error);
      const errorMessage = error.message ? handleSQLErrorMessage(error.message) : 'Unknown SQL error';
      return { 
        isValid: false, 
        errors: [errorMessage],
        warnings: []
      };
    }
  }

  async executeVerifiedSQL(sqlQuery: string): Promise<any[]> {
    try {
      console.log('Executing verified SQL:', sqlQuery);
      const result = await executeQuery(sqlQuery);
      console.log('Query returned', result?.length || 0, 'rows');
      return result || [];
    } catch (error: any) {
      console.error('SQL execution failed:', error);
      throw error;
    }
  }

  // Method renamed from generateSQLResponse to handleUserQuery to match existing interface
  async handleUserQuery(message: string): Promise<{ type: string; content: string; }> {
    try {
      // Analyze the message to determine if it's a database query or general chat
      const analysis = await this.analyzeUserMessage(message);
      
      if (analysis.isDatabase) {
        // Handle as a database query
        return this.generateSQLResponse(message);
      } else {
        // Handle as general chat
        const response = await this.generateChatResponse(message);
        return { type: 'message', content: response };
      }
    } catch (error: any) {
      console.error('Error handling message:', error);
      return { 
        type: 'error', 
        content: `I'm sorry, I encountered an error processing your request: ${error.message}` 
      };
    }
  }

  // Add executeSQLQuery for compatibility with existing code
  async executeSQLQuery(sqlQuery: string): Promise<any[]> {
    return this.executeVerifiedSQL(sqlQuery);
  }

  async generateSQLResponse(message: string): Promise<{ type: string; content: string; }> {
    try {
      // First generate SQL from the message
      const sql = await this.generateSQLQuery(message);
      console.log('Generated SQL:', sql);
      
      // Verify and clean the SQL
      const verification = await this.verifySQLQuery(sql);
      
      if (!verification.isValid) {
        return { 
          type: 'error',
          content: `I couldn't generate a valid SQL query: ${verification.errors.join('. ')}`
        };
      }
      
      // If valid, proceed with execution
      const finalSQL = verification.fixedQuery || sql;
      const result = await this.executeVerifiedSQL(finalSQL);
      
      // Format the results
      let formattedResult: string;
      if (result.length === 1 && Object.keys(result[0]).length === 1) {
        // If it's just a single value, format it simply
        const value = result[0][Object.keys(result[0])[0]];
        formattedResult = formatSingleValue(value);
      } else {
        // Extract keys for table formatting
        const keys = result.length > 0 ? Object.keys(result[0]) : [];
        formattedResult = formatResultsAsHTMLTable(result, keys, result.length);
      }
      
      // Build the full response
      let response = `Here are the results:\n\n${formattedResult}\n\n`;
      
      // Add the query used
      response += `SQL Query Used:\n\`\`\`sql\n${finalSQL}\n\`\`\``;
      
      // Add warnings if any
      if (verification.warnings && verification.warnings.length > 0) {
        response += `\n\nNote: ${verification.warnings.join('. ')}`;
      }
      
      return { type: 'result', content: response };
    } catch (error: any) {
      console.error('Error in generateSQLResponse:', error);
      return { 
        type: 'error',
        content: `Error executing the query: ${error.message ? error.message : 'Unknown error'}`
      };
    }
  }

  async generateChatResponse(userQuery: string): Promise<string> {
    // Just a simple passthrough to the LLM for general chat
    const prompt = `You are a helpful AI assistant that specializes in database analysis and SQL queries. 
    If the user asks about data or analysis, suggest they rephrase their question to request a specific SQL query.
    
    User query: "${userQuery}"`;
    
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500
    });
    
    return completion.choices[0].message?.content?.trim() || 'I apologize, but I was unable to generate a response.';
  }
}

export default new AIService();
