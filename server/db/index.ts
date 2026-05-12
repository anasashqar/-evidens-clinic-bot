/**
 * ═══════════════════════════════════════════════════════════════════
 *  DB — Drizzle + Supabase Connection
 *
 *  متطلبات .env:
 *    DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres
 *
 *  أو إذا كنت تستخدم Supabase connection pooling (موصى به للـ serverless):
 *    DATABASE_URL=postgresql://postgres.[PROJECT]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
 * ═══════════════════════════════════════════════════════════════════
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../drizzle/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set in environment variables");
}

// postgres-js client
// max: 1 لتجنب مشاكل connection pool في بيئة serverless
const client = postgres(process.env.DATABASE_URL, {
  max: process.env.NODE_ENV === "production" ? 1 : 10,
  ssl: process.env.NODE_ENV === "production" ? "require" : false,
});

// Drizzle instance مع الـ schema المُعرَّف
export const db = drizzle(client, { schema });

export type DB = typeof db;
