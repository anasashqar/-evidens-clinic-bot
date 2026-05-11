ALTER TABLE "appointments" ADD COLUMN "appointment_date" timestamp NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "ended_at" timestamp;--> statement-breakpoint
ALTER TABLE "appointments" DROP COLUMN "date";