CREATE TABLE "re_engagement_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"conversation_id" uuid,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"message_text" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "conversation_id" uuid;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "reminder_12h_sent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "reminder_2h_sent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_bot_settings" ADD COLUMN "client_label" varchar(100);--> statement-breakpoint
ALTER TABLE "workspace_bot_settings" ADD COLUMN "staff_label" varchar(100);--> statement-breakpoint
ALTER TABLE "workspace_bot_settings" ADD COLUMN "handoff_message_template" text;--> statement-breakpoint
ALTER TABLE "re_engagement_log" ADD CONSTRAINT "re_engagement_log_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_engagement_log" ADD CONSTRAINT "re_engagement_log_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_engagement_log" ADD CONSTRAINT "re_engagement_log_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;