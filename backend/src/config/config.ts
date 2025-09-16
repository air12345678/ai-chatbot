/**
 * config.ts
 * 
 * Centralized configuration management for the AI Chatbot application.
 * Loads configuration from environment variables with sensible defaults.
 */

import { config } from 'dotenv';
import * as path from 'path';

// Load environment variables
config();

/**
 * Configuration interface defining all application settings
 */
export interface AppConfig {
  server: {
    port: number;
    host: string;
    baseUrl: string;
    nodeEnv: string;
  };
  database: {
    type: string;
    host: string;
    server: string;
    name: string;
    user: string;
    password: string;
    port: number;
    encrypt: boolean;
    trustServerCertificate: boolean;
    enableArithAbort: boolean;
    pool: {
      max: number;
      min: number;
      idleTimeoutMillis: number;
    };
    timeouts: {
      request: number;
      connection: number;
    };
    path?: string; // For SQLite
  };
  ai: {
    apiKey: string;
    model: string;
    maxTokens: number;
    temperature: number;
  };
  sql: {
    maxRetries: number;
    throwOnFailure: boolean;
    autoFixGroupBy: boolean;
    useCteRestructuring: boolean;
    verboseLogging: boolean;
  };
  export: {
    directory: string;
    baseUrl: string;
  };
  logging: {
    level: string;
    verbose: boolean;
    debugSqlQueries: boolean;
  };
  security: {
    corsOrigin: string;
    jwtSecret: string;
    sessionSecret: string;
  };
  development: {
    devMode: boolean;
    hotReload: boolean;
  };
}

/**
 * Parse boolean from environment variable
 */
function parseBoolean(value: string | undefined, defaultValue: boolean = false): boolean {
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Parse integer from environment variable
 */
function parseInteger(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse float from environment variable
 */
function parseFloat(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = Number.parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Application configuration object
 */
export const appConfig: AppConfig = {
  server: {
    port: parseInteger(process.env.PORT, 3000),
    host: process.env.HOST || 'localhost',
    baseUrl: process.env.BASE_URL || 'http://localhost:3000',
    nodeEnv: process.env.NODE_ENV || 'development',
  },

  database: {
    type: (process.env.DB_TYPE || 'mssql').toLowerCase(),
    host: process.env.DB_HOST || process.env.DB_SERVER || 'localhost',
    server: process.env.DB_SERVER || process.env.DB_HOST || 'localhost',
    name: process.env.DB_NAME || process.env.DB_DATABASE || '',
    user: process.env.DB_USER || process.env.DB_USERNAME || '',
    password: process.env.DB_PASSWORD || '',
    port: parseInteger(process.env.DB_PORT, 1433), // Default for SQL Server
    encrypt: parseBoolean(process.env.DB_ENCRYPT, true),
    trustServerCertificate: parseBoolean(process.env.DB_TRUST_CERT, true),
    enableArithAbort: parseBoolean(process.env.DB_ENABLE_ARITH_ABORT, true),
    pool: {
      max: parseInteger(process.env.DB_POOL_MAX, 10),
      min: parseInteger(process.env.DB_POOL_MIN, 0),
      idleTimeoutMillis: parseInteger(process.env.DB_IDLE_TIMEOUT, 30000),
    },
    timeouts: {
      request: parseInteger(process.env.DB_REQUEST_TIMEOUT, 30000),
      connection: parseInteger(process.env.DB_CONNECTION_TIMEOUT, 30000),
    },
    path: process.env.DB_PATH, // For SQLite
  },

  ai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4',
    maxTokens: parseInteger(process.env.OPENAI_MAX_TOKENS, 4000),
    temperature: parseFloat(process.env.OPENAI_TEMPERATURE, 0.7),
  },

  sql: {
    maxRetries: parseInteger(process.env.SQL_MAX_RETRIES, 3),
    throwOnFailure: parseBoolean(process.env.SQL_THROW_ON_FAILURE, true),
    autoFixGroupBy: parseBoolean(process.env.SQL_AUTO_FIX_GROUP_BY, true),
    useCteRestructuring: parseBoolean(process.env.SQL_USE_CTE_RESTRUCTURING, true),
    verboseLogging: parseBoolean(process.env.SQL_VERBOSE_LOGGING, true),
  },

  export: {
    directory: process.env.EXPORT_DIR || path.join(__dirname, '../exports'),
    baseUrl: process.env.EXPORT_BASE_URL || 'http://localhost:3000/exports',
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    verbose: parseBoolean(process.env.VERBOSE_LOGGING, true),
    debugSqlQueries: parseBoolean(process.env.DEBUG_SQL_QUERIES, false),
  },

  security: {
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:4200',
    jwtSecret: process.env.JWT_SECRET || 'default-jwt-secret',
    sessionSecret: process.env.SESSION_SECRET || 'default-session-secret',
  },

  development: {
    devMode: parseBoolean(process.env.DEV_MODE, true),
    hotReload: parseBoolean(process.env.HOT_RELOAD, true),
  },
};

/**
 * Validate critical configuration values
 */
export function validateConfig(): void {
  const errors: string[] = [];

  // Critical validations
  if (!appConfig.database.name) {
    errors.push('Database name (DB_NAME) is required');
  }

  if (!appConfig.database.user) {
    errors.push('Database user (DB_USER) is required');
  }

  if (!appConfig.ai.apiKey) {
    errors.push('OpenAI API key (OPENAI_API_KEY) is required');
  }

  if (appConfig.server.nodeEnv === 'production') {
    if (appConfig.security.jwtSecret === 'default-jwt-secret') {
      errors.push('JWT secret must be set in production (JWT_SECRET)');
    }

    if (appConfig.security.sessionSecret === 'default-session-secret') {
      errors.push('Session secret must be set in production (SESSION_SECRET)');
    }
  }

  if (errors.length > 0) {
    console.error('Configuration validation failed:');
    errors.forEach(error => console.error(`  - ${error}`));
    throw new Error('Invalid configuration');
  }
}

/**
 * Log current configuration (safe for production - no secrets)
 */
export function logConfig(): void {
  if (!appConfig.logging.verbose) return;

  console.log('📋 Application Configuration:');
  console.log(`  🌐 Server: ${appConfig.server.host}:${appConfig.server.port} (${appConfig.server.nodeEnv})`);
  console.log(`  🗄️  Database: ${appConfig.database.type} at ${appConfig.database.host}:${appConfig.database.port}`);
  console.log(`  🤖 AI Model: ${appConfig.ai.model}`);
  console.log(`  ⚙️  SQL Fixes: ${appConfig.sql.autoFixGroupBy ? 'Enabled' : 'Disabled'}`);
  console.log(`  📁 Exports: ${appConfig.export.directory}`);
  console.log(`  🔧 Dev Mode: ${appConfig.development.devMode ? 'Enabled' : 'Disabled'}`);
}

/**
 * Get database configuration for specific database type
 */
export function getDatabaseConfig() {
  const { database } = appConfig;

  switch (database.type) {
    case 'mssql':
    case 'sqlserver':
      return {
        server: database.server,
        database: database.name,
        user: database.user,
        password: database.password,
        port: database.port,
        options: {
          encrypt: database.encrypt,
          trustServerCertificate: database.trustServerCertificate,
          enableArithAbort: database.enableArithAbort,
          useUTC: false,
          charset: 'utf8',
        },
        requestTimeout: database.timeouts.request,
        connectionTimeout: database.timeouts.connection,
        pool: database.pool,
      };

    case 'mysql':
      return {
        host: database.host,
        database: database.name,
        user: database.user,
        password: database.password,
        port: database.port || 3306,
      };

    case 'postgresql':
    case 'postgres':
      return {
        host: database.host,
        database: database.name,
        user: database.user,
        password: database.password,
        port: database.port || 5432,
      };

    case 'sqlite':
      return {
        path: database.path || './database.db',
      };

    default:
      throw new Error(`Unsupported database type: ${database.type}`);
  }
}

// Initialize and validate configuration on module load
try {
  validateConfig();
  logConfig();
} catch (error) {
  console.error('Failed to initialize configuration:', error);
  process.exit(1);
}
