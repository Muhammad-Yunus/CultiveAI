import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const dbHost = process.env.DB_HOST?.trim();
const dbPort = Number(process.env.DB_PORT?.trim() || 5432);
const dbName = process.env.DB_NAME?.trim() || 'postgres';
const dbUser = process.env.DB_USER?.trim();
const dbPassword = process.env.DB_PASSWORD;
const dbSslEnv = process.env.DB_SSL?.trim().toLowerCase();

const hasRequiredDbParams = Boolean(dbHost && dbUser && dbPassword);

const useSsl =
  dbSslEnv === 'false' || dbSslEnv === '0'
    ? false
    : Boolean(
        dbSslEnv === 'true' ||
          dbSslEnv === '1' ||
          dbSslEnv === 'require' ||
          dbHost?.includes('supabase.com')
      );

export const sqlClient = hasRequiredDbParams
  ? postgres({
      host: dbHost!,
      port: Number.isFinite(dbPort) ? dbPort : 5432,
      database: dbName,
      username: dbUser!,
      password: dbPassword!,
      prepare: false, // Required for Supabase PgBouncer / pooler compatibility
      ssl: useSsl ? { rejectUnauthorized: false } : false,
      max: 10,
      idle_timeout: 20,
      connect_timeout: 15,
    })
  : null;

export const db = sqlClient ? drizzle(sqlClient, { schema }) : null;

export function isDbConfigured(): boolean {
  return Boolean(db);
}
