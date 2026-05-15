/**
 * One-time migration: adds handoff_message_template column
 * Run: node scripts/migrate-handoff-template.mjs
 */
import postgres from "postgres";
import { config } from "dotenv";

config();

const sql = postgres(process.env.DATABASE_URL);

try {
  await sql`
    ALTER TABLE workspace_bot_settings
    ADD COLUMN IF NOT EXISTS handoff_message_template text
  `;
  console.log("✅ Migration successful — handoff_message_template column added");
} catch (err) {
  console.error("❌ Migration failed:", err.message);
} finally {
  await sql.end();
}
