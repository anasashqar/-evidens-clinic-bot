/**
 * ═══════════════════════════════════════════════════════════════════
 *  WORKSPACE QUERIES — Multi-tenant DB layer
 *
 *  جميع الاستعلامات هنا مُعزولة بـ workspace_id
 *  لا يمكن لأي workspace رؤية بيانات workspace آخر
 * ═══════════════════════════════════════════════════════════════════
 */

import { db } from "./index";           // Drizzle instance
import { eq, and, ne, desc, count, gte, lte, lt, isNotNull } from "drizzle-orm";
import {
  workspaces,
  workspaceZapiConfig,
  workspaceBotSettings,
  patients,
  conversations,
  messages,
  handoffs,
  appointments,
  reEngagementLog,
  type Workspace,
  type WorkspaceZapiConfig,
  type WorkspaceBotSettings,
  type Patient,
  type Conversation,
  type InsertWorkspace,
  type InsertAppointment,
} from "../../drizzle/schema";

// ─── Shared Type ──────────────────────────────────────────────────────────────

export interface WorkspaceConfig {
  workspace: Workspace;
  botSettings: WorkspaceBotSettings;
  zapiConfig: WorkspaceZapiConfig;
}

// ═════════════════════════════════════════════════════════════════════════════
// PHASE 1: Workspace Resolution (webhook routing)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * الدالة الأكثر أهمية في المنظومة:
 * تستقبل instanceId من Z-API webhook وتُحضر كل إعدادات الـ workspace المرتبط
 */
export async function getWorkspaceByInstanceId(
  instanceId: string
): Promise<WorkspaceConfig | null> {
  try {
    const rows = await db
      .select({
        workspace: workspaces,
        zapiConfig: workspaceZapiConfig,
        botSettings: workspaceBotSettings,
      })
      .from(workspaceZapiConfig)
      .innerJoin(workspaces, eq(workspaceZapiConfig.workspace_id, workspaces.id))
      .innerJoin(
        workspaceBotSettings,
        eq(workspaceBotSettings.workspace_id, workspaces.id)
      )
      .where(eq(workspaceZapiConfig.instance_id, instanceId))
      .limit(1);

    return rows.length ? rows[0] : null;
  } catch (error) {
    console.error("[DB] getWorkspaceByInstanceId error:", error);
    return null;
  }
}

/**
 * للمحاكي (Simulator): يجلب الإعدادات مباشرة بـ workspaceId
 * يستخدم LEFT JOIN حتى يعمل حتى لو لم يتم إعداد Z-API أو Bot Settings بعد
 */
export async function getWorkspaceConfigById(
  workspaceId: string
): Promise<WorkspaceConfig | null> {
  try {
    const rows = await db
      .select({
        workspace: workspaces,
        zapiConfig: workspaceZapiConfig,
        botSettings: workspaceBotSettings,
      })
      .from(workspaces)
      .leftJoin(workspaceZapiConfig, eq(workspaceZapiConfig.workspace_id, workspaces.id))
      .leftJoin(
        workspaceBotSettings,
        eq(workspaceBotSettings.workspace_id, workspaces.id)
      )
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (!rows.length) return null;

    const row = rows[0];

    // توفير قيم افتراضية إذا لم تكن الإعدادات موجودة بعد
    const botSettings: WorkspaceBotSettings = row.botSettings ?? {
      id: '',
      workspace_id: workspaceId,
      business_name: row.workspace.name,
      system_prompt: `أنت مساعد ذكي لـ ${row.workspace.name}. ساعد الزبائن بود واحترافية. اجمع المعلومات اللازمة ثم أخبرهم أن المنسق سيتواصل معهم.`,
      handoff_phone: null,
      handoff_name: 'المنسق',
      max_messages_before_handoff: 12,
      is_bot_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    } as WorkspaceBotSettings;

    const zapiConfig: WorkspaceZapiConfig = row.zapiConfig ?? {
      id: '',
      workspace_id: workspaceId,
      instance_id: '',
      token: '',
      client_token: '',
      base_url: 'https://api.z-api.io',
      created_at: new Date(),
      updated_at: new Date(),
    } as WorkspaceZapiConfig;

    return {
      workspace: row.workspace,
      botSettings,
      zapiConfig,
    };
  } catch (error) {
    console.error("[DB] getWorkspaceConfigById error:", error);
    return null;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// PATIENTS (workspace-scoped)
// ═════════════════════════════════════════════════════════════════════════════

export async function getOrCreateWorkspacePatient(
  workspaceId: string,
  phone: string
): Promise<Patient | null> {
  try {
    // ابحث عن مريض موجود ضمن نفس الـ workspace
    const existing = await db
      .select()
      .from(patients)
      .where(
        and(eq(patients.workspace_id, workspaceId), eq(patients.phone, phone))
      )
      .limit(1);

    if (existing.length > 0) return existing[0];

    // إنشاء مريض جديد
    const created = await db
      .insert(patients)
      .values({ workspace_id: workspaceId, phone })
      .returning();

    return created[0] ?? null;
  } catch (error) {
    console.error("[DB] getOrCreateWorkspacePatient error:", error);
    return null;
  }
}

export async function updatePatient(
  patientId: string,
  data: Partial<Pick<Patient, "name" | "is_returning_patient">>
): Promise<void> {
  await db
    .update(patients)
    .set({ ...data, updated_at: new Date() })
    .where(eq(patients.id, patientId));
}

// ═════════════════════════════════════════════════════════════════════════════
// CONVERSATIONS (workspace-scoped)
// ═════════════════════════════════════════════════════════════════════════════

export async function getActiveWorkspaceConversation(
  workspaceId: string,
  patientId: string
): Promise<Conversation | null> {
  const rows = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.workspace_id, workspaceId),
        eq(conversations.patient_id, patientId),
        eq(conversations.status, "active")
      )
    )
    .limit(1);

  return rows[0] ?? null;
}

// في server/db/workspace.queries.ts
// أضف بعد getActiveWorkspaceConversation

export async function getLatestWorkspaceConversation(
  workspaceId: string,
  patientId: string
): Promise<Conversation | null> {
  const rows = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.workspace_id, workspaceId),
        eq(conversations.patient_id, patientId)
      )
    )
    .orderBy(desc(conversations.created_at))
    .limit(1);

  return rows[0] ?? null;
}

export async function createWorkspaceConversation(
  workspaceId: string,
  patientId: string
): Promise<Conversation | null> {
  try {
    const created = await db
      .insert(conversations)
      .values({
        workspace_id: workspaceId,
        patient_id: patientId,
        status: "active",
        current_step: "initial",
        context: {},
      })
      .returning();

    return created[0] ?? null;
  } catch (error) {
    console.error("[DB] createWorkspaceConversation error:", error);
    return null;
  }
}

export async function updateConversation(
  conversationId: string,
  data: Partial<Pick<Conversation, "status" | "current_step" | "context" | "ended_at">>
): Promise<void> {
  await db
    .update(conversations)
    .set({ ...data, updated_at: new Date() })
    .where(eq(conversations.id, conversationId));
}

// ═════════════════════════════════════════════════════════════════════════════
// MESSAGES
// ═════════════════════════════════════════════════════════════════════════════

export async function saveMessage(data: {
  conversation_id: string;
  direction: "inbound" | "outbound";
  content: string;
  message_type: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  await db.insert(messages).values(data);
}

export async function getConversationMessages(conversationId: string) {
  return await db
    .select()
    .from(messages)
    .where(eq(messages.conversation_id, conversationId))
    .orderBy(messages.created_at);
}

// ═════════════════════════════════════════════════════════════════════════════
// HANDOFFS (workspace-scoped)
// ═════════════════════════════════════════════════════════════════════════════

export async function createHandoff(data: {
  workspace_id: string;
  conversation_id: string;
  patient_id: string;
  reason: string;
  summary: string;
  status: string;
}): Promise<void> {
  await db.insert(handoffs).values(data);
}

export async function getWorkspaceHandoffs(workspaceId: string) {
  return await db
    .select({
      handoff: handoffs,
      patient: patients,
      conversation: conversations,
    })
    .from(handoffs)
    .innerJoin(patients, eq(handoffs.patient_id, patients.id))
    .innerJoin(conversations, eq(handoffs.conversation_id, conversations.id))
    .where(eq(handoffs.workspace_id, workspaceId))
    .orderBy(desc(handoffs.created_at));
}

export async function updateHandoffStatus(
  handoffId: string,
  status: "pending" | "in_progress" | "completed"
): Promise<void> {
  await db
    .update(handoffs)
    .set({
      status,
      updated_at: new Date(),
      handled_at: status === "completed" ? new Date() : undefined,
    })
    .where(eq(handoffs.id, handoffId));
}

// ═════════════════════════════════════════════════════════════════════════════
// WORKSPACE ADMIN CRUD (Super Admin)
// ═════════════════════════════════════════════════════════════════════════════

export async function getAllWorkspaces() {
  return await db
    .select({
      workspace: workspaces,
      botSettings: workspaceBotSettings,
      zapiConfig: workspaceZapiConfig,
    })
    .from(workspaces)
    .leftJoin(workspaceBotSettings, eq(workspaceBotSettings.workspace_id, workspaces.id))
    .leftJoin(workspaceZapiConfig, eq(workspaceZapiConfig.workspace_id, workspaces.id))
    .orderBy(desc(workspaces.created_at));
}

export async function createWorkspace(
  data: Pick<InsertWorkspace, "name" | "slug" | "business_type" | "owner_email">
) {
  const created = await db.insert(workspaces).values(data).returning();
  return created[0];
}

export async function updateWorkspace(
  workspaceId: string,
  data: Partial<Pick<Workspace, "name" | "is_active">>
) {
  const updated = await db
    .update(workspaces)
    .set({ ...data, updated_at: new Date() })
    .where(eq(workspaces.id, workspaceId))
    .returning();
  return updated[0];
}

/**
 * Upsert: ينشئ الإعدادات إذا لم تكن موجودة، يُحدّثها إذا كانت موجودة
 */
export async function upsertZapiConfig(
  workspaceId: string,
  config: {
    instance_id: string;
    token: string;
    client_token: string;
    base_url?: string;
  }
) {
  const existing = await db
    .select()
    .from(workspaceZapiConfig)
    .where(eq(workspaceZapiConfig.workspace_id, workspaceId))
    .limit(1);

  if (existing.length > 0) {
    const updated = await db
      .update(workspaceZapiConfig)
      .set({ ...config, updated_at: new Date() })
      .where(eq(workspaceZapiConfig.workspace_id, workspaceId))
      .returning();
    return updated[0];
  }

  const created = await db
    .insert(workspaceZapiConfig)
    .values({ workspace_id: workspaceId, ...config })
    .returning();
  return created[0];
}

export async function upsertBotSettings(
  workspaceId: string,
  settings: {
    business_name: string;
    system_prompt: string;
    handoff_phone?: string;
    handoff_name?: string;
    max_messages_before_handoff?: number;
    is_bot_active?: boolean;
  }
) {
  const existing = await db
    .select()
    .from(workspaceBotSettings)
    .where(eq(workspaceBotSettings.workspace_id, workspaceId))
    .limit(1);

  if (existing.length > 0) {
    const updated = await db
      .update(workspaceBotSettings)
      .set({ ...settings, updated_at: new Date() })
      .where(eq(workspaceBotSettings.workspace_id, workspaceId))
      .returning();
    return updated[0];
  }

  const created = await db
    .insert(workspaceBotSettings)
    .values({ workspace_id: workspaceId, ...settings })
    .returning();
  return created[0];
}

// ═════════════════════════════════════════════════════════════════════════════
// DASHBOARD METRICS (workspace-scoped)
// ═════════════════════════════════════════════════════════════════════════════

// ─── 1. Patient Closed Conversations ─────────────────────────────────────────
// تُستخدم في bot.engine.ts لبناء ملخص الزيارات السابقة للمرضى العائدين

/**
 * يجلب المحادثات المنتهية (status = "closed" أو "handoff") لمريض معين
 * في نفس الـ workspace — مع استثناء المحادثة الحالية
 *
 * @param workspaceId  - الـ workspace الحالي
 * @param patientId    - المريض
 * @param excludeId    - المحادثة الحالية (لا نريد إدراجها في التاريخ)
 * @param limit        - أقصى عدد محادثات نريدها (default 5)
 */
export async function getPatientClosedConversations(
  workspaceId: string,
  patientId: string,
  excludeId: string,
  limit = 5
) {
  return await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.workspace_id, workspaceId),
        eq(conversations.patient_id, patientId),
        ne(conversations.id, excludeId),        // ← استثنِ المحادثة الحالية
        ne(conversations.status, "active")       // ← فقط المنتهية
      )
    )
    .orderBy(desc(conversations.ended_at))
    .limit(limit);
}

// ─── 2. Dashboard Metrics (محسّن) ────────────────────────────────────────────
// النسخة القديمة كانت تجلب كل الصفوف ثم تحسب في JavaScript
// هذه النسخة تستخدم count() مباشرة في DB → أسرع بكثير مع البيانات الكبيرة

/**
 * إحصائيات لوحة التحكم لـ workspace معين
 * تستخدم COUNT في DB بدل جلب كل الصفوف
 */
export async function getWorkspaceDashboardMetrics(workspaceId: string) {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const nextWeek = new Date(now);
  nextWeek.setDate(now.getDate() + 7);

  const [
    totalConvs,
    activeConvs,
    handoffConvs,
    totalHandoffsCount,
    pendingHandoffsCount,
    completedHandoffsCount,
    totalPatientsCount,
    returningPatientsCount,
    todayConvsCount,
    todayHandoffsCount,
  ] = await Promise.all([
    // محادثات: الكل
    db
      .select({ value: count() })
      .from(conversations)
      .where(eq(conversations.workspace_id, workspaceId)),

    // محادثات: نشطة
    db
      .select({ value: count() })
      .from(conversations)
      .where(
        and(
          eq(conversations.workspace_id, workspaceId),
          eq(conversations.status, "active")
        )
      ),

    // محادثات: في handoff
    db
      .select({ value: count() })
      .from(conversations)
      .where(
        and(
          eq(conversations.workspace_id, workspaceId),
          eq(conversations.status, "handoff")
        )
      ),

    // handoffs: الكل
    db
      .select({ value: count() })
      .from(handoffs)
      .where(eq(handoffs.workspace_id, workspaceId)),

    // handoffs: pending
    db
      .select({ value: count() })
      .from(handoffs)
      .where(
        and(
          eq(handoffs.workspace_id, workspaceId),
          eq(handoffs.status, "pending")
        )
      ),

    // handoffs: completed
    db
      .select({ value: count() })
      .from(handoffs)
      .where(
        and(
          eq(handoffs.workspace_id, workspaceId),
          eq(handoffs.status, "completed")
        )
      ),

    // patients: الكل
    db
      .select({ value: count() })
      .from(patients)
      .where(eq(patients.workspace_id, workspaceId)),

    // patients: عائدون
    db
      .select({ value: count() })
      .from(patients)
      .where(
        and(
          eq(patients.workspace_id, workspaceId),
          eq(patients.is_returning_patient, true)
        )
      ),

    // محادثات اليوم
    db
      .select({ value: count() })
      .from(conversations)
      .where(
        and(
          eq(conversations.workspace_id, workspaceId),
          gte(conversations.started_at, todayStart)
        )
      ),

    // handoffs اليوم
    db
      .select({ value: count() })
      .from(handoffs)
      .where(
        and(
          eq(handoffs.workspace_id, workspaceId),
          gte(handoffs.created_at, todayStart)
        )
      ),
  ]);

  return {
    totalConversations:     totalConvs[0]?.value         ?? 0,
    activeConversations:    activeConvs[0]?.value         ?? 0,
    handoffConversations:   handoffConvs[0]?.value        ?? 0,
    totalHandoffs:          totalHandoffsCount[0]?.value  ?? 0,
    pendingHandoffs:        pendingHandoffsCount[0]?.value ?? 0,
    completedHandoffs:      completedHandoffsCount[0]?.value ?? 0,
    totalPatients:          totalPatientsCount[0]?.value  ?? 0,
    returningPatients:      returningPatientsCount[0]?.value ?? 0,
    todayConversations:     todayConvsCount[0]?.value     ?? 0,
    todayHandoffs:          todayHandoffsCount[0]?.value  ?? 0,
  };
}

export async function getWorkspaceConversations(workspaceId: string) {
  return await db
    .select({
      conversation: conversations,
      patient: patients,
    })
    .from(conversations)
    .innerJoin(patients, eq(conversations.patient_id, patients.id))
    .where(eq(conversations.workspace_id, workspaceId))
    .orderBy(desc(conversations.updated_at));
}

/** آخر handoff لمحادثة معينة — لمعرفة هل أُنجز أم لا */
export async function getLatestHandoffForConversation(conversationId: string) {
  const rows = await db
    .select()
    .from(handoffs)
    .where(eq(handoffs.conversation_id, conversationId))
    .orderBy(desc(handoffs.created_at))
    .limit(1);
  return rows[0] ?? null;
}

// ═════════════════════════════════════════════════════════════════════════════
// APPOINTMENTS (workspace-scoped)
// ═════════════════════════════════════════════════════════════════════════════

/** إنشاء موعد جديد */
export async function createAppointment(
  data: Omit<InsertAppointment, "id" | "created_at" | "updated_at" | "reminder_12h_sent" | "reminder_2h_sent">
) {
  const created = await db.insert(appointments).values(data).returning();
  return created[0];
}

/** جميع مواعيد workspace مع بيانات المريض */
export async function getWorkspaceAppointments(workspaceId: string) {
  return await db
    .select({
      appointment: appointments,
      patient: patients,
    })
    .from(appointments)
    .innerJoin(patients, eq(appointments.patient_id, patients.id))
    .where(eq(appointments.workspace_id, workspaceId))
    .orderBy(desc(appointments.appointment_date));
}

/** المواعيد القادمة (المستقبلية فقط) */
export async function getUpcomingWorkspaceAppointments(workspaceId: string) {
  const now = new Date();
  return await db
    .select({
      appointment: appointments,
      patient: patients,
    })
    .from(appointments)
    .innerJoin(patients, eq(appointments.patient_id, patients.id))
    .where(
      and(
        eq(appointments.workspace_id, workspaceId),
        gte(appointments.appointment_date, now)
      )
    )
    .orderBy(appointments.appointment_date);
}

/**
 * أقرب موعد قادم لمريض معين خلال الـ 48 ساعة القادمة
 * يُستخدم في bot.engine للكشف عن طلبات الإلغاء/التأجيل
 */
export async function getUpcomingPatientAppointment(
  workspaceId: string,
  patientId: string
) {
  const now   = new Date();
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const rows = await db
    .select()
    .from(appointments)
    .where(
      and(
        eq(appointments.workspace_id, workspaceId),
        eq(appointments.patient_id,   patientId),
        eq(appointments.status,        "scheduled"),
        gte(appointments.appointment_date, now),
        lte(appointments.appointment_date, in48h)
      )
    )
    .orderBy(appointments.appointment_date)
    .limit(1);

  return rows[0] ?? null;
}

/** تحديث حالة الموعد */
export async function updateAppointmentStatus(
  appointmentId: string,
  status: "scheduled" | "confirmed" | "cancelled" | "completed"
) {
  const updated = await db
    .update(appointments)
    .set({ status, updated_at: new Date() })
    .where(eq(appointments.id, appointmentId))
    .returning();
  return updated[0];
}

/** تحديث بيانات الموعد
 *
 * إذا تغيّر appointment_date → نُعيد تصفير علامتي التذكير تلقائياً
 * حتى يُرسل الـ Scheduler التذكيرات للموعد الجديد كما لو كان حجزاً جديداً
 */
export async function updateAppointment(
  appointmentId: string,
  data: Partial<Pick<InsertAppointment, "appointment_date" | "status" | "doctor" | "appointment_type" | "notes" | "preferred_period">>
) {
  // إذا تغيّر التاريخ → أعد تصفير التذكيرات حتى تُرسل للموعد الجديد
  const reminderReset = data.appointment_date
    ? { reminder_12h_sent: false, reminder_2h_sent: false }
    : {};

  const updated = await db
    .update(appointments)
    .set({ ...data, ...reminderReset, updated_at: new Date() })
    .where(eq(appointments.id, appointmentId))
    .returning();
  return updated[0];
}

/** حذف موعد */
export async function deleteAppointment(appointmentId: string) {
  await db.delete(appointments).where(eq(appointments.id, appointmentId));
}

/** مواعيد مريض معين */
export async function getPatientAppointments(patientId: string) {
  return await db
    .select()
    .from(appointments)
    .where(eq(appointments.patient_id, patientId))
    .orderBy(desc(appointments.appointment_date));
}

/** إحصائيات المواعيد لـ workspace */
export async function getAppointmentStats(workspaceId: string) {
  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0,0,0,0);
  const todayEnd   = new Date(now); todayEnd.setHours(23,59,59,999);

  const [total, upcoming, todayAppts, cancelled] = await Promise.all([
    db.select({ value: count() }).from(appointments).where(eq(appointments.workspace_id, workspaceId)),
    db.select({ value: count() }).from(appointments).where(and(eq(appointments.workspace_id, workspaceId), gte(appointments.appointment_date, now), ne(appointments.status as any, 'cancelled'))),
    db.select({ value: count() }).from(appointments).where(and(eq(appointments.workspace_id, workspaceId), gte(appointments.appointment_date, todayStart), lte(appointments.appointment_date, todayEnd))),
    db.select({ value: count() }).from(appointments).where(and(eq(appointments.workspace_id, workspaceId), eq(appointments.status as any, 'cancelled'))),
  ]);

  return {
    total:     total[0]?.value ?? 0,
    upcoming:  upcoming[0]?.value ?? 0,
    today:     todayAppts[0]?.value ?? 0,
    cancelled: cancelled[0]?.value ?? 0,
  };
}