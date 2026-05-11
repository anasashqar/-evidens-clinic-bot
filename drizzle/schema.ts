import { pgEnum, pgTable, serial, text, timestamp, varchar, boolean, jsonb, uuid } from "drizzle-orm/pg-core";

// --- جداول النظام الأساسية ---
export const roleEnum = pgEnum("role", ["user", "admin"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

// --- جداول العيادة والبوت ---
export const patients = pgTable("patients", {
  id: uuid("id").defaultRandom().primaryKey(),
  phone: varchar("phone", { length: 50 }).notNull().unique(),
  name: text("name"),
  is_returning_patient: boolean("is_returning_patient").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const conversations = pgTable("conversations", {
  id: uuid("id").defaultRandom().primaryKey(),
  patient_id: uuid("patient_id").references(() => patients.id).notNull(),
  status: varchar("status", { length: 50 }).default('active').notNull(),
  current_step: varchar("current_step", { length: 50 }).default('initial'),
  context: jsonb("context").default({}),
  started_at: timestamp("started_at").defaultNow().notNull(),
  ended_at: timestamp("ended_at"), // <-- تمت الإضافة هنا
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversation_id: uuid("conversation_id").references(() => conversations.id).notNull(),
  direction: varchar("direction", { length: 20 }).notNull(),
  content: text("content").notNull(),
  message_type: varchar("message_type", { length: 50 }).default('text'),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const handoffs = pgTable("handoffs", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversation_id: uuid("conversation_id").references(() => conversations.id).notNull(),
  patient_id: uuid("patient_id").references(() => patients.id).notNull(),
  reason: varchar("reason", { length: 255 }),
  summary: text("summary"),
  status: varchar("status", { length: 50 }).default('pending'),
  handled_at: timestamp("handled_at"), // تمت الإضافة
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const appointments = pgTable("appointments", {
  id: uuid("id").defaultRandom().primaryKey(),
  patient_id: uuid("patient_id").references(() => patients.id).notNull(),
  appointment_date: timestamp("appointment_date").notNull(),
  status: varchar("status", { length: 50 }).default('scheduled'),
  doctor: varchar("doctor", { length: 255 }),
  appointment_type: varchar("appointment_type", { length: 50 }),
  preferred_period: varchar("preferred_period", { length: 255 }),
  notes: text("notes"), // <-- تمت الإضافة هنا
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// --- Types ---
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;