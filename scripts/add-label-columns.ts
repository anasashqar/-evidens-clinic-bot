import "dotenv/config";
import { db } from "../server/db/index";
import { sql } from "drizzle-orm";

async function run() {
  try {
    await db.execute(sql`ALTER TABLE workspace_bot_settings ADD COLUMN IF NOT EXISTS client_label varchar(100)`);
    await db.execute(sql`ALTER TABLE workspace_bot_settings ADD COLUMN IF NOT EXISTS staff_label varchar(100)`);
    console.log("✅ client_label & staff_label columns added successfully");
  } catch (e) {
    console.error("Migration error:", e);
  }
  process.exit(0);
}

run();
