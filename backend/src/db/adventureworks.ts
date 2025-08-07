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

export const getAdventureWorksData = async (query: string) => {
    let pool: sql.ConnectionPool | undefined;
    try {
        console.log('Executing SQL:', query);
        pool = await sql.connect(sqlConfig);
        const result = await pool.request().query(query);
        console.log('SQL Result:', result.recordset);
        return result.recordset;
    } catch (error) {
        console.error('SQL Error:', error);
        throw error;
    } finally {
        if (pool) await pool.close();
    }
};

export const getProductDetails = async (productId: number) => {
    const query = `SELECT * FROM Production.Product WHERE ProductID = @productId`;
    let pool: sql.ConnectionPool | undefined;
    try {
        pool = await sql.connect(sqlConfig);
        const result = await pool.request()
            .input('productId', sql.Int, productId)
            .query(query);
        return result.recordset;
    } finally {
        if (pool) await pool.close();
    }
};