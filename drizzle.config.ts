import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

const dbHost = process.env.DB_HOST?.trim() ?? '';
const dbPort = Number(process.env.DB_PORT?.trim() || 5432);
const dbName = process.env.DB_NAME?.trim() || 'postgres';
const dbUser = process.env.DB_USER?.trim() ?? '';
const dbPassword = process.env.DB_PASSWORD ?? '';
const dbSslEnv = process.env.DB_SSL?.trim().toLowerCase();

const useSsl =
  dbSslEnv === 'false' || dbSslEnv === '0'
    ? false
    : dbSslEnv === 'true' ||
      dbSslEnv === '1' ||
      dbSslEnv === 'require' ||
      dbHost.includes('supabase.com');

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    host: dbHost,
    port: Number.isFinite(dbPort) ? dbPort : 5432,
    user: dbUser,
    password: dbPassword,
    database: dbName,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
  },
});
