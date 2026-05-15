/**
 * ═══════════════════════════════════════════════════════════════════
 *  SCHEMA — Multi-tenant SaaS
 *  التغييرات الجوهرية مقارنة بالـ schema القديم:
 *  1. إضافة جدول workspaces   → كل عميل = workspace واحد
 *  2. إضافة workspace_zapi_config → بيانات Z-API منفصلة لكل workspace
 *  3. إضافة workspace_bot_settings → system prompt وإعدادات handoff لكل workspace
 *  4. إضافة workspace_id لجداول: patients, conversations, handoffs, appointments
 *  5. تغيير قيد UNIQUE على patients.phone → (workspace_id, phone)
 * ═══════════════════════════════════════════════════════════════════
 */

import {
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
  boolean,
  jsonb,
  uuid,
  integer,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const roleEnum = pgEnum("role", ["user", "admin"]);

export const businessTypeEnum = pgEnum("business_type", [
  "clinic",
  "store",
  "restaurant",
  "real_estate",
  "other",
]);

// ─── System Tables (unchanged) ────────────────────────────────────────────────

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

// ─── SaaS Core: Workspaces ────────────────────────────────────────────────────
// كل عميل (عيادة، متجر، مطعم) = workspace واحد

export const workspaces = pgTable("workspaces", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),                          // "عيادة الأمل"
  business_type: businessTypeEnum("business_type").default("clinic").notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(), // "al-amal-clinic" → للـ routing
  is_active: boolean("is_active").default(true).notNull(),
  owner_email: varchar("owner_email", { length: 320 }),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Z-API Config per Workspace ───────────────────────────────────────────────
// كل workspace له instance_id خاص → هو المفتاح لتوجيه الـ webhook

export const workspaceZapiConfig = pgTable("workspace_zapi_config", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspace_id: uuid("workspace_id")
    .references(() => workspaces.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  instance_id: varchar("instance_id", { length: 255 }).notNull().unique(), // ← مفتاح التوجيه
  token: varchar("token", { length: 500 }).notNull(),
  client_token: varchar("client_token", { length: 500 }).notNull(),
  base_url: varchar("base_url", { length: 500 }).default("https://api.z-api.io").notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Bot Settings per Workspace ───────────────────────────────────────────────
// system_prompt ديناميكي → يمكن تغييره من لوحة التحكم بدون إعادة deploy

export const workspaceBotSettings = pgTable("workspace_bot_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspace_id: uuid("workspace_id")
    .references(() => workspaces.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  business_name: text("business_name").notNull(),          // يُذكر في رسائل الـ handoff
  system_prompt: text("system_prompt").notNull(),          // ← شخصية البوت الديناميكية
  handoff_phone: varchar("handoff_phone", { length: 50 }), // رقم المنسق/الموظف
  handoff_name: varchar("handoff_name", { length: 255 }).default("المنسق"), // اسم يُذكر للمستخدم
  max_messages_before_handoff: integer("max_messages_before_handoff").default(12).notNull(),
  is_bot_active: boolean("is_bot_active").default(true).notNull(),
  /**
   * قالب رسالة التحويل — يُخصَّص لكل workspace
   * المتغيرات المدعومة:
   *   {name}            الاسم
   *   {phone}           رقم الهاتف
   *   {phone_link}      رابط واتساب مباشر (wa.me/...)
   *   {concern}         الطلب أو الخدمة
   *   {preferred_period} الوقت المفضل
   *   {is_urgent}       ⚡ مستعجل | عادي
   *   {is_returning}    عائد ✅ | جديد 🆕
   *   {message_count}   عدد الرسائل
   *   {response_time}   وقت الاستجابة
   *   {business_name}   اسم البزنس
   * إذا كان null → يُستخدم القالب الافتراضي
   */
  handoff_message_template: text("handoff_message_template"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Patients (now workspace-scoped) ─────────────────────────────────────────
// نفس الرقم يمكن أن يكون مريضاً في عيادتين مختلفتين → UNIQUE على (workspace_id, phone)

export const patients = pgTable(
  "patients",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspace_id: uuid("workspace_id")
      .references(() => workspaces.id, { onDelete: "cascade" })
      .notNull(),
    phone: varchar("phone", { length: 50 }).notNull(),
    name: text("name"),
    is_returning_patient: boolean("is_returning_patient").default(false),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueWorkspacePhone: uniqueIndex("unique_workspace_phone").on(
      table.workspace_id,
      table.phone
    ),
  })
);

// ─── Conversations (workspace-scoped) ────────────────────────────────────────

export const conversations = pgTable("conversations", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspace_id: uuid("workspace_id")
    .references(() => workspaces.id, { onDelete: "cascade" })
    .notNull(),
  patient_id: uuid("patient_id").references(() => patients.id).notNull(),
  status: varchar("status", { length: 50 }).default("active").notNull(), // active|handoff|closed
  current_step: varchar("current_step", { length: 50 }).default("initial"),
  context: jsonb("context").default({}),
  started_at: timestamp("started_at").defaultNow().notNull(),
  ended_at: timestamp("ended_at"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Messages ────────────────────────────────────────────────────────────────
// لا تحتاج workspace_id مباشرة — ترث من conversation

export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversation_id: uuid("conversation_id")
    .references(() => conversations.id)
    .notNull(),
  direction: varchar("direction", { length: 20 }).notNull(), // inbound | outbound
  content: text("content").notNull(),
  message_type: varchar("message_type", { length: 50 }).default("text"),
  metadata: jsonb("metadata").default({}),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

// ─── Handoffs (workspace-scoped) ─────────────────────────────────────────────

export const handoffs = pgTable("handoffs", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspace_id: uuid("workspace_id")
    .references(() => workspaces.id, { onDelete: "cascade" })
    .notNull(),
  conversation_id: uuid("conversation_id")
    .references(() => conversations.id)
    .notNull(),
  patient_id: uuid("patient_id").references(() => patients.id).notNull(),
  reason: varchar("reason", { length: 255 }),
  summary: text("summary"),
  status: varchar("status", { length: 50 }).default("pending"), // pending|in_progress|completed
  handled_at: timestamp("handled_at"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Appointments (workspace-scoped) ─────────────────────────────────────────

export const appointments = pgTable("appointments", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspace_id: uuid("workspace_id")
    .references(() => workspaces.id, { onDelete: "cascade" })
    .notNull(),
  patient_id: uuid("patient_id").references(() => patients.id).notNull(),
  appointment_date: timestamp("appointment_date").notNull(),
  status: varchar("status", { length: 50 }).default("scheduled"),
  doctor: varchar("doctor", { length: 255 }),
  appointment_type: varchar("appointment_type", { length: 50 }),
  preferred_period: varchar("preferred_period", { length: 255 }),
  notes: text("notes"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Inferred Types ───────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export type Workspace = typeof workspaces.$inferSelect;
export type InsertWorkspace = typeof workspaces.$inferInsert;

export type WorkspaceZapiConfig = typeof workspaceZapiConfig.$inferSelect;
export type InsertWorkspaceZapiConfig = typeof workspaceZapiConfig.$inferInsert;

export type WorkspaceBotSettings = typeof workspaceBotSettings.$inferSelect;
export type InsertWorkspaceBotSettings = typeof workspaceBotSettings.$inferInsert;

export type Patient = typeof patients.$inferSelect;
export type InsertPatient = typeof patients.$inferInsert;

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;

export type Message = typeof messages.$inferSelect;
export type Handoff = typeof handoffs.$inferSelect;
export type Appointment = typeof appointments.$inferSelect;
