import { DatabaseContext, ColumnInfo } from './models';

// Generic schema analyzer that provides dynamic guidance based on any database schema
export class SchemaAnalyzer {
  // Identify common column patterns in database schemas - using flexible patterns not tied to specific domains
  private static readonly DATE_PATTERNS = [/date/i, /time/i, /when/i, /timestamp/i, /created/i, /modified/i];
  private static readonly ID_PATTERNS = [/id$/i, /^id/i, /key$/i, /code$/i, /num$/i, /no$/i];
  private static readonly MONEY_PATTERNS = [/price/i, /cost/i, /amount/i, /total/i, /sum/i, /value/i, /money/i, /paid/i, /fee/i, /tax/i];
  private static readonly QTY_PATTERNS = [/qty/i, /quantity/i, /count/i, /number/i, /amount/i, /units/i, /items/i, /total/i];
  private static readonly GEO_PATTERNS = [/country/i, /city/i, /state/i, /address/i, /postal/i, /zip/i, /location/i, /region/i, /province/i];
  private static readonly NAME_PATTERNS = [/name/i, /title/i, /label/i, /caption/i, /description/i];
  
  // Identify common table name patterns - using generic structural patterns rather than domain-specific terms
  private static readonly TRANSACTION_PATTERNS = [/transactions?/i, /logs?/i, /entries/i, /records?/i, /details/i, /history/i];
  private static readonly ENTITY_PATTERNS = [/master/i, /entities/i, /types?/i, /catalog/i, /main/i];
  private static readonly LOOKUP_PATTERNS = [/lookup/i, /list/i, /code/i, /ref/i, /reference/i, /category/i, /class/i, /status/i];
  
  /**
   * Detects potential business domains dynamically from schema structure without assumptions
   */
  private static detectBusinessDomains(ctx: DatabaseContext): Map<string, number> {
    const domains = new Map<string, number>();
    const tables = Object.keys(ctx.schemas);
    const allColumnNames: string[] = [];
    
    // Extract all column names to analyze patterns
    tables.forEach(table => {
      ctx.schemas[table].forEach(col => {
        allColumnNames.push(col.name.toLowerCase());
      });
    });
    
    // Count term frequencies across the schema to dynamically detect domains
    const termCounter = new Map<string, number>();
    
    // Process all table and column names to extract base terms
    const extractedTerms = new Set<string>();
    
    // Process table names
    tables.forEach(table => {
      // Split CamelCase and snake_case into terms
      const terms = table
        .replace(/([a-z])([A-Z])/g, '$1 $2') // Split CamelCase
        .replace(/_/g, ' ')                  // Split snake_case
        .toLowerCase()
        .split(/\s+/)
        .filter(term => term.length > 3);    // Only meaningful terms
        
      terms.forEach(term => extractedTerms.add(term));
    });
    
    // Process column names similarly
    allColumnNames.forEach(column => {
      const terms = column
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/_/g, ' ')
        .toLowerCase()
        .split(/\s+/)
        .filter(term => term.length > 3);
        
      terms.forEach(term => extractedTerms.add(term));
    });
    
    // Count term frequency
    extractedTerms.forEach(term => {
      let count = 0;
      
      // Count in table names
      tables.forEach(table => {
        if (table.toLowerCase().includes(term)) count++;
      });
      
      // Count in column names
      allColumnNames.forEach(column => {
        if (column.includes(term)) count++;
      });
      
      if (count > 0) {
        termCounter.set(term, count);
      }
    });
    
    // Extract likely domains based on term frequency
    const sortedTerms = Array.from(termCounter.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10); // Take top 10 most frequent terms
      
    sortedTerms.forEach(([term, count]) => {
      domains.set(term, count);
    });
    
    return domains;
  }

  /**
   * Analyzes database schema to provide context-aware guidance
   * This version is completely generic and makes no assumptions about the database domain
   */
  public static analyzeSchema(ctx: DatabaseContext, userQuery: string): string {
    const tables = Object.keys(ctx.schemas);
    if (!tables.length) return '';
    
    // Extract tables and their columns
    const tableDetails = tables.map(tableName => {
      const columns = ctx.schemas[tableName];
      const columnNames = columns.map(col => col.name);
      
      // Classify columns by type using pattern recognition
      const dateColumns = columns.filter(col => 
        this.DATE_PATTERNS.some(pattern => pattern.test(col.name)) || 
        /date|time/.test((col.type || '').toLowerCase())
      ).map(col => col.name);
      
      const idColumns = columns.filter(col => 
        this.ID_PATTERNS.some(pattern => pattern.test(col.name))
      ).map(col => col.name);
      
      const moneyColumns = columns.filter(col => 
        this.MONEY_PATTERNS.some(pattern => pattern.test(col.name)) ||
        /money|decimal|numeric|float|currency/.test((col.type || '').toLowerCase())
      ).map(col => col.name);
      
      const qtyColumns = columns.filter(col => 
        this.QTY_PATTERNS.some(pattern => pattern.test(col.name))
      ).map(col => col.name);
      
      const geoColumns = columns.filter(col => 
        this.GEO_PATTERNS.some(pattern => pattern.test(col.name))
      ).map(col => col.name);
      
      const nameColumns = columns.filter(col => 
        this.NAME_PATTERNS.some(pattern => pattern.test(col.name)) && 
        /char|varchar|text|nvarchar|string/.test((col.type || '').toLowerCase())
      ).map(col => col.name);
      
      // Classify table type based on structure, not domain-specific terms
      let tableType = 'unknown';
      if (this.TRANSACTION_PATTERNS.some(pattern => pattern.test(tableName))) {
        tableType = 'transaction';
      } else if (this.ENTITY_PATTERNS.some(pattern => pattern.test(tableName))) {
        tableType = 'entity';
      } else if (this.LOOKUP_PATTERNS.some(pattern => pattern.test(tableName))) {
        tableType = 'lookup';
      } else if (idColumns.length >= 2 && columns.length <= 4) {
        tableType = 'junction';
      }
      
      return {
        tableName,
        columnNames,
        dateColumns,
        idColumns,
        moneyColumns,
        qtyColumns,
        geoColumns,
        nameColumns,
        tableType
      };
    });
    
    // Identify potential table relationships
    const relationships = [];
    for (const table1 of tableDetails) {
      for (const table2 of tableDetails) {
        if (table1.tableName === table2.tableName) continue;
        
        // Look for potential foreign keys by naming conventions
        for (const idCol of table1.idColumns) {
          const idColLower = idCol.toLowerCase();
          // Extract base table name (without schema prefix)
          const table2BaseName = table2.tableName.split('.').pop() || table2.tableName;
          const table2BaseNameLower = table2BaseName.toLowerCase();
          
          // Remove trailing 's' to match singular forms
          const table2NameSingular = table2BaseNameLower.replace(/s$/i, '');
          
          // Check for either exact matches or close matches
          if (idColLower.includes(table2NameSingular) || 
              idColLower === table2NameSingular + 'id' ||
              idColLower === table2NameSingular.replace(/[^a-z0-9]/gi, '') + 'id') {
            relationships.push({
              from: table1.tableName,
              to: table2.tableName,
              column: idCol
            });
          }
        }
      }
    }
    
    // Dynamically detect business domains from the schema structure
    const businessDomains = this.detectBusinessDomains(ctx);
    
    // Generate analysis insights based on schema characteristics, not hardcoded domains
    const insights = [];
    
    // Find tables that appear to be central based on relationships
    const tableLinkCount = new Map<string, number>();
    relationships.forEach(rel => {
      tableLinkCount.set(rel.from, (tableLinkCount.get(rel.from) || 0) + 1);
      tableLinkCount.set(rel.to, (tableLinkCount.get(rel.to) || 0) + 1);
    });
    
    // Sort tables by number of relationships (most connected first)
    const sortedTables = Array.from(tableLinkCount.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([tableName]) => tableName);
    
    // Identify likely fact/dimension tables (analytical model detection)
    const likelyFactTables = tableDetails
      .filter(t => t.dateColumns.length > 0 && t.moneyColumns.length > 0)
      .map(t => t.tableName);
      
    const likelyDimTables = tableDetails
      .filter(t => t.nameColumns.length > 0 && t.idColumns.length > 0 && t.dateColumns.length === 0)
      .map(t => t.tableName);
    
    // Create dynamic context for the schema
    let analysisContext = '';
    
    // Add detected business domains if any
    if (businessDomains.size > 0) {
      const topDomains = Array.from(businessDomains.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([domain]) => domain)
        .join(', ');
        
      analysisContext += `Based on the database schema, this appears to be related to: ${topDomains}.\n\n`;
    }
    
    // Add central tables information
    if (sortedTables.length > 0) {
      analysisContext += `The most central tables in this database are: ${sortedTables.slice(0, 3).join(', ')}.\n`;
    }
    
    // Add fact/dimension structure if detected
    if (likelyFactTables.length > 0 || likelyDimTables.length > 0) {
      analysisContext += `\nThis database appears to have an analytical structure with:\n`;
      if (likelyFactTables.length > 0) {
        analysisContext += `- Fact tables: ${likelyFactTables.join(', ')}\n`;
      }
      if (likelyDimTables.length > 0) {
        analysisContext += `- Dimension tables: ${likelyDimTables.join(', ')}\n`;
      }
    }
    
    // Add temporal analysis capability if date columns exist
    const tablesWithDates = tableDetails
      .filter(t => t.dateColumns.length > 0)
      .map(t => `${t.tableName} (${t.dateColumns.join(', ')})`);
      
    if (tablesWithDates.length > 0) {
      analysisContext += `\nTemporal analysis is possible using date fields in: ${tablesWithDates.join(', ')}.\n`;
    }
    
    // Add geographical analysis if applicable
    const tablesWithGeo = tableDetails
      .filter(t => t.geoColumns.length > 0)
      .map(t => `${t.tableName} (${t.geoColumns.join(', ')})`);
      
    if (tablesWithGeo.length > 0) {
      analysisContext += `\nGeographical analysis is possible using location fields in: ${tablesWithGeo.join(', ')}.\n`;
    }
    
    // Add financial analysis if applicable
    const tablesWithMoney = tableDetails
      .filter(t => t.moneyColumns.length > 0)
      .map(t => `${t.tableName} (${t.moneyColumns.join(', ')})`);
      
    if (tablesWithMoney.length > 0) {
      analysisContext += `\nFinancial analysis is possible using monetary fields in: ${tablesWithMoney.join(', ')}.\n`;
    }
    
    return analysisContext;
  }
  
  /**
   * Generates SQL examples based on schema structure
   */
  public static generateExamples(ctx: DatabaseContext): string {
    const tables = Object.keys(ctx.schemas);
    if (tables.length === 0) return '';
    
    let examples = '';
    
    // Choose a suitable example table (preferably one with relationships)
    const tableDetails = tables.map(tableName => {
      const columns = ctx.schemas[tableName];
      return {
        tableName,
        columns,
        idColumns: columns.filter(col => 
          this.ID_PATTERNS.some(pattern => pattern.test(col.name))
        ),
        dateColumns: columns.filter(col => 
          this.DATE_PATTERNS.some(pattern => pattern.test(col.name)) || 
          /date|time/.test((col.type || '').toLowerCase())
        ),
        nameColumns: columns.filter(col => 
          this.NAME_PATTERNS.some(pattern => pattern.test(col.name)) && 
          /char|varchar|text|nvarchar|string/.test((col.type || '').toLowerCase())
        ),
        numericColumns: columns.filter(col => 
          /int|decimal|numeric|float|money|double/.test((col.type || '').toLowerCase())
        )
      };
    });
    
    // Find tables with most columns (likely to be interesting)
    const sortedByColumns = [...tableDetails]
      .sort((a, b) => b.columns.length - a.columns.length);
    
    // Select a good example table
    const exampleTable = sortedByColumns.length > 0 ? sortedByColumns[0] : null;
    
    if (exampleTable) {
      // Extract schema and table name
      const tableParts = exampleTable.tableName.split('.');
      const schemaName = tableParts.length > 1 ? tableParts[0] : 'dbo';
      const tableName = tableParts.length > 1 ? tableParts[1] : tableParts[0];
      
      examples += `-- Example 1: Basic query for ${tableName}\n`;
      examples += `SELECT * FROM [${schemaName}].[${tableName}];\n\n`;
      
      // If table has ID and name columns, show an ordered example
      if (exampleTable.idColumns.length > 0 && exampleTable.nameColumns.length > 0) {
        const idCol = exampleTable.idColumns[0].name;
        const nameCol = exampleTable.nameColumns[0].name;
        
        examples += `-- Example 2: Filtered and ordered query\n`;
        examples += `SELECT [${idCol}], [${nameCol}]\n`;
        examples += `FROM [${schemaName}].[${tableName}]\n`;
        examples += `WHERE [${nameCol}] LIKE 'A%'\n`;
        examples += `ORDER BY [${nameCol}];\n\n`;
      }
      
      // If table has date columns, show a date range example
      if (exampleTable.dateColumns.length > 0) {
        const dateCol = exampleTable.dateColumns[0].name;
        
        examples += `-- Example 3: Date range query\n`;
        examples += `SELECT *\n`;
        examples += `FROM [${schemaName}].[${tableName}]\n`;
        examples += `WHERE [${dateCol}] BETWEEN '2023-01-01' AND '2023-12-31';\n\n`;
      }
      
      // If table has numeric columns, show an aggregation example
      if (exampleTable.numericColumns.length > 0) {
        const numCol = exampleTable.numericColumns[0].name;
        let groupByCol = '';
        
        // Try to find a good column to group by
        if (exampleTable.nameColumns.length > 0) {
          groupByCol = exampleTable.nameColumns[0].name;
        } else if (exampleTable.idColumns.length > 0 && exampleTable.idColumns[0].name !== numCol) {
          groupByCol = exampleTable.idColumns[0].name;
        }
        
        if (groupByCol) {
          examples += `-- Example 4: Aggregation query\n`;
          examples += `SELECT [${groupByCol}], SUM([${numCol}]) as Total, AVG([${numCol}]) as Average\n`;
          examples += `FROM [${schemaName}].[${tableName}]\n`;
          examples += `GROUP BY [${groupByCol}]\n`;
          examples += `ORDER BY Total DESC;\n\n`;
        }
      }
    }
    
    return examples;
  }
}
