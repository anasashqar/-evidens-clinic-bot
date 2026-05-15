-- Migration: Add handoff_message_template to workspace_bot_settings
-- Allows each workspace to customize the coordinator notification message

ALTER TABLE workspace_bot_settings
  ADD COLUMN IF NOT EXISTS handoff_message_template text;
