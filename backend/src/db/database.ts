import sql from 'mssql';
import { config } from 'dotenv';
import { getDatabaseConfig as getConfigFromEnvironment } from '../config/config';

config();

// Database configuration interface
interface DatabaseConfig {
  type: string;
  server?: string;
  host?: string;
  database?: string;
  name?: string;
  user?: string;
  username?: string;
  password?: string;
  port?: number;
  path?: string; // For SQLite
  options?: any;
  pool?: any;
}

// Get database configuration from environment variables
const getDatabaseConfig = (): DatabaseConfig => {
  const dbType = (process.env.DB_TYPE || 'mssql').toLowerCase();
  
  const baseConfig: DatabaseConfig = {
    type: dbType,
    user: process.env.DB_USER || process.env.DB_USERNAME || '',
    password: process.env.DB_PASSWORD || '',
  };

  switch (dbType) {
    case 'mssql':
    case 'sqlserver':
      return {
        ...baseConfig,
        server: process.env.DB_SERVER || process.env.DB_HOST || '',
        database: process.env.DB_NAME || process.env.DB_DATABASE || '',
        port: parseInt(process.env.DB_PORT || '1433'),
        options: {
          encrypt: process.env.DB_ENCRYPT === 'true' || true,
          trustServerCertificate: process.env.DB_TRUST_CERT === 'true' || true,
          enableArithAbort: true,
          useUTC: false,
          charset: 'utf8',
        },
        pool: {
          max: parseInt(process.env.DB_POOL_MAX || '10'),
          min: parseInt(process.env.DB_POOL_MIN || '0'),
          idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000')
        }
      };
    
    case 'mysql':
      return {
        ...baseConfig,
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || process.env.DB_DATABASE || '',
        port: parseInt(process.env.DB_PORT || '3306'),
      };
    
    case 'postgresql':
    case 'postgres':
      return {
        ...baseConfig,
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || process.env.DB_DATABASE || '',
        port: parseInt(process.env.DB_PORT || '5432'),
      };
    
    case 'sqlite':
      return {
        ...baseConfig,
        path: process.env.DB_PATH || './database.db',
      };
    
    default:
      throw new Error(`Unsupported database type: ${dbType}`);
  }
};

const dbConfig = getDatabaseConfig();

// SQL Server specific configuration using centralized config  
const sqlConfig = getConfigFromEnvironment() as any; // Type assertion for compatibility

// Cache for table schemas to avoid repeated database calls
const schemaCache = new Map<string, any[]>();

// Generic function to get table schema (adapts to database type)
export const getTableSchema = async (schemaName: string, tableName: string): Promise<any[]> => {
    const cacheKey = `${schemaName}.${tableName}`;
    
    if (schemaCache.has(cacheKey)) {
        return schemaCache.get(cacheKey) || [];
    }

    let query = '';
    
    // Database-specific schema queries
    switch (dbConfig.type) {
        case 'mssql':
        case 'sqlserver':
            query = `
                SELECT 
                    COLUMN_NAME,
                    DATA_TYPE,
                    IS_NULLABLE,
                    CHARACTER_MAXIMUM_LENGTH
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = @schemaName AND TABLE_NAME = @tableName
                ORDER BY ORDINAL_POSITION
            `;
            break;
        
        case 'mysql':
            query = `
                SELECT 
                    COLUMN_NAME,
                    DATA_TYPE,
                    IS_NULLABLE,
                    CHARACTER_MAXIMUM_LENGTH
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
                ORDER BY ORDINAL_POSITION
            `;
            break;
        
        case 'postgresql':
        case 'postgres':
            query = `
                SELECT 
                    column_name as "COLUMN_NAME",
                    data_type as "DATA_TYPE",
                    is_nullable as "IS_NULLABLE",
                    character_maximum_length as "CHARACTER_MAXIMUM_LENGTH"
                FROM information_schema.columns 
                WHERE table_schema = $1 AND table_name = $2
                ORDER BY ordinal_position
            `;
            break;
        
        default:
            throw new Error(`Schema query not implemented for database type: ${dbConfig.type}`);
    }
    
    let pool: sql.ConnectionPool | undefined;
    try {
        // Currently only SQL Server is implemented
        // TODO: Add support for other database types
        if (dbConfig.type === 'mssql' || dbConfig.type === 'sqlserver') {
            pool = await sql.connect(sqlConfig);
            const request = pool.request();
            request.input('schemaName', sql.VarChar, schemaName);
            request.input('tableName', sql.VarChar, tableName);
            
            const result = await request.query(query);
            const schema = result.recordset;
            
            // Cache the result
            schemaCache.set(cacheKey, schema);
            
            return schema;
        } else {
            throw new Error(`Database connection not yet implemented for type: ${dbConfig.type}`);
        }
    } catch (error) {
        console.error(`Error getting table schema for ${schemaName}.${tableName}:`, error);
        return [];
    } finally {
        if (pool) {
            await pool.close();
        }
    }
};

// Generic function to get all tables (adapts to database type)
export const getAllTables = async (): Promise<any[]> => {
    let query = '';
    
    // Database-specific table listing queries
    switch (dbConfig.type) {
        case 'mssql':
        case 'sqlserver':
            query = `
                SELECT 
                    TABLE_SCHEMA,
                    TABLE_NAME,
                    TABLE_TYPE
                FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_TYPE = 'BASE TABLE'
                ORDER BY TABLE_SCHEMA, TABLE_NAME
            `;
            break;
        
        case 'mysql':
            query = `
                SELECT 
                    TABLE_SCHEMA,
                    TABLE_NAME,
                    TABLE_TYPE
                FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_SCHEMA = DATABASE()
                ORDER BY TABLE_SCHEMA, TABLE_NAME
            `;
            break;
        
        case 'postgresql':
        case 'postgres':
            query = `
                SELECT 
                    table_schema as "TABLE_SCHEMA",
                    table_name as "TABLE_NAME",
                    table_type as "TABLE_TYPE"
                FROM information_schema.tables 
                WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('information_schema', 'pg_catalog')
                ORDER BY table_schema, table_name
            `;
            break;
        
        default:
            throw new Error(`Table listing query not implemented for database type: ${dbConfig.type}`);
    }

    let pool: sql.ConnectionPool | undefined;
    try {
        // Currently only SQL Server is implemented
        if (dbConfig.type === 'mssql' || dbConfig.type === 'sqlserver') {
            pool = await sql.connect(sqlConfig);
            const result = await pool.request().query(query);
            return result.recordset;
        } else {
            throw new Error(`Database connection not yet implemented for type: ${dbConfig.type}`);
        }
    } catch (error) {
        console.error('Error getting all tables:', error);
        throw error;
    } finally {
        if (pool) {
            await pool.close();
        }
    }
};

// Generic function to execute queries (adapts to database type)
export const executeQuery = async (query: string): Promise<any[]> => {
    let pool: sql.ConnectionPool | undefined;
    try {
        // Final safety check: ensure no backticks remain in the query
        // This is a critical fix to prevent the "Incorrect syntax near '`'" error
        const cleanedQuery = query.replace(/`/g, '').trim();
        if (cleanedQuery !== query) {
            console.warn('⚠️ Backticks were found and removed from SQL query at execution time');
        }

        // Currently only SQL Server is implemented
        if (dbConfig.type === 'mssql' || dbConfig.type === 'sqlserver') {
            pool = await sql.connect(sqlConfig);
            console.log('Executing SQL query:', cleanedQuery);
            const result = await pool.request().query(cleanedQuery);
            return result.recordset;
        } else {
            throw new Error(`Query execution not yet implemented for type: ${dbConfig.type}`);
        }
    } catch (error) {
        console.error('Error executing query:', error);
        throw error;
    } finally {
        if (pool) {
            await pool.close();
        }
    }
};

// Backward compatibility - keep the original function name
export const getDatabaseData = executeQuery;

// Export database configuration for other modules
export const getDatabaseInfo = () => ({
    type: dbConfig.type,
    database: dbConfig.database || dbConfig.name,
    server: dbConfig.server || dbConfig.host,
    port: dbConfig.port
});

export default {
    getTableSchema,
    getAllTables,
    executeQuery,
    getDatabaseData: executeQuery,
    getDatabaseInfo
};
