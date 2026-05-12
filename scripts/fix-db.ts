import 'dotenv/config';
import { db } from '../server/db/index';
import { sql } from 'drizzle-orm';

async function fix() {
  try {
    await db.execute(sql`ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_phone_unique`);
    console.log('✓ Dropped old constraint patients_phone_unique');
    
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS unique_workspace_phone ON patients (workspace_id, phone)`);
    console.log('✓ Created composite unique index (workspace_id, phone)');
    
    console.log('\n✅ قاعدة البيانات جاهزة للـ multi-tenancy');
  } catch(e: any) {
    console.error('❌ Error:', e.message);
  }
  process.exit(0);
}

fix();
