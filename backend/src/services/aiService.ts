import OpenAI from 'openai';
import { getAdventureWorksData, getTableSchema, getAllTables } from '../db/adventureworks';

// Add proper type definitions at the top of the file
interface ColumnInfo {
  name: string;
  type: string;
  nullable: string;
  maxLength?: number;
}

interface DatabaseContext {
  tables: any[];
  schemas: { [tableName: string]: ColumnInfo[] };
  loadedAt: Date;
  totalTables: number;
  loadedSchemas: number;
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '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'
});

// Cache for database schema to avoid repeated calls
let databaseContext: DatabaseContext | null = null;

class AIService {
  // Step 1: Initialize database context by loading ALL table schemas
  async initializeDatabaseContext() {
    if (!databaseContext) {
      console.log('Initializing database context...');
      try {
        // Get all tables from the database
        const tables = await getAllTables();
        console.log(`Found ${tables.length} tables`);
        
        // Load schemas for ALL tables dynamically - properly typed
        const schemas: { [tableName: string]: ColumnInfo[] } = {};
        let successCount = 0;
        
        for (const table of tables) {
          try {
            const tableSchema = await getTableSchema(table.TABLE_SCHEMA, table.TABLE_NAME);
            const tableName = `${table.TABLE_SCHEMA}.${table.TABLE_NAME}`;
            
            // Check if tableSchema exists and has data
            if (tableSchema && Array.isArray(tableSchema) && tableSchema.length > 0) {
              schemas[tableName] = tableSchema.map(col => ({
                name: col.COLUMN_NAME,
                type: col.DATA_TYPE,
                nullable: col.IS_NULLABLE,
                maxLength: col.CHARACTER_MAXIMUM_LENGTH
              }));
              
              successCount++;
              console.log(`Loaded schema for ${tableName} (${tableSchema.length} columns)`);
            } else {
              console.warn(`No schema data found for ${tableName}`);
            }
          } catch (error: any) {
            console.warn(`Could not load schema for ${table.TABLE_SCHEMA}.${table.TABLE_NAME}:`, error.message);
          }
        }

        databaseContext = {
          tables: tables,
          schemas: schemas,
          loadedAt: new Date(),
          totalTables: tables.length,
          loadedSchemas: successCount
        };
        
        console.log(`Database context initialized: ${successCount}/${tables.length} table schemas loaded`);
      } catch (error) {
        console.error('Failed to initialize database context:', error);
        throw error;
      }
    }
    return databaseContext;
  }

  // Step 2: Analyze user message to determine if it's database-related
  async analyzeUserMessage(message: string): Promise<{ isDatabase: boolean; intent: string }> {
    const prompt = `
Analyze this user message and determine if it's asking for data from a database:
"${message}"

Respond with exactly one word:
- "DATABASE" if the user is asking for data, reports, information, or anything that would require a database query
- "GENERAL" if it's a general question, greeting, or non-database related

Examples:
- "Show me all products" -> DATABASE
- "What employees work here?" -> DATABASE
- "List customers from Seattle" -> DATABASE
- "Hello how are you?" -> GENERAL
- "What is machine learning?" -> GENERAL
`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4-1106-preview',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 10
    });

    const response = completion.choices[0].message?.content?.trim().toUpperCase() || '';
    const isDatabase = response.includes('DATABASE');
    
    console.log(`Message analysis: "${message}" -> ${isDatabase ? 'DATABASE' : 'GENERAL'}`);
    
    return {
      isDatabase,
      intent: isDatabase ? 'database_query' : 'general_chat'
    };
  }

  // Step 3: Generate SQL query using complete database schema context
  async generateSQLQuery(message: string): Promise<string> {
    await this.initializeDatabaseContext();

    // Create comprehensive schema information for the AI
    const schemaInfo = Object.entries(databaseContext!.schemas)
      .map(([tableName, columns]: [string, ColumnInfo[]]) => {
        const columnList = columns
          .map((col: ColumnInfo) => `${col.name} (${col.type}${col.maxLength ? `(${col.maxLength})` : ''})`)
          .join(', ');
        return `${tableName}: ${columnList}`;
      }).join('\n\n');

    const availableTables = databaseContext!.tables
      .map(t => `${t.TABLE_SCHEMA}.${t.TABLE_NAME}`)
      .join(', ');

    const prompt = `
You are an expert SQL Server query generator for the AdventureWorks2022 database.

DATABASE SCHEMA:
${schemaInfo}

CRITICAL RULES:
1. ALWAYS use schema.table format (e.g., Production.Product, NOT just Product)
2. Use EXACT column names as shown above - they are case-sensitive
3. For employee information, JOIN HumanResources.Employee with Person.Person using BusinessEntityID
4. Use TOP clause instead of LIMIT for SQL Server
5. Always end queries with semicolon
6. Return ONLY the SQL query - no explanations, no markdown formatting, no backticks

COMMON PATTERNS:
- Employee names: SELECT p.FirstName, p.LastName FROM Person.Person p JOIN HumanResources.Employee e ON p.BusinessEntityID = e.BusinessEntityID
- Product info: SELECT * FROM Production.Product WHERE [condition]
- Sales data: SELECT * FROM Sales.SalesOrderHeader WHERE [condition]

User request: "${message}"

Generate SQL Server query:
`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4-1106-preview',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 400
    });

    let sqlQuery = completion.choices[0].message?.content?.trim() || '';
    
    // Clean up the response
    sqlQuery = sqlQuery.replace(/```sql|```/g, '').trim();
    if (!sqlQuery.endsWith(';')) {
      sqlQuery += ';';
    }

    console.log('Generated SQL Query:', sqlQuery);
    return sqlQuery;
  }

  // Step 4: Verify SQL query against actual database schema
  async verifySQLQuery(sqlQuery: string): Promise<{ isValid: boolean; fixedQuery?: string; errors: string[] }> {
    const errors: string[] = [];
    
    try {
      // Extract table names from the query
      const tableMatches = sqlQuery.match(/(?:FROM|JOIN)\s+([a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*)/gi);
      
      if (tableMatches) {
        for (const match of tableMatches) {
          const tableName = match.replace(/^(FROM|JOIN)\s+/i, '').trim();
          const [schema, table] = tableName.split('.');
          
          if (!databaseContext!.schemas[tableName]) {
            try {
              // Try to load schema if not in cache
              const tableSchema = await getTableSchema(schema, table);
              if (!tableSchema || tableSchema.length === 0) {
                errors.push(`Table ${tableName} does not exist`);
              }
            } catch (error) {
              errors.push(`Table ${tableName} does not exist or is not accessible`);
            }
          }
        }
      }

      // Extract column references (basic check) - Fixed regex without 's' flag
      const columnMatches = sqlQuery.replace(/\n/g, ' ').match(/SELECT\s+(.*?)\s+FROM/i);
      if (columnMatches) {
        const selectClause = columnMatches[1];
        // This is a simplified column validation - you could make it more sophisticated
        console.log('Select clause validation:', selectClause);
      }

      return { 
        isValid: errors.length === 0, 
        fixedQuery: sqlQuery,
        errors 
      };
    } catch (error: any) {
      return {
        isValid: false,
        errors: ['Query validation failed: ' + error.message]
      };
    }
  }

  // Step 5: Execute SQL query and format results dynamically
  async executeSQLQuery(sqlQuery: string): Promise<string> {
    try {
      console.log('Executing verified SQL:', sqlQuery);
      const results = await getAdventureWorksData(sqlQuery);
      
      if (!results || results.length === 0) {
        return 'No data found for your query.';
      }

      // Dynamic detection of result type
      const keys = Object.keys(results[0]);
      const totalCount = results.length;

      // Handle single value results (aggregates like COUNT, SUM, AVG, etc.)
      if (totalCount === 1 && keys.length === 1) {
        const key = keys[0];
        const value = results[0][key];
        
        // Format the single value with proper context
        const formattedValue = this.formatSingleValue(value);
        const contextualLabel = this.getContextualLabel(key, sqlQuery);
        
        return `**${contextualLabel}:** ${formattedValue}`;
      }

      // Handle multi-row, multi-column results as table
      return this.formatResultsAsTable(results, keys, totalCount);
      
    } catch (error: any) {
      console.error('SQL Execution Error:', error);
      return this.formatSQLError(error);
    }
  }

  // Completely dynamic method to get contextual labels
  private getContextualLabel(columnName: string, sqlQuery: string): string {
    const queryUpper = sqlQuery.toUpperCase();
    const columnUpper = columnName.toUpperCase();
    
    // Extract table names from query to understand context
    const tableMatches = queryUpper.match(/(?:FROM|JOIN)\s+([A-Z_][A-Z0-9_]*\.[A-Z_][A-Z0-9_]*)/g);
    const tables = tableMatches ? tableMatches.map(match => 
      match.replace(/^(FROM|JOIN)\s+/, '').trim()
    ) : [];
    
    // Dynamic aggregate function detection
    const aggregateFunctions = ['COUNT', 'SUM', 'AVG', 'MAX', 'MIN', 'TOTAL'];
    
    for (const func of aggregateFunctions) {
      if (columnUpper.includes(func) || queryUpper.includes(`${func}(`)) {
        // Extract what's being aggregated from the query
        const aggregateContext = this.extractAggregateContext(queryUpper, func, tables);
        return this.formatAggregateLabel(func, aggregateContext);
      }
    }
    
    // If no aggregate, return formatted column name
    return this.formatColumnName(columnName);
  }

  // Dynamic method to extract context from aggregate functions
  private extractAggregateContext(queryUpper: string, aggregateFunction: string, tables: string[]): string {
    // Extract the content inside the aggregate function
    const funcPattern = new RegExp(`${aggregateFunction}\\s*\\(([^)]+)\\)`, 'i');
    const match = queryUpper.match(funcPattern);
    
    if (match && match[1]) {
      const aggregateContent = match[1].trim();
      
      // If it's COUNT(*), look at the main table context
      if (aggregateContent === '*') {
        return this.inferContextFromTables(tables);
      }
      
      // If it's a specific column, extract the meaningful part
      return this.extractMeaningfulContext(aggregateContent, tables);
    }
    
    // Fallback: try to infer from table names
    return this.inferContextFromTables(tables);
  }

  // Dynamic method to infer context from table names
  private inferContextFromTables(tables: string[]): string {
    if (tables.length === 0) return '';
    
    // Extract meaningful words from table names
    const contexts = tables.map(table => {
      const parts = table.split('.');
      const tableName = parts[parts.length - 1]; // Get table name without schema
      
      // Split camelCase/PascalCase and extract meaningful words
      return tableName
        .replace(/([A-Z])/g, ' $1')
        .trim()
        .toLowerCase()
        .split(' ')
        .filter(word => word.length > 2) // Filter out small words
        .join(' ');
    });
    
    // Return the most descriptive context
    return contexts.find(context => context.length > 0) || '';
  }

  // Dynamic method to extract meaningful context from column content
  private extractMeaningfulContext(content: string, tables: string[]): string {
    // Remove common SQL keywords and extract meaningful parts
    const cleanContent = content
      .replace(/DISTINCT|ALL|TOP|\d+/gi, '')
      .trim();
    
    // If it contains a dot (table.column), extract the column part
    if (cleanContent.includes('.')) {
      const parts = cleanContent.split('.');
      const columnPart = parts[parts.length - 1];
      return this.formatColumnName(columnPart);
    }
    
    // Otherwise format the content as is
    return this.formatColumnName(cleanContent);
  }

  // Dynamic method to format aggregate labels
  private formatAggregateLabel(aggregateFunction: string, context: string): string {
    const func = aggregateFunction.toLowerCase();
    
    if (!context || context.trim() === '') {
      // Return just the function name, capitalized
      return func.charAt(0).toUpperCase() + func.slice(1);
    }
    
    // Combine function with context
    const formattedContext = context.charAt(0).toUpperCase() + context.slice(1);
    
    switch (func) {
      case 'count':
        return `Total ${formattedContext}`;
      case 'sum':
        return `Total ${formattedContext}`;
      case 'avg':
        return `Average ${formattedContext}`;
      case 'max':
        return `Maximum ${formattedContext}`;
      case 'min':
        return `Minimum ${formattedContext}`;
      default:
        return `${func.charAt(0).toUpperCase() + func.slice(1)} ${formattedContext}`;
    }
  }

  // Dynamic method to format column names nicely
  private formatColumnName(columnName: string): string {
    if (!columnName) return 'Result';
    
    return columnName
      // Split on camelCase/PascalCase
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      // Split on underscores
      .replace(/_/g, ' ')
      // Capitalize first letter of each word
      .replace(/\b\w/g, l => l.toUpperCase())
      .trim();
  }

  // Dynamic method to format single values
  private formatSingleValue(value: any): string {
    if (value === null || value === undefined) {
      return 'NULL';
    }
    
    if (typeof value === 'number') {
      return value.toLocaleString();
    }
    
    if (value instanceof Date) {
      return value.toLocaleDateString();
    }
    
    return String(value);
  }

  // Step 6: Handle general chat (non-database questions)
  async handleGeneralChat(message: string): Promise<string> {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4-1106-preview',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant. Keep responses brief and friendly. If users ask about databases, mention that you can help with AdventureWorks database queries.'
        },
        { role: 'user', content: message }
      ],
      max_tokens: 150
    });

    return completion.choices[0].message?.content?.trim() || 'I apologize, but I could not process your request.';
  }

  // Step 7: Main method that orchestrates the entire process
  async handleUserQuery(message: string): Promise<string> {
    try {
      console.log(`Processing user query: "${message}"`);
      
      // Step 1: Analyze if the message is database-related
      const analysis = await this.analyzeUserMessage(message);
      
      if (analysis.isDatabase) {
        console.log('Processing as database query...');
        
        // Step 2: Generate SQL query with full schema context
        const sqlQuery = await this.generateSQLQuery(message);
        
        // Step 3: Verify the query against database schema
        const verification = await this.verifySQLQuery(sqlQuery);
        
        if (!verification.isValid) {
          console.log('Query verification failed:', verification.errors);
          return `❌ I couldn't generate a valid query: ${verification.errors.join(', ')}. Please try rephrasing your question or ask about available tables.`;
        }
        
        // Step 4: Execute and return formatted results
        return await this.executeSQLQuery(verification.fixedQuery || sqlQuery);
      } else {
        console.log('Processing as general chat...');
        // Handle as general conversation
        return await this.handleGeneralChat(message);
      }
    } catch (error: any) {
      console.error('AI Service Error:', error);
      return `❌ Sorry, I encountered an error: ${error.message}. Please try again.`;
    }
  }

  // Dynamic method to format multi-row results as table
  private formatResultsAsTable(results: any[], keys: string[], totalCount: number): string {
    const displayLimit = 15;
    const displayResults = results.slice(0, displayLimit);
    
    // Calculate dynamic column widths
    const columnWidths = keys.map(key => {
      const headerLength = key.length;
      const maxDataLength = Math.max(
        ...displayResults.map(row => {
          const value = row[key];
          return this.getDisplayLength(value);
        })
      );
      return Math.min(Math.max(headerLength, maxDataLength, 8), 30);
    });

    // Create formatted header
    const header = keys.map((key, index) => 
      this.truncateAndPad(key, columnWidths[index])
    ).join(' | ');

    // Create separator
    const separator = columnWidths.map(width => '-'.repeat(width)).join(' | ');

    // Create formatted rows
    const rows = displayResults.map(row => 
      keys.map((key, index) => {
        const value = row[key];
        const displayValue = this.formatDisplayValue(value);
        return this.truncateAndPad(displayValue, columnWidths[index]);
      }).join(' | ')
    );

    // Combine all parts
    const formattedTable = [header, separator, ...rows].join('\n');
    
    let response = `**Found ${totalCount.toLocaleString()} result(s):**\n\n\`\`\`\n${formattedTable}\n\`\`\``;
    
    if (totalCount > displayLimit) {
      response += `\n\n*Showing first ${displayLimit} of ${totalCount.toLocaleString()} results*`;
    }

    return response;
  }

  // Dynamic method to format display values
  private formatDisplayValue(value: any): string {
    if (value === null || value === undefined) {
      return 'NULL';
    }
    
    if (typeof value === 'number') {
      // Format numbers based on size
      if (value > 999999) {
        return (value / 1000000).toFixed(1) + 'M';
      } else if (value > 999) {
        return value.toLocaleString();
      }
      return String(value);
    }
    
    if (value instanceof Date) {
      return value.toLocaleDateString();
    }
    
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }
    
    return String(value);
  }

  // Helper method to get display length of a value
  private getDisplayLength(value: any): number {
    const displayValue = this.formatDisplayValue(value);
    return displayValue.length;
  }

  // Helper method to truncate and pad strings
  private truncateAndPad(text: string, width: number): string {
    if (text.length > width) {
      return text.substring(0, width - 3) + '...';
    }
    return text.padEnd(width);
  }

  // Dynamic method to format SQL errors
  private formatSQLError(error: any): string {
    if (error.message.includes('Invalid column name')) {
      const columnMatch = error.message.match(/'([^']+)'/);
      const columnName = columnMatch ? columnMatch[1] : 'unknown';
      return `❌ **Column Error:** '${columnName}' doesn't exist. Please check the column name.`;
    } 
    
    if (error.message.includes('Invalid object name')) {
      const tableMatch = error.message.match(/'([^']+)'/);
      const tableName = tableMatch ? tableMatch[1] : 'unknown';
      return `❌ **Table Error:** '${tableName}' doesn't exist. Please check the table name.`;
    }
    
    if (error.message.includes('Incorrect syntax')) {
      return `❌ **Syntax Error:** There's a problem with the SQL syntax. Please try rephrasing your question.`;
    }
    
    return `❌ **SQL Error:** ${error.message}`;
  }

  // ...rest of your existing methods...
}

// Export both the class and the original function for backward compatibility
export default AIService;

export async function getAIResponse(message: string): Promise<string> {
  const aiService = new AIService();
  return await aiService.handleUserQuery(message);
}