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
import { sendMessageWithConfig, sendReplyWithConfig, notifyHandoffWithConfig } from "./zapi.service";
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
    /** رقم هاتف ذكره المستخدم صراحةً في الحوار (غير رقم الواتساب) */
    phone: string | null;
    concern: string | null;
    preferred_period: string | null;
    is_returning: boolean | null;
    /** هل الحالة مستعجلة؟ — مهم للعيادات والطوارئ */
    is_urgent: boolean | null;
  };
  /**
   * حالة طوارئ — يُفعّل handoff فوري بدون انتظار اكتمال البيانات
   * علامات: تورم / خراج / نزيف / كسر / ألم لا يُحتمل
   */
  is_emergency: boolean;
  /** هل البوت قرر التحويل للمنسق؟ */
  should_handoff: boolean;
  /** سبب التحويل — يُحفظ في handoff.reason */
  handoff_reason: string | null;
  /**
   * الصمت الذكي — لا يُرسل أي رد للمستخدم
   * يُستخدم عندما الرد سيضر أو لا فائدة منه
   */
  should_be_silent: boolean;
  /**
   * سبب الصمت — مهم للـ analytics والـ debugging
   *   acknowledgement_terminal → إيصال بعد اكتمال المحادثة وبدون سؤال معلّق
   *   opt_out                  → رفض صريح للتواصل
   *   irrelevant               → رسالة خارج الموضوع نهائياً
   *   duplicate                → تكرار حرفي لرسالة سابقة
   *   reaction                 → إيموجي وحيد بدون قصد
   */
  silent_reason:
    | "acknowledgement_terminal"
    | "opt_out"
    | "irrelevant"
    | "duplicate"
    | "reaction"
    | null;
  /** درجة الثقة بقرار الصمت (0.0–1.0) — ما دون 0.80 = رد تلقائي */
  silence_confidence: number;
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
    "phone": "رقم الهاتف الذي ذكره المستخدم صراحةً في الحوار (ليس رقم واتساب) أو null",
    "concern": "سبب الزيارة أو الخدمة المطلوبة أو null",
    "preferred_period": "الوقت المفضل (صباحاً/مساءً/تاريخ) أو null",
    "is_returning": true أو false أو null,
    "is_urgent": true إذا ذكر صراحة أن الأمر عاجل أو يؤلمه أو يريد أسرع موعد — وإلا false أو null
  },
  "is_emergency": false,
  "should_handoff": false,
  "handoff_reason": null,
  "should_be_silent": false,
  "silent_reason": null,
  "silence_confidence": 0.0,
  "current_step": "greeting|collecting_name|collecting_concern|collecting_time|confirming|handoff"
}

قواعد الاستخراج:
- name: الاسم الشخصي فقط، لا جمل ولا أوصاف
- phone: أي رقم هاتف يذكره المستخدم داخل الحوار — احفظه كما هو بدون تنسيق
- is_returning: true فقط إذا ذكر صراحة أنه زار من قبل
- is_urgent: true فقط عند إلحاح أو ألم أو طارئ — وإلا false
- is_emergency: true فقط عند علامات طوارئ واضحة (تورم وجه/رقبة، خراج، نزيف لا يتوقف، كسر، ألم حاد لا يُحتمل)
  → عند is_emergency: true يجب أيضاً: should_handoff: true و handoff_reason: "emergency"
- should_handoff: true عندما تكتمل المعلومات الأساسية وأنت جاهز للتحويل
- should_handoff: true أيضاً عند غضب أو شكوى أو حالة حساسة أو طلب غير واضح لكنه مهم — البشر أولاً
- إذا المعلومة غير موجودة في الرسالة: null

قواعد الصمت الذكي (should_be_silent) — اقرأ بدقة:
❌ لا يجوز الصمت أبداً إذا:
  - آخر رسالة من البوت كانت سؤالاً ("هل تريد...؟"، "ما اسمك؟" ...) — أي رد يستحق رداً
  - المستخدم في منتصف تقديم معلوماته (current_step ليس confirming أو handoff)
  - هناك أي غموض في النية

✅ يجوز الصمت فقط في هذه الحالات الدقيقة (مع تحديد silent_reason):
  - "acknowledgement_terminal": إيصال بحت ("تمام"، "👍"، "شكراً") بعد اكتمال كل المعلومات وتأكيدها — ولم تنتهِ آخر رسالة للبوت بسؤال
  - "opt_out": رفض صريح ("لا شكراً"، "مو مهتم"، "ما رح آجي")  
  - "irrelevant": رسالة لا علاقة لها بالخدمة نهائياً (أخبار، سياسة، عشوائي)
  - "duplicate": نفس الرسالة الحرفية أُرسلت مسبقاً في هذه المحادثة
  - "reaction": إيموجي وحيد بدون أي نص أو قصد

silence_confidence: درجة ثقتك (0.0–1.0) بقرار الصمت
  - أقل من 0.80 → اجعل should_be_silent: false والرد أضمن
  - الشك يعني الرد دائماً
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
  simulatorWorkspaceId?: string,
  quotedMessageId?: string,
  /**
   * عدد الرسائل الحقيقي في الـ batch — يأتي من الـ debouncer
   * يُستخدم لتحديث message_count بشكل صحيح، وبالتالي منطق handoff صحيح
   * القيمة الافتراضية 1 (للـ simulator وللرسائل الفردية)
   */
  incomingMessageCount: number = 1
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

      const isCompleted = latestHandoff?.status === "completed";

      // Fix #6: Auto-expiry — إذا مرت أكثر من 24 ساعة بدون تحديث → محادثة جديدة تلقائياً
      const HANDOFF_EXPIRY_MS = 24 * 60 * 60 * 1000;
      const handoffAge = latestHandoff?.created_at
        ? Date.now() - new Date(latestHandoff.created_at).getTime()
        : 0;
      const isAutoExpired = handoffAge > HANDOFF_EXPIRY_MS;

      if (isCompleted || isAutoExpired) {
        if (isAutoExpired && !isCompleted) {
          console.log(
            `${tag} ⏰ Handoff auto-expired (${Math.round(handoffAge / 3_600_000)}h) — new conversation for ${phone}`
          );
        }
        const newConv = await createWorkspaceConversation(workspace.id, patient.id);
        if (!newConv) {
          console.error(`${tag} Failed to create new conversation after handoff`);
          return;
        }
        conversation = newConv;
        if (isCompleted) {
          console.log(`${tag} ↺ Handoff completed — new conversation for ${phone}`);
        }
      } else {
        // handoff لا يزال نشط ولم ينتهِ → تجاهل
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
      message,
      quotedMessageId,
      incomingMessageCount
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

async function processWithAI(
  context: BotContext,
  userMessage: string,
  quotedMessageId?: string,
  incomingMessageCount: number = 1
): Promise<void> {
  const { botSettings } = context.workspaceConfig;
  const tag = `[BotEngine][${context.workspaceConfig.workspace.slug}]`;

  try {
    // ┌─────────────────────────────────────────────────────────────────────┐
    // │  STEP A: نجلب التاريخ أولاً ثم نحفظ الرسالة الجديدة               │
    // │  هذا يحلّ BUG #1 (التكرار): التاريخ من DB لا يشمل الرسالة الحالية │
    // │  نضيفها يدوياً مرة واحدة فقط عند إرسالها للـ LLM                   │
    // └─────────────────────────────────────────────────────────────────────┘
    const dbHistory = await getConversationMessages(context.conversation.id);

    // Fix #4: حد التاريخ للـ LLM — آخر 20 رسالة فقط (توفير تكلفة الـ tokens)
    // الـ runtime context يحوي ملخص البيانات فلا حاجة لكل التاريخ
    const MAX_HISTORY = 20;
    const llmHistory = dbHistory.length > MAX_HISTORY
      ? dbHistory.slice(-MAX_HISTORY)
      : dbHistory;

    // احفظ الرسالة الواردة بعد جلب التاريخ
    await saveMessage({
      conversation_id: context.conversation.id,
      direction: "inbound",
      content: userMessage,
      message_type: "text",
      metadata: {},
    });

    // بناء تاريخ المحادثة للـ LLM (محدود بـ MAX_HISTORY)
    const conversationHistory = llmHistory.map((msg) => ({
      role: (msg.direction === "inbound" ? "user" : "assistant") as "user" | "assistant",
      content: msg.content,
    }));
    // الرسالة الحالية — مرة واحدة فقط
    conversationHistory.push({ role: "user", content: userMessage });

    // قاعدة ثابتة: هل آخر رسالة البوت كانت سؤالاً؟ → يمنع الصمت مهما قرر الـ LLM
    const lastOutbound = dbHistory.filter((m) => m.direction === "outbound").at(-1);
    const lastBotMessageWasQuestion = lastOutbound
      ? /[?؟]/.test(lastOutbound.content.trimEnd().slice(-30))
      : false;

    // ─── Context الحالي + عداد الرسائل ───────────────────────────────────────
    const currentCtx = {
      ...((context.conversation.context as Record<string, unknown>) ?? {}),
    };
    // Fix #5: عداد حقيقي — يحتسب الرسائل الفعلية في الـ batch (ليس دائماً 1)
    const messageCount = ((currentCtx.message_count as number) ?? 0) + incomingMessageCount;
    currentCtx.message_count = messageCount;

    // كشف مسبق: هل آخر إجراء للبوت كان صمتاً؟ (لكسر silent loops)
    const wasLastActionSilent = currentCtx.last_action === "silent";

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
      responseFormat: { type: "json_object" },  // ← يجبر الموديل على JSON نظيف
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
      // Fix #2: لا نُرسل الـ JSON الخام للمستخدم — رسالة اعتذار عامة بدلاً
      console.warn(`${tag} Parse failed — sending safe fallback apology`);
      await sendBotMessage(
        context,
        "عذراً، حدث خطأ مؤقت. سيتواصل معك أحد منسقينا قريباً. 🙏",
        quotedMessageId
      );
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
    // phone: رقم هاتف ذكره المستخدم صراحةً في الحوار (مختلف عن رقم الواتساب)
    if (extracted.phone && !currentCtx.extracted_phone) currentCtx.extracted_phone = extracted.phone;
    if (extracted.concern && !currentCtx.concern) currentCtx.concern = extracted.concern;
    if (extracted.preferred_period && !currentCtx.preferred_period)
      currentCtx.preferred_period = extracted.preferred_period;
    // is_urgent / is_emergency: يُحدَّثان فقط إذا أصبحا true (مرة واحدة يكفي)
    if (extracted.is_urgent === true) currentCtx.is_urgent = true;
    if (structured.is_emergency === true) currentCtx.is_emergency = true;

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
    const isEmergency = structured.is_emergency === true;
    const shouldHandoff = should_handoff || hitMessageLimit || isEmergency;

    if (isEmergency) {
      console.log(`${tag} 🚨 Emergency detected — forcing immediate handoff for ${context.patient.phone}`);
    } else if (hitMessageLimit && !should_handoff) {
      console.log(`${tag} Hit message limit (${messageCount}/${botSettings.max_messages_before_handoff}) — forcing handoff`);
    }

    // ─── قرار الصمت النهائي (مع الضمانات) ───────────────────────────────────
    const silenceConfidence = structured.silence_confidence ?? 0;
    const resolvedShouldSilence =
      should_be_silent &&
      !shouldHandoff &&                 // لا صمت إذا كان handoff مقرراً
      !wasLastActionSilent &&           // كسر silent loops
      !lastBotMessageWasQuestion &&     // قاعدة ثابتة: سؤال معلّق = لا صمت أبداً
      silenceConfidence >= 0.80;        // ثقة كافية فقط

    if (resolvedShouldSilence) {
      // إشارات داخلية للـ analytics — opted_out / closed_politely / last_action / terminal_state
      if (silent_reason === "opt_out") {
        currentCtx.opted_out = true;
        currentCtx.terminal_state = "opted_out";
      } else if (silent_reason === "acknowledgement_terminal") {
        currentCtx.closed_politely = true;
        currentCtx.terminal_state = "closed_politely";
      }
      currentCtx.last_action = "silent";
    } else if (shouldHandoff) {
      currentCtx.last_action = "handoff";
    } else {
      currentCtx.last_action = "replied";
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
    if (resolvedShouldSilence) {
      const reason = wasLastActionSilent ? "loop_broken" : (silent_reason ?? "llm_decision");
      console.log(`${tag} 🤫 Smart silence [${reason}] conf=${silenceConfidence} — no response to ${context.patient.phone}`);
      return;
    }

    if (wasLastActionSilent) {
      console.log(`${tag} 🔄 Silent loop detected — resuming conversation for ${context.patient.phone}`);
    }

    // ─── تنفيذ القرار ────────────────────────────────────────────────────────
    if (shouldHandoff) {
      await performHandoff(context, botResponse, handoff_reason ?? "qualification_complete", quotedMessageId);
    } else {
      await sendBotMessage(context, botResponse, quotedMessageId);
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
 *
 * الإصلاح: لا نعتمد على is_returning_patient كبوابة وحيدة —
 * بل نجلب المحادثات السابقة لأي مريض موجود مسبقاً.
 * إذا وجدنا محادثات سابقة بينما العلم لا يزال false،
 * نصحّحه تلقائياً في DB وفي الذاكرة.
 */
async function buildPatientHistorySummary(context: BotContext): Promise<string> {
  try {
    const previousConvs = await getPatientClosedConversations(
      context.workspaceConfig.workspace.id,
      context.patient.id,
      context.conversation.id
    );

    if (!previousConvs.length) return "";

    // تصحيح تلقائي: إذا كان المريض عائداً فعلاً لكن العلم لم يُضبط بعد
    if (!context.patient.is_returning_patient) {
      await updatePatient(context.patient.id, { is_returning_patient: true });
      context.patient.is_returning_patient = true;
      console.log(
        `[BotEngine] ↺ Auto-marked ${context.patient.phone} as returning patient`
      );
    }

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
    // ─── تنظيف متعدد المراحل — يتعامل مع كل أشكال المخرجات ───────────────
    let cleaned = raw
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    // المرحلة 1: محاولة parse مباشر
    let parsed: LLMStructuredOutput | null = null;
    try {
      parsed = JSON.parse(cleaned) as LLMStructuredOutput;
    } catch {
      // المرحلة 2: استخراج JSON من نص مختلط (الموديل أرسل نصاً + JSON)
      const jsonMatch = cleaned.match(/\{[\s\S]*"message"[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]) as LLMStructuredOutput;
          console.log(`${tag} Extracted JSON from mixed output`);
        } catch {
          // المرحلة 3: محاولة أخيرة — ابحث عن أول { وآخر }
          const firstBrace = cleaned.indexOf("{");
          const lastBrace = cleaned.lastIndexOf("}");
          if (firstBrace !== -1 && lastBrace > firstBrace) {
            try {
              parsed = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as LLMStructuredOutput;
              console.log(`${tag} Extracted JSON by brace matching`);
            } catch {
              // فشل نهائي
            }
          }
        }
      }
    }

    if (!parsed) {
      console.warn(`${tag} Failed to parse structured output from LLM`);
      return null;
    }

    // تحقق من الحقول الأساسية
    if (typeof parsed.message !== "string") {
      console.warn(`${tag} Structured output missing "message" field`);
      return null;
    }

    // قيم افتراضية آمنة إذا نسيها البوت
    parsed.extracted = parsed.extracted ?? { name: null, phone: null, concern: null, preferred_period: null, is_returning: null, is_urgent: null };
    parsed.extracted.phone = parsed.extracted.phone ?? null;
    parsed.extracted.is_urgent = parsed.extracted.is_urgent ?? null;
    parsed.is_emergency = parsed.is_emergency ?? false;
    parsed.should_handoff = parsed.should_handoff ?? false;
    parsed.handoff_reason = parsed.handoff_reason ?? null;
    parsed.should_be_silent = parsed.should_be_silent ?? false;
    parsed.silent_reason = parsed.silent_reason ?? null;
    parsed.silence_confidence = parsed.silence_confidence ?? 0;
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
  reason: string,
  quotedMessageId?: string
): Promise<void> {
  const { workspace, botSettings, zapiConfig } = context.workspaceConfig;
  // context.conversation.context محدَّث في الذاكرة (تم في processWithAI)
  const ctx = (context.conversation.context as Record<string, unknown>) ?? {};

  // أرسل رسالة التحويل للمستخدم
  await sendBotMessage(context, lastBotMessage, quotedMessageId);

  // حدّث حالة المحادثة في DB
  await updateConversation(context.conversation.id, {
    status: "handoff",
    current_step: "handoff",
    ended_at: new Date(),
  });

  // بناء ملخص الـ handoff من الـ context المحدَّث
  const summary = buildHandoffSummary(ctx, context.patient, botSettings, context.conversation.started_at);

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

/** يبني نص ملخص الـ handoff — يستخدم القالب المخصص إذا وُجد، وإلا القالب الافتراضي */
function buildHandoffSummary(
  ctx: Record<string, unknown>,
  patient: Patient,
  botSettings: WorkspaceBotSettings,
  conversationStartedAt: Date
): string {
  // ─── حساب وقت الاستجابة ─────────────────────────────────────────────────────
  const elapsedMs = Date.now() - new Date(conversationStartedAt).getTime();
  const elapsedMin = Math.round(elapsedMs / 60_000);
  const responseTime =
    elapsedMin < 1 ? "أقل من دقيقة" : `${elapsedMin} دقيقة`;

  // ─── قيم جاهزة للاستبدال ────────────────────────────────────────────────────
  const name        = (ctx.name as string) ?? "غير محدد";
  const concern     = ((ctx.concern ?? ctx.need) as string) ?? "غير محددة";
  const period      = ((ctx.preferred_period ?? ctx.time_preference) as string) ?? "غير محدد";
  const isUrgent    = (ctx.is_urgent as boolean) ? "⚡ مستعجل" : "عادي";
  const isReturning = patient.is_returning_patient ? "عائد ✅" : "جديد 🆕";
  const msgCount    = String((ctx.message_count as number) ?? "—");
  const bizName     = botSettings.business_name ?? "";
  // رقم الهاتف المستخرج: المذكور في الحوار أولاً، ثم رقم الواتساب
  const contactPhone = (ctx.extracted_phone as string) ?? patient.phone;
  const contactLink  = `https://wa.me/${contactPhone.replace(/\D/g, "")}`;
  const emergencyTag = (ctx.is_emergency as boolean) ? "\n\ud83d\udea8 *حالة طوارئ — يحتاج رداً فوريًا*" : "";

  // ─── القالب المخصص ──────────────────────────────────────────────────────────
  if (botSettings.handoff_message_template) {
    return botSettings.handoff_message_template
      .replace(/\{name\}/g,             name)
      .replace(/\{phone\}/g,            contactPhone)
      .replace(/\{phone_link\}/g,       contactLink)
      .replace(/\{concern\}/g,          concern)
      .replace(/\{preferred_period\}/g, period)
      .replace(/\{is_urgent\}/g,        isUrgent)
      .replace(/\{is_returning\}/g,     isReturning)
      .replace(/\{message_count\}/g,    msgCount)
      .replace(/\{response_time\}/g,    responseTime)
      .replace(/\{business_name\}/g,    bizName);
  }

  // ─── القالب الافتراضي ───────────────────────────────────────────────────────
  return [
    `🔔 *عميل جاهز — ${bizName}*${emergencyTag}`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `👤 الاسم: ${name}`,
    `📞 واتساب: ${patient.phone}`,
    ...(contactPhone !== patient.phone ? [`📞 هاتف مدخول: ${contactPhone}`] : []),
    `🔗 رابط: ${contactLink}`,
    `🔧 الطلب: ${concern}`,
    `⏰ التفضيل: ${period}`,
    `⚡ الإلحاح: ${isUrgent}`,
    `🔁 النوع: ${isReturning}`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `⏱ وقت الاستجابة: ${responseTime}`,
    `💬 عدد الرسائل: ${msgCount}`,
  ].join("\n");
}

/**
 * يرسل رسالة البوت عبر Z-API ويحفظها في DB
 *
 * إذا توفّر quotedMessageId (من الـ debouncer):
 *   → يُرسَل الرد كـ quoted reply على آخر رسالة المستخدم
 *   → يوضّح أن البوت فهم مجموع الرسائل المقطّعة، وليس آخرها فقط
 *   → Fallback تلقائي لـ plain send إذا فشل الـ quoted reply
 */
async function sendBotMessage(
  context: BotContext,
  message: string,
  quotedMessageId?: string
): Promise<void> {
  if (!context.isSimulator) {
    const sendFn =
      quotedMessageId
        ? () => sendReplyWithConfig(
            context.patient.phone,
            message,
            context.workspaceConfig.zapiConfig,
            quotedMessageId
          )
        : () => sendMessageWithConfig(
            context.patient.phone,
            message,
            context.workspaceConfig.zapiConfig
          );

    await sendFn().catch((err) =>
      console.error(`[BotEngine] Z-API send error:`, err)
    );
  }

  await saveMessage({
    conversation_id: context.conversation.id,
    direction: "outbound",
    content: message,
    message_type: "text",
    metadata: { workspace_id: context.workspaceConfig.workspace.id },
  });
}