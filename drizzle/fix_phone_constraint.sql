-- إصلاح constraint المريض: حذف القديم وإضافة الصحيح
-- يُشغَّل مرة واحدة في Supabase SQL Editor

-- 1. حذف الـ constraint القديم (phone فقط)
ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_phone_unique;

-- 2. إضافة unique index صحيح على (workspace_id, phone)
CREATE UNIQUE INDEX IF NOT EXISTS unique_workspace_phone 
  ON patients (workspace_id, phone);

-- تأكيد
SELECT 'Done: patients constraint fixed' as status;
