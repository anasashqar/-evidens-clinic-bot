/**
 * ═══════════════════════════════════════════════════════════════════
 *  WORKSPACE QUERIES — Multi-tenant DB layer
 *
 *  جميع الاستعلامات هنا مُعزولة بـ workspace_id
 *  لا يمكن لأي workspace رؤية بيانات workspace آخر
 * ═══════════════════════════════════════════════════════════════════
 */

import { db } from "./index";           // Drizzle instance
import { eq, and, desc } from "drizzle-orm";
import {
  workspaces,
  workspaceZapiConfig,
  workspaceBotSettings,
  patients,
  conversations,
  messages,
  handoffs,
  appointments,
  type Workspace,
  type WorkspaceZapiConfig,
  type WorkspaceBotSettings,
  type Patient,
  type Conversation,
  type InsertWorkspace,
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

export async function getWorkspaceDashboardMetrics(workspaceId: string) {
  const [convs, allHandoffs, allPatients] = await Promise.all([
    db.select().from(conversations).where(eq(conversations.workspace_id, workspaceId)),
    db.select().from(handoffs).where(eq(handoffs.workspace_id, workspaceId)),
    db.select().from(patients).where(eq(patients.workspace_id, workspaceId)),
  ]);

  return {
    totalConversations: convs.length,
    activeConversations: convs.filter((c) => c.status === "active").length,
    handoffConversations: convs.filter((c) => c.status === "handoff").length,
    totalHandoffs: allHandoffs.length,
    pendingHandoffs: allHandoffs.filter((h) => h.status === "pending").length,
    completedHandoffs: allHandoffs.filter((h) => h.status === "completed").length,
    totalPatients: allPatients.length,
    returningPatients: allPatients.filter((p) => p.is_returning_patient).length,
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