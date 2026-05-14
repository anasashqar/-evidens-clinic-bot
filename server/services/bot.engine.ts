/**
 * ═══════════════════════════════════════════════════════════════════
 *  BOT ENGINE v2 — إصلاحات + تحسينات
 *
 *  الإصلاحات عن النسخة السابقة:
 *  ────────────────────────────────────────────────────────────────
 *  BUG #1  الرسالة كانت تُرسل للـ LLM مرتين (من DB + push يدوي)
 *          → الآن: نجلب التاريخ قبل الحفظ، ثم نضيف الرسالة مرة واحدة
 *
 *  BUG #2  الـ context القديم (stale) كان يُستخدم في ملخص الـ handoff
 *          → الآن: نحدّث context في الذاكرة قبل أي قرار handoff
 *
 *  BUG #3  Handoff triggers بكلمات مفتاحية هشّة
 *          → الآن: البوت نفسه يقرر عبر should_handoff في الـ JSON output
 *
 *  التحسينات:
 *  ────────────────────────────────────────────────────────────────
 *  ✦  LLM call واحدة بدل اثنتين — structured JSON output
 *     (ردّ البوت + استخراج البيانات + قرار handoff في طلب واحد)
 *
 *  ✦  سياق المحادثات السابقة — عندما يعود مريض قديم، البوت يعرف
 *     ملخص زياراته السابقة تلقائياً
 *
 *  ✦  عداد رسائل دقيق — في context.message_count (بدون query إضافية)
 *
 *  ✦  current_step حقيقي — يُحدَّث في كل رسالة من اللغة الطبيعية
 * ═══════════════════════════════════════════════════════════════════
 */

import type {
  WorkspaceBotSettings,
  Patient,
  Conversation,
} from "../../drizzle/schema";
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
  getLatestHandoffForConversation,
  getPatientClosedConversations,
  type WorkspaceConfig,
} from "../db/workspace.queries";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BotContext {
  workspaceConfig: WorkspaceConfig;
  patient: Patient;
  conversation: Conversation;
  isSimulator: boolean;
}

/**
 * الـ output المنظّم الذي نطلبه من LLM في كل رسالة.
 * استبدل استدعاءين منفصلين بواحد يشمل كل شيء.
 */
interface LLMStructuredOutput {
  /** الرد النصي الذي يُرسل للمستخدم */
  message: string;
  /** المعلومات المستخرجة من رسالة المستخدم */
  extracted: {
    name: string | null;
    concern: string | null;
    preferred_period: string | null;
    is_returning: boolean | null;
  };
  /** هل البوت قرر التحويل للمنسق؟ */
  should_handoff: boolean;
  /** سبب التحويل — يُحفظ في handoff.reason */
  handoff_reason: string | null;
  /**
   * الصمت الذكي — لا يُرسل أي رد للمستخدم
   * يُستخدم عندما الرد سيضر أو لا فائدة منه
   */
  should_be_silent: boolean;
  /** سبب الصمت — للـ logging فقط، لا يُرسل للمستخدم */
  silent_reason: string | null;
  /**
   * الخطوة الحالية — تُخزن في conversations.current_step
   * القيم المسموح بها:
   *   greeting         → أول تواصل، ترحيب
   *   collecting_name  → نطلب الاسم
   *   collecting_concern → نطلب سبب الزيارة / الخدمة
   *   collecting_time  → نطلب الوقت المفضل
   *   confirming       → نؤكد المعلومات مع المستخدم
   *   handoff          → التحويل للمنسق
   */
  current_step:
    | "greeting"
    | "collecting_name"
    | "collecting_concern"
    | "collecting_time"
    | "confirming"
    | "handoff";
}

// ─── تعليمات الـ JSON format — تُضاف runtime فوق system_prompt ───────────────
// لا تُخزَّن في DB، حتى يبقى system_prompt نظيفاً وقابلاً للتعديل من Dashboard

const JSON_FORMAT_INSTRUCTION = `
أعد ردك دائماً كـ JSON صالح بهذا الشكل بالضبط — بدون أي نص خارج الـ JSON وبدون backticks:
{
  "message": "ردك الكامل للمستخدم هنا",
  "extracted": {
    "name": "الاسم الشخصي فقط (كلمة أو كلمتان) أو null",
    "concern": "سبب الزيارة أو الخدمة المطلوبة أو null",
    "preferred_period": "الوقت المفضل (صباحاً/مساءً/تاريخ) أو null",
    "is_returning": true أو false أو null
  },
  "should_handoff": false,
  "handoff_reason": null,
  "should_be_silent": false,
  "silent_reason": null,
  "current_step": "greeting|collecting_name|collecting_concern|collecting_time|confirming|handoff"
}

قواعد الاستخراج:
- name: الاسم الشخصي فقط، لا جمل ولا أوصاف
- is_returning: true فقط إذا ذكر صراحة أنه زار من قبل
- should_handoff: true عندما تكتمل المعلومات الأساسية وأنت جاهز للتحويل
- إذا المعلومة غير موجودة في الرسالة: null

قواعد الصمت الذكي (should_be_silent):
- true عندما الرسالة مجرد إيصال بحت ("تمام"، "👍"، "ع راسي"، "شكراً") بعد تقديم معلومات كاملة
- true عندما يطلب المستخدم صراحةً التوقف ("لا شكراً"، "مو مهتم"، "بتصل أنا")
- true عندما الرسالة عشوائية لا تتعلق بالموضوع ولا تستحق رداً
- false في كل الحالات الأخرى — الشك يعني الرد دائماً
- عند should_be_silent: true يمكن ترك message فارغاً
`.trim();

// ═════════════════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═════════════════════════════════════════════════════════════════════════════

export async function handleIncomingMessage(
  instanceId: string,
  phone: string,
  message: string,
  isSimulator: boolean = false,
  simulatorWorkspaceId?: string
): Promise<void> {
  try {
    // ─── Phase 1: Workspace Resolution ───────────────────────────────────────
    const workspaceConfig =
      isSimulator && simulatorWorkspaceId
        ? await getWorkspaceConfigById(simulatorWorkspaceId)
        : await resolveWorkspaceByInstance(instanceId);

    if (!workspaceConfig) {
      console.warn(`[BotEngine] No active workspace for instanceId="${instanceId}"`);
      return;
    }

    const { workspace, botSettings } = workspaceConfig;
    const tag = `[BotEngine][${workspace.slug}]`;

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

    // ─── Handoff gate ─────────────────────────────────────────────────────────
    if (conversation.status === "handoff") {
      const latestHandoff = await getLatestHandoffForConversation(conversation.id);

      if (latestHandoff?.status === "completed") {
        // المنسق أنهى الـ handoff → محادثة جديدة تحمل ذاكرة المريض
        const newConv = await createWorkspaceConversation(workspace.id, patient.id);
        if (!newConv) {
          console.error(`${tag} Failed to create new conversation after handoff`);
          return;
        }
        conversation = newConv;
        console.log(`${tag} ↺ Handoff completed — new conversation for ${phone}`);
      } else {
        // handoff لا يزال pending/in_progress → تجاهل
        console.log(`${tag} Conversation in handoff — ignoring message from ${phone}`);
        return;
      }
    }

    // ─── Pre-filter: تجاهل الرسائل غير القابلة للرد قبل استدعاء LLM ───────────
    const preFilter = shouldIgnoreBeforeLLM(message);
    if (preFilter.ignore) {
      console.log(`${tag} 🚫 Pre-filter ignore [${preFilter.reason}] from ${phone}`);
      return;
    }

    // ─── Phase 3: AI Processing ───────────────────────────────────────────────
    await processWithAI(
      { workspaceConfig, patient, conversation, isSimulator },
      message
    );
  } catch (error) {
    console.error("[BotEngine] Unhandled error:", error);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// PHASE 1 HELPER
// ═════════════════════════════════════════════════════════════════════════════

async function resolveWorkspaceByInstance(
  instanceId: string
): Promise<WorkspaceConfig | null> {
  const config = await getWorkspaceByInstanceId(instanceId);
  if (!config) return null;
  if (!config.workspace.is_active) {
    console.warn(`[BotEngine] Workspace "${config.workspace.slug}" is inactive`);
    return null;
  }
  if (!config.botSettings.is_bot_active) {
    console.warn(`[BotEngine] Bot disabled for "${config.workspace.slug}"`);
    return null;
  }
  return config;
}

// ═════════════════════════════════════════════════════════════════════════════
// PHASE 3: AI Processing
// ═════════════════════════════════════════════════════════════════════════════

async function processWithAI(context: BotContext, userMessage: string): Promise<void> {
  const { botSettings } = context.workspaceConfig;
  const tag = `[BotEngine][${context.workspaceConfig.workspace.slug}]`;

  try {
    // ┌─────────────────────────────────────────────────────────────────────┐
    // │  STEP A: نجلب التاريخ أولاً ثم نحفظ الرسالة الجديدة               │
    // │  هذا يحلّ BUG #1 (التكرار): التاريخ من DB لا يشمل الرسالة الحالية │
    // │  نضيفها يدوياً مرة واحدة فقط عند إرسالها للـ LLM                   │
    // └─────────────────────────────────────────────────────────────────────┘
    const dbHistory = await getConversationMessages(context.conversation.id);

    // احفظ الرسالة الواردة بعد جلب التاريخ
    await saveMessage({
      conversation_id: context.conversation.id,
      direction: "inbound",
      content: userMessage,
      message_type: "text",
      metadata: {},
    });

    // بناء تاريخ المحادثة للـ LLM
    const conversationHistory = dbHistory.map((msg) => ({
      role: (msg.direction === "inbound" ? "user" : "assistant") as "user" | "assistant",
      content: msg.content,
    }));
    // الرسالة الحالية — مرة واحدة فقط
    conversationHistory.push({ role: "user", content: userMessage });

    // ─── Context الحالي + عداد الرسائل ───────────────────────────────────────
    const currentCtx = {
      ...((context.conversation.context as Record<string, unknown>) ?? {}),
    };
    const messageCount = ((currentCtx.message_count as number) ?? 0) + 1;
    currentCtx.message_count = messageCount;

    // ─── سياق المحادثات السابقة (للمرضى العائدين) ────────────────────────────
    const patientHistory = await buildPatientHistorySummary(context);

    // ─── Runtime context string ───────────────────────────────────────────────
    const runtimeContext = buildRuntimeContext(context, currentCtx, patientHistory);

    // ┌─────────────────────────────────────────────────────────────────────┐
    // │  STEP B: LLM call واحدة — تشمل الرد + الاستخراج + قرار handoff    │
    // │  system_prompt من DB + runtime context + JSON format instruction    │
    // └─────────────────────────────────────────────────────────────────────┘
    const llmResponse = await invokeLLM({
      messages: [
        { role: "system", content: botSettings.system_prompt },     // ← من DB
        { role: "system", content: runtimeContext },                // ← بيانات حية
        { role: "system", content: JSON_FORMAT_INSTRUCTION },       // ← تعليمات الـ JSON
        ...conversationHistory,
      ],
    });

    const rawContent =
      typeof llmResponse.choices[0]?.message?.content === "string"
        ? llmResponse.choices[0].message.content.trim()
        : null;

    if (!rawContent) {
      console.error(`${tag} Empty LLM response`);
      return;
    }

    // ─── Parse structured output ──────────────────────────────────────────────
    const structured = parseStructuredOutput(rawContent, tag);
    if (!structured) {
      // Fallback: أرسل الـ raw كرسالة عادية بدون استخراج
      await sendBotMessage(context, rawContent);
      return;
    }

    const { message: botResponse, extracted, should_handoff, handoff_reason, should_be_silent, silent_reason, current_step } = structured;

    if (!botResponse && !should_be_silent) {
      console.error(`${tag} Empty message in structured output`);
      return;
    }

    // ┌─────────────────────────────────────────────────────────────────────┐
    // │  STEP C: تحديث الـ context في الذاكرة أولاً                        │
    // │  يحلّ BUG #2: performHandoff الآن يقرأ البيانات المحدّثة           │
    // └─────────────────────────────────────────────────────────────────────┘
    if (extracted.name && !currentCtx.name) currentCtx.name = extracted.name;
    if (extracted.concern && !currentCtx.concern) currentCtx.concern = extracted.concern;
    if (extracted.preferred_period && !currentCtx.preferred_period)
      currentCtx.preferred_period = extracted.preferred_period;

    // تحديث بيانات المريض في DB إن لزم
    const patientUpdates: Partial<Pick<Patient, "name" | "is_returning_patient">> = {};
    if (extracted.name && !context.patient.name) patientUpdates.name = extracted.name;
    if (extracted.is_returning === true) patientUpdates.is_returning_patient = true;
    if (Object.keys(patientUpdates).length > 0) {
      await updatePatient(context.patient.id, patientUpdates);
      // تحديث الذاكرة أيضاً
      Object.assign(context.patient, patientUpdates);
    }

    // ─── قرار الـ handoff ─────────────────────────────────────────────────────
    const hitMessageLimit = messageCount >= botSettings.max_messages_before_handoff;
    const shouldHandoff = should_handoff || hitMessageLimit;

    if (hitMessageLimit && !should_handoff) {
      console.log(`${tag} Hit message limit (${messageCount}/${botSettings.max_messages_before_handoff}) — forcing handoff`);
    }

    // ─── تحديث DB بالـ context الجديد والخطوة الحالية ────────────────────────
    const nextStep = shouldHandoff ? "handoff" : current_step;
    await updateConversation(context.conversation.id, {
      context: currentCtx,
      current_step: nextStep,
    });

    // تحديث الـ conversation reference في الذاكرة للـ performHandoff
    context.conversation = { ...context.conversation, context: currentCtx, current_step: nextStep };

    // ─── الصمت الذكي — لا يُرسل رد ───────────────────────────────────────────
    if (should_be_silent) {
      console.log(`${tag} 🤫 Smart silence [${silent_reason ?? "llm_decision"}] — no response sent to ${context.patient.phone}`);
      return;
    }

    // ─── تنفيذ القرار ────────────────────────────────────────────────────────
    if (shouldHandoff) {
      await performHandoff(context, botResponse, handoff_reason ?? "qualification_complete");
    } else {
      await sendBotMessage(context, botResponse);
    }
  } catch (error) {
    console.error(`${tag} AI processing error:`, error);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * فلتر مسبق — قبل استدعاء LLM
 * يتجاهل الرسائل التي من المؤكد أنها لا تحتاج رداً (ملصقات، فارغة...)
 * يوفّر tokens الـ LLM ويُسرّع المعالجة
 */
function shouldIgnoreBeforeLLM(message: string): { ignore: boolean; reason: string } {
  const trimmed = message.trim();

  // رسالة فارغة تماماً
  if (!trimmed) return { ignore: true, reason: "empty_message" };

  // أنواع وسائط لا تحتوي محتوى نصياً قابلاً للرد
  const SILENT_TYPES = ["[sticker]", "[reaction]", "[poll]", "[contact]"];
  if (SILENT_TYPES.includes(trimmed.toLowerCase())) {
    return { ignore: true, reason: `non_actionable_type: ${trimmed}` };
  }

  return { ignore: false, reason: "" };
}

/**
 * يبني نص runtime context يُضاف كـ system message
 * يشمل بيانات المريض الحالية + ما تم جمعه + ملخص الزيارات السابقة
 */
function buildRuntimeContext(
  context: BotContext,
  currentCtx: Record<string, unknown>,
  patientHistory: string
): string {
  const { patient, workspaceConfig } = context;
  const { botSettings } = workspaceConfig;

  const lines = [
    `معلومات العميل الحالي:`,
    `- الاسم: ${patient.name ?? "لم يُذكر بعد"}`,
    `- الهاتف: ${patient.phone}`,
    `- عميل عائد: ${patient.is_returning_patient ? "نعم" : "لا"}`,
    ``,
    `ما تم جمعه في هذه المحادثة:`,
    `- الاسم: ${(currentCtx.name as string) ?? "—"}`,
    `- سبب الزيارة: ${(currentCtx.concern as string) ?? "—"}`,
    `- الوقت المفضل: ${(currentCtx.preferred_period as string) ?? "—"}`,
    ``,
    `المنسق البشري المسؤول: ${botSettings.handoff_name ?? "المنسق"}`,
  ];

  if (patientHistory) lines.push(``, patientHistory);

  return lines.join("\n");
}

/**
 * يجلب ملخص المحادثات السابقة المنتهية للمريض
 * يُستخدم فقط مع المرضى العائدين لمنح البوت ذاكرة سياقية
 */
async function buildPatientHistorySummary(context: BotContext): Promise<string> {
  if (!context.patient.is_returning_patient) return "";

  try {
    const previousConvs = await getPatientClosedConversations(
      context.workspaceConfig.workspace.id,
      context.patient.id,
      context.conversation.id
    );

    if (!previousConvs.length) return "";

    const summaryLines = previousConvs.slice(0, 3).map((conv, i) => {
      const ctx = (conv.context as Record<string, unknown>) ?? {};
      const date = conv.ended_at
        ? new Date(conv.ended_at).toLocaleDateString("ar-SA")
        : "غير محدد";
      const concern = (ctx.concern as string) ?? "غير محددة";
      return `  ${i + 1}. ${date} — ${concern}`;
    });

    return [`سجل الزيارات السابقة للعميل:`, ...summaryLines].join("\n");
  } catch {
    return ""; // لا نوقف المحادثة إذا فشل جلب التاريخ
  }
}

/**
 * Parses LLM structured output — متسامح مع الأخطاء البسيطة
 * يعود بـ null إذا فشل الـ parse تماماً (يُفعّل fallback)
 */
function parseStructuredOutput(raw: string, tag: string): LLMStructuredOutput | null {
  try {
    const cleaned = raw
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    const parsed = JSON.parse(cleaned) as LLMStructuredOutput;

    // تحقق من الحقول الأساسية
    if (typeof parsed.message !== "string") {
      console.warn(`${tag} Structured output missing "message" field`);
      return null;
    }

    // قيم افتراضية آمنة إذا نسيها البوت
    parsed.extracted = parsed.extracted ?? { name: null, concern: null, preferred_period: null, is_returning: null };
    parsed.should_handoff = parsed.should_handoff ?? false;
    parsed.handoff_reason = parsed.handoff_reason ?? null;
    parsed.should_be_silent = parsed.should_be_silent ?? false;
    parsed.silent_reason = parsed.silent_reason ?? null;
    parsed.current_step = parsed.current_step ?? "collecting_name";

    return parsed;
  } catch (err) {
    console.warn(`${tag} Failed to parse structured output, will use raw text:`, err);
    return null;
  }
}

/**
 * ينفّذ الـ handoff:
 * 1. يرسل آخر رسالة للمستخدم
 * 2. يحدّث حالة المحادثة
 * 3. يحفظ سجل الـ handoff بالـ context المحدَّث
 * 4. يُشعر المنسق عبر WhatsApp
 */
async function performHandoff(
  context: BotContext,
  lastBotMessage: string,
  reason: string
): Promise<void> {
  const { workspace, botSettings, zapiConfig } = context.workspaceConfig;
  // context.conversation.context محدَّث في الذاكرة (تم في processWithAI)
  const ctx = (context.conversation.context as Record<string, unknown>) ?? {};

  // أرسل رسالة التحويل للمستخدم
  await sendBotMessage(context, lastBotMessage);

  // حدّث حالة المحادثة في DB
  await updateConversation(context.conversation.id, {
    status: "handoff",
    current_step: "handoff",
    ended_at: new Date(),
  });

  // بناء ملخص الـ handoff من الـ context المحدَّث
  const summary = buildHandoffSummary(ctx, context.patient);

  // احفظ سجل الـ handoff
  await createHandoff({
    workspace_id: workspace.id,
    conversation_id: context.conversation.id,
    patient_id: context.patient.id,
    reason,
    summary,
    status: "pending",
  });

  // أشعر المنسق (في الإنتاج فقط)
  if (botSettings.handoff_phone && !context.isSimulator) {
    await notifyHandoffWithConfig({
      coordinatorPhone: botSettings.handoff_phone,
      businessName: botSettings.business_name,
      patientName: (ctx.name as string) ?? "غير محدد",
      patientPhone: context.patient.phone,
      summary,
      zapiConfig,
    }).catch((err) =>
      console.error(`[BotEngine][${workspace.slug}] Failed to notify coordinator:`, err)
    );
  }

  console.log(`[BotEngine][${workspace.slug}] ✓ Handoff created for ${context.patient.phone} | reason: ${reason}`);
}

/** يبني نص ملخص الـ handoff من الـ context */
function buildHandoffSummary(
  ctx: Record<string, unknown>,
  patient: Patient
): string {
  return [
    `الاسم: ${(ctx.name as string) ?? "غير محدد"}`,
    `الهاتف: ${patient.phone}`,
    `الحاجة: ${((ctx.concern ?? ctx.need) as string) ?? "غير محددة"}`,
    `تفضيل الموعد: ${((ctx.preferred_period ?? ctx.time_preference) as string) ?? "غير محدد"}`,
    `عميل عائد: ${patient.is_returning_patient ? "نعم" : "لا"}`,
    `عدد الرسائل: ${(ctx.message_count as number) ?? "—"}`,
  ].join("\n");
}

/** يرسل رسالة البوت عبر Z-API ويحفظها في DB */
async function sendBotMessage(context: BotContext, message: string): Promise<void> {
  if (!context.isSimulator) {
    await sendMessageWithConfig(
      context.patient.phone,
      message,
      context.workspaceConfig.zapiConfig
    ).catch((err) => console.error(`[BotEngine] Z-API send error:`, err));
  }

  await saveMessage({
    conversation_id: context.conversation.id,
    direction: "outbound",
    content: message,
    message_type: "text",
    metadata: { workspace_id: context.workspaceConfig.workspace.id },
  });
}