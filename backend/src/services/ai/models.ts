// Models and type definitions extracted from aiService

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: string;
  maxLength?: number;
}

export interface DatabaseContext {
  tables: any[];
  schemas: { [tableName: string]: ColumnInfo[] };
  loadedAt: Date;
  totalTables: number;
  loadedSchemas: number;
}

export interface MessageAnalysis {
  isDatabase: boolean;
  intent: string; // 'database_query' | 'general_chat'
  analysisType: string; // SIMPLE_QUERY | ANALYTICAL | PROBLEM_SOLVING | ...
}

export interface QueryVerificationResult {
  isValid: boolean;
  fixedQuery?: string;
  errors: string[];
  warnings?: string[];
}
