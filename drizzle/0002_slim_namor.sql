ALTER TABLE "appointments" ADD COLUMN "appointment_type" varchar(50);--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "started_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "handoffs" ADD COLUMN "handled_at" timestamp;