// Repository layer: database context loading, schema caching, execution
import { getAllTables, getTableSchema, executeQuery } from '../../db/database';
import { ColumnInfo, DatabaseContext } from './models';

let databaseContext: DatabaseContext | null = null;

export const getDatabaseContext = () => databaseContext;

export const initializeDatabaseContext = async (): Promise<DatabaseContext> => {
  if (databaseContext) return databaseContext;

  console.log('Initializing database context...');
  const tables = await getAllTables();
  console.log(`Found ${tables.length} tables`);

  const schemas: { [tableName: string]: ColumnInfo[] } = {};
  let successCount = 0;

  for (const table of tables) {
    try {
      const tableSchema = await getTableSchema(table.TABLE_SCHEMA, table.TABLE_NAME);
      const tableName = `${table.TABLE_SCHEMA}.${table.TABLE_NAME}`;
      if (tableSchema && Array.isArray(tableSchema) && tableSchema.length > 0) {
        schemas[tableName] = tableSchema.map((col: any) => ({
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
    } catch (err: any) {
      console.warn(`Could not load schema for ${table.TABLE_SCHEMA}.${table.TABLE_NAME}:`, err.message);
    }
  }

  databaseContext = {
    tables,
    schemas,
    loadedAt: new Date(),
    totalTables: tables.length,
    loadedSchemas: successCount
  };

  console.log(`Database context initialized: ${successCount}/${tables.length} table schemas loaded`);
  return databaseContext;
};

export const ensureContext = async () => {
  if (!databaseContext) await initializeDatabaseContext();
  return databaseContext!;
};

export const loadTableSchemaIfMissing = async (schema: string, table: string) => {
  const fullName = `${schema}.${table}`;
  if (!databaseContext) await initializeDatabaseContext();
  if (!databaseContext!.schemas[fullName]) {
    try {
      const tableSchema = await getTableSchema(schema, table);
      if (tableSchema && tableSchema.length) {
        databaseContext!.schemas[fullName] = tableSchema.map((col: any) => ({
          name: col.COLUMN_NAME,
          type: col.DATA_TYPE,
          nullable: col.IS_NULLABLE,
          maxLength: col.CHARACTER_MAXIMUM_LENGTH
        }));
      }
    } catch (err) {
      // swallow; validation will surface error
    }
  }
};

export const runQuery = async (sql: string) => {
  return executeQuery(sql);
};
