import "dotenv/config";
import postgres from "postgres";
import { readFileSync } from "fs";

const sql = postgres(process.env.DATABASE_URL!, { ssl: "require", max: 1 });

const migration = readFileSync("./drizzle/0008_appointments_reminders.sql", "utf8");

try {
  await sql.unsafe(migration);
  console.log("✅ Migration applied successfully");
} catch (err: any) {
  if (err.message?.includes("already exists") || err.code === "42701" || err.code === "42P07") {
    console.log("✅ Migration already applied (columns/table exist)");
  } else {
    console.error("❌ Migration error:", err.message);
  }
}

await sql.end();
