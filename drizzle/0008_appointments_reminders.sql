-- ─── إضافة أعمدة تتبع التذكيرات لجدول المواعيد ───────────────────────────────
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS reminder_12h_sent boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_2h_sent  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS conversation_id   uuid REFERENCES conversations(id);

-- ─── جدول سجل إعادة التفاعل ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS re_engagement_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  patient_id      uuid NOT NULL REFERENCES patients(id),
  conversation_id uuid REFERENCES conversations(id),
  sent_at         timestamp NOT NULL DEFAULT now(),
  message_text    text,
  created_at      timestamp NOT NULL DEFAULT now()
);
