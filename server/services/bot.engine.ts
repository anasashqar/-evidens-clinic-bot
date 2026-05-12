/**
 * ═══════════════════════════════════════════════════════════════════
 *  BOT ENGINE — Dynamic Multi-tenant
 *
 *  يحل محل bot.ts القديم الثابت
 *
 *  3 مراحل عند وصول أي رسالة:
 *  ┌─────────────────────────────────────────────────────────┐
 *  │  Phase 1 │  Workspace Resolution                        │
 *  │          │  instanceId (Z-API) → WorkspaceConfig        │
 *  ├─────────────────────────────────────────────────────────┤
 *  │  Phase 2 │  Context Loading                             │
 *  │          │  Patient + Conversation من قاعدة البيانات    │
 *  ├─────────────────────────────────────────────────────────┤
 *  │  Phase 3 │  AI Processing                               │
 *  │          │  system_prompt الديناميكي + Groq LLM         │
 *  └─────────────────────────────────────────────────────────┘
 *
 *  الفرق الجوهري عن bot.ts القديم:
 *  - لا يوجد SYSTEM_PROMPT ثابت في الكود
 *  - لا يوجد "مريم" hardcoded — يأتي من workspace_bot_settings
 *  - لا يوجد Z-API instance واحد — يأتي من workspace_zapi_config
 *  - يعمل مع أي قطاع: عيادات، متاجر، مطاعم، عقارات
 * ═══════════════════════════════════════════════════════════════════
 */

import type { WorkspaceZapiConfig, WorkspaceBotSettings, Workspace, Patient, Conversation } from "../../drizzle/schema";
import { sendMessageWithConfig, notifyHandoffWithConfig } from "./zapi.service";
import { invokeLLM } from "../_core/llm";
import {
  getWorkspaceByInstanceId,
  getWorkspaceConfigById,
  getOrCreateWorkspacePatient,
  getActiveWorkspaceConversation,
  createWorkspaceConversation,
  saveMessage,
  getConversationMessages,
  updateConversation,
  updatePatient,
  createHandoff,
  type WorkspaceConfig,
} from "../db/workspace.queries";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BotContext {
  workspaceConfig: WorkspaceConfig;
  patient: Patient;
  conversation: Conversation;
  isSimulator: boolean;
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═════════════════════════════════════════════════════════════════════════════

/**
 * نقطة الدخول الوحيدة للـ bot engine
 * تُستدعى من webhook وأيضاً من المحاكي (simulator)
 */
export async function handleIncomingMessage(
  instanceId: string,         // من Z-API webhook — مفتاح workspace resolution
  phone: string,
  message: string,
  isSimulator: boolean = false,
  simulatorWorkspaceId?: string  // للمحاكي فقط: bypass instanceId lookup
): Promise<void> {
  try {
    // ─── Phase 1: Workspace Resolution ───────────────────────────────────────
    const workspaceConfig = isSimulator && simulatorWorkspaceId
      ? await getWorkspaceConfigById(simulatorWorkspaceId)
      : await resolveWorkspaceByInstance(instanceId);

    if (!workspaceConfig) {
      console.warn(`[BotEngine] No active workspace for instanceId="${instanceId}"`);
      return;
    }

    const { workspace, botSettings, zapiConfig } = workspaceConfig;
    const tag = `[BotEngine][${workspace.slug}]`;
    console.log(`${tag} ← Message from ${phone}: "${message.slice(0, 60)}..."`);

    // ─── Phase 2: Context Loading ─────────────────────────────────────────────
    const patient = await getOrCreateWorkspacePatient(workspace.id, phone);
    if (!patient) {
      console.error(`${tag} Failed to get/create patient`);
      return;
    }

    let conversation = await getActiveWorkspaceConversation(workspace.id, patient.id);
    if (!conversation) {
      conversation = await createWorkspaceConversation(workspace.id, patient.id);
      if (!conversation) {
        console.error(`${tag} Failed to create conversation`);
        return;
      }
    }

    // حفظ الرسالة الواردة
    await saveMessage({
      conversation_id: conversation.id,
      direction: "inbound",
      content: message,
      message_type: "text",
      metadata: {},
    });

    // إذا كانت المحادثة في وضع handoff، تجاهل الرسائل الجديدة
    if (conversation.status === "handoff") {
      console.log(`${tag} Conversation in handoff mode — ignoring`);
      return;
    }

    // ─── Phase 3: AI Processing ───────────────────────────────────────────────
    const context: BotContext = {
      workspaceConfig,
      patient,
      conversation,
      isSimulator,
    };

    await processWithAI(context, message);

  } catch (error) {
    console.error("[BotEngine] Unhandled error:", error);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// PHASE 1 HELPER: Workspace Resolution
// ═════════════════════════════════════════════════════════════════════════════

async function resolveWorkspaceByInstance(instanceId: string): Promise<WorkspaceConfig | null> {
  const config = await getWorkspaceByInstanceId(instanceId);
  if (!config) return null;
  if (!config.workspace.is_active) {
    console.warn(`[BotEngine] Workspace "${config.workspace.slug}" is inactive`);
    return null;
  }
  if (!config.botSettings.is_bot_active) {
    console.warn(`[BotEngine] Bot disabled for workspace "${config.workspace.slug}"`);
    return null;
  }
  return config;
}

// ═════════════════════════════════════════════════════════════════════════════
// PHASE 3: AI Processing
// ═════════════════════════════════════════════════════════════════════════════

async function processWithAI(context: BotContext, userMessage: string): Promise<void> {
  const { botSettings } = context.workspaceConfig;

  try {
    // تاريخ المحادثة من قاعدة البيانات
    const history = await getConversationMessages(context.conversation.id);
    const conversationHistory = history.map((msg: any) => ({
      role: (msg.direction === "inbound" ? "user" : "assistant") as "user" | "assistant",
      content: msg.content,
    }));
    conversationHistory.push({ role: "user", content: userMessage });

    // السياق الحالي: معلومات العميل + ما تم جمعه
    const runtimeContext = buildRuntimeContext(context);

    // ┌─────────────────────────────────────────────────────────────────────┐
    // │  الاستدعاء الرئيسي للـ LLM                                         │
    // │  system_prompt يأتي من قاعدة البيانات — ديناميكي لكل workspace     │
    // └─────────────────────────────────────────────────────────────────────┘
    const response = await invokeLLM({
      messages: [
        { role: "system", content: botSettings.system_prompt }, // ← من DB
        { role: "system", content: runtimeContext },            // ← بيانات حية
        ...conversationHistory,
      ],
    });

    const botResponse =
      typeof response.choices[0]?.message?.content === "string"
        ? response.choices[0].message.content.trim()
        : "";

    if (!botResponse) {
      console.error("[BotEngine] Empty AI response");
      return;
    }

    // هل يجب تفعيل الـ handoff؟
    const shouldHandoff = analyzeHandoffNeed(
      context,
      conversationHistory.length,
      botResponse,
      botSettings
    );

    if (shouldHandoff) {
      await performHandoff(context, botResponse);
      return;
    }

    // استخراج وتحديث السياق
    await extractAndUpdateContext(context, userMessage);

    // إرسال رد البوت
    await sendBotMessage(context, botResponse);

  } catch (error) {
    console.error(`[BotEngine][${context.workspaceConfig.workspace.slug}] AI error:`, error);
  }
}

// ─── Helper: Build runtime context string ─────────────────────────────────────

function buildRuntimeContext(context: BotContext): string {
  const { patient, conversation, workspaceConfig } = context;
  const ctx = (conversation.context as Record<string, unknown>) ?? {};

  return `
معلومات العميل الحالي:
- الاسم: ${patient.name ?? "لم يُذكر بعد"}
- الهاتف: ${patient.phone}
- عميل عائد: ${patient.is_returning_patient ? "نعم" : "لا"}

ما تم جمعه حتى الآن:
${JSON.stringify(ctx, null, 2)}

المنسق البشري المسؤول: ${workspaceConfig.botSettings.handoff_name ?? "المنسق"}
`.trim();
}

// ─── Helper: Handoff analysis ─────────────────────────────────────────────────

function analyzeHandoffNeed(
  context: BotContext,
  messageCount: number,
  botResponse: string,
  botSettings: WorkspaceBotSettings
): boolean {
  const handoffName = botSettings.handoff_name ?? "المنسق";

  // البوت نفسه قرر التحويل (ذكر اسم المنسق أو كلمات التحويل)
  const handoffTriggers = [handoffName, "سأستدعي", "سأحضر", "تحويل", "سأربطك", "سأتصل"];
  if (handoffTriggers.some((kw) => botResponse.includes(kw))) return true;

  // كل المعلومات المطلوبة موجودة
  const ctx = (context.conversation.context as Record<string, unknown>) ?? {};
  if (ctx.name && (ctx.concern || ctx.need) && (ctx.preferred_period || ctx.time_preference)) {
    return true;
  }

  // تجاوز الحد الأقصى للرسائل
  if (messageCount >= botSettings.max_messages_before_handoff) {
    return true;
  }

  return false;
}

// ─── Helper: Extract context from user message ────────────────────────────────

async function extractAndUpdateContext(
  context: BotContext,
  userMessage: string
): Promise<void> {
  const currentCtx = { ...((context.conversation.context as Record<string, unknown>) ?? {}) };
  let patientUpdates: Partial<Pick<Patient, "name" | "is_returning_patient">> = {};

  // استخراج الاسم
  const nameMatch = userMessage.match(/(?:اسمي|أنا|اسم)\s+([ء-يa-zA-Z\s]+)/i);
  if (nameMatch && !currentCtx.name) {
    currentCtx.name = nameMatch[1].trim();
    patientUpdates.name = currentCtx.name as string;
  }

  // استخراج الحاجة الأساسية (للعيادات)
  // ملاحظة: هذا اختياري — المحادثة الأذكى تعتمد على system_prompt المخصص
  const concernMap: Record<string, string> = {
    "جلد|بشرة|وجه": "جلد",
    "شعر|فروة": "شعر",
    "أظافر|ظفر": "أظافر",
    "منزل|شقة|عقار|إيجار|بيع": "عقار",
    "طلب|منتج|سعر|شحن": "متجر",
    "طاولة|حجز|مطعم|أكل": "مطعم",
  };

  for (const [pattern, concern] of Object.entries(concernMap)) {
    if (new RegExp(pattern).test(userMessage) && !currentCtx.concern) {
      currentCtx.concern = concern;
      break;
    }
  }

  // استخراج تفضيل الوقت
  if (!currentCtx.preferred_period) {
    if (userMessage.includes("صباح")) currentCtx.preferred_period = "صباحاً";
    else if (userMessage.includes("مساء")) currentCtx.preferred_period = "مساءً";
    else if (userMessage.includes("بعد الظهر")) currentCtx.preferred_period = "بعد الظهر";
  }

  // هل هو عميل عائد؟
  if (["مرة ثانية", "عدت", "زرت", "كنت", "سبق"].some((kw) => userMessage.includes(kw))) {
    patientUpdates.is_returning_patient = true;
  }

  // حفظ التحديثات
  if (Object.keys(patientUpdates).length > 0) {
    await updatePatient(context.patient.id, patientUpdates);
  }
  await updateConversation(context.conversation.id, { context: currentCtx });
}

// ─── Helper: Perform handoff ──────────────────────────────────────────────────

async function performHandoff(context: BotContext, lastBotMessage: string): Promise<void> {
  const { workspace, botSettings, zapiConfig } = context.workspaceConfig;
  const ctx = (context.conversation.context as Record<string, unknown>) ?? {};

  // أولاً: أرسل آخر رسالة للعميل
  await sendBotMessage(context, lastBotMessage);

  // تحديث حالة المحادثة
  await updateConversation(context.conversation.id, {
    status: "handoff",
    current_step: "handoff",
  });

  // بناء ملخص الـ handoff
  const summary = [
    `الاسم: ${ctx.name ?? "غير محدد"}`,
    `الهاتف: ${context.patient.phone}`,
    `الحاجة: ${(ctx.concern ?? ctx.need) ?? "غير محددة"}`,
    `تفضيل الموعد: ${(ctx.preferred_period ?? ctx.time_preference) ?? "غير محدد"}`,
    `عميل عائد: ${context.patient.is_returning_patient ? "نعم" : "لا"}`,
  ].join("\n");

  // حفظ سجل الـ handoff
  await createHandoff({
    workspace_id: workspace.id,
    conversation_id: context.conversation.id,
    patient_id: context.patient.id,
    reason: "qualification_complete",
    summary,
    status: "pending",
  });

  // إشعار المنسق البشري (إذا كان رقمه مضبوطاً وليس وضع محاكاة)
  if (botSettings.handoff_phone && !context.isSimulator) {
    await notifyHandoffWithConfig({
      coordinatorPhone: botSettings.handoff_phone, // ← من DB، ليس env var
      businessName: botSettings.business_name,
      patientName: (ctx.name as string) ?? "غير محدد",
      patientPhone: context.patient.phone,
      summary,
      zapiConfig, // ← بيانات Z-API الخاصة بهذا الـ workspace
    });
  }

  console.log(`[BotEngine][${workspace.slug}] ✓ Handoff created for ${context.patient.phone}`);
}

// ─── Helper: Send bot message ─────────────────────────────────────────────────

async function sendBotMessage(context: BotContext, message: string): Promise<void> {
  // إرسال عبر Z-API فقط في وضع الإنتاج
  if (!context.isSimulator) {
    await sendMessageWithConfig(
      context.patient.phone,
      message,
      context.workspaceConfig.zapiConfig // ← config خاص بالـ workspace
    ).catch((err) =>
      console.error(`[BotEngine] Z-API send error:`, err)
    );
  }

  // حفظ في قاعدة البيانات دائماً (للمحاكي واللوحة)
  await saveMessage({
    conversation_id: context.conversation.id,
    direction: "outbound",
    content: message,
    message_type: "text",
    metadata: { workspace_id: context.workspaceConfig.workspace.id },
  });
}
