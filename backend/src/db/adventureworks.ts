import sql from 'mssql';
import { config } from 'dotenv';

config();

const sqlConfig = {
    server: process.env.DB_SERVER || '',
    database: process.env.DB_NAME || '',
    user: process.env.DB_USER || '',
    password: process.env.DB_PASSWORD || '',
    options: {
        encrypt: true,
        trustServerCertificate: true,
        enableArithAbort: true,
        useUTC: false,
        charset: 'utf8',
    },
    requestTimeout: 30000,
    connectionTimeout: 30000,
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

// Cache for table schemas to avoid repeated database calls
const schemaCache = new Map<string, any[]>();

export const getTableSchema = async (schemaName: string, tableName: string): Promise<any[]> => {
    const cacheKey = `${schemaName}.${tableName}`;
    
    if (schemaCache.has(cacheKey)) {
        return schemaCache.get(cacheKey) || [];
    }

    const query = `
        SELECT 
            COLUMN_NAME,
            DATA_TYPE,
            IS_NULLABLE,
            CHARACTER_MAXIMUM_LENGTH
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = @schemaName AND TABLE_NAME = @tableName
        ORDER BY ORDINAL_POSITION
    `;
    
    let pool: sql.ConnectionPool | undefined;
    try {
        pool = await sql.connect(sqlConfig);
        const result = await pool.request()
            .input('schemaName', sql.VarChar, schemaName)
            .input('tableName', sql.VarChar, tableName)
            .query(query);
        
        const recordset = result.recordset || [];
        schemaCache.set(cacheKey, recordset);
        return recordset;
    } catch (error) {
        console.error(`Error getting schema for ${schemaName}.${tableName}:`, error);
        return []; // Return empty array instead of undefined
    } finally {
        if (pool) await pool.close();
    }
};

export const getAllTables = async (): Promise<any[]> => {
    const query = `
        SELECT 
            TABLE_SCHEMA,
            TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_SCHEMA, TABLE_NAME
    `;
    
    let pool: sql.ConnectionPool | undefined;
    try {
        pool = await sql.connect(sqlConfig);
        const result = await pool.request().query(query);
        return result.recordset || [];
    } catch (error) {
        console.error('Error getting all tables:', error);
        return []; // Return empty array instead of undefined
    } finally {
        if (pool) await pool.close();
    }
};

export const executeDatabaseQuery = async (query: string) => {
    let pool: sql.ConnectionPool | undefined;
    try {
        console.log('Executing SQL:', query);
        pool = await sql.connect(sqlConfig);
        const result = await pool.request().query(query);
        
        // Clean and process the data to handle encoding issues
        const cleanedData = result.recordset.map(row => {
            const cleanedRow: any = {};
            for (const [key, value] of Object.entries(row)) {
                if (typeof value === 'string') {
                    // Clean up encoding issues and special characters
                    cleanedRow[key] = value
                        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
                        .replace(/\uFFFD/g, '?') // Replace replacement characters
                        .trim();
                } else {
                    cleanedRow[key] = value;
                }
            }
            return cleanedRow;
        });
        
        console.log('SQL Result count:', cleanedData.length);
        return cleanedData;
    } catch (error) {
        console.error('SQL Error:', error);
        throw error;
    } finally {
        if (pool) await pool.close();
    }
};