/**
 * ═══════════════════════════════════════════════════════════════════
 *  SCHEDULER SERVICE — Automated Reminders & Re-Engagement
 *
 *  يشغّل jobين دوريين:
 *
 *  1. checkAppointmentReminders()  — كل دقيقة
 *     → تذكير 24 ساعة: يُرسل قبل الموعد بـ 24 ساعة (مرة واحدة) [المعيار الصناعي]
 *     → تذكير 2 ساعة:  يُرسل قبل الموعد بـ 2 ساعة (مرة واحدة)
 *     → كلاهما محمي بـ Quiet Hours: لا إرسال قبل 8 صباحاً أو بعد 9 مساءً
 *
 *  2. checkReEngagement()  — كل 30 دقيقة
 *     → يجد المحادثات التي صمت فيها المستخدم أكثر من 3 ساعات
 *     → يُرسل رسالة لطيفة لاستئناف التواصل
 *     → يسجّل الإرسال حتى لا يتكرر
 * ═══════════════════════════════════════════════════════════════════
 */

import { db } from "../db/index";
import { eq, and, lt, gte, lte, desc } from "drizzle-orm";
import {
  appointments,
  patients,
  conversations,
  messages,
  reEngagementLog,
  workspaceZapiConfig,
  workspaceBotSettings,
  workspaces,
  type Appointment,
} from "../../drizzle/schema";
import { sendMessageWithConfig } from "./zapi.service";
import { getWorkspaceLabels } from "../../shared/business-labels";

// ─── Config ───────────────────────────────────────────────────────────────────

const REMINDER_CHECK_INTERVAL_MS  = 60_000;        // كل دقيقة
const RE_ENGAGEMENT_CHECK_INTERVAL_MS = 30 * 60_000; // كل 30 دقيقة
const RE_ENGAGEMENT_SILENCE_HOURS = 24;            // 24 ساعة — المعيار الصناعي
const RE_ENGAGEMENT_MAX_PER_CONV  = 1;             // رسالة واحدة فقط لكل محادثة

// ─── Scheduler Bootstrap ─────────────────────────────────────────────────────

let reminderTimer: ReturnType<typeof setInterval> | null = null;
let reEngageTimer:  ReturnType<typeof setInterval> | null = null;

export function startScheduler(): void {
  if (reminderTimer || reEngageTimer) {
    console.log("[Scheduler] Already running — skipping");
    return;
  }

  console.log("[Scheduler] ✅ Starting appointment reminders & re-engagement jobs");

  // أول تشغيل فوري
  void checkAppointmentReminders();
  void checkReEngagement();

  reminderTimer = setInterval(() => {
    void checkAppointmentReminders();
  }, REMINDER_CHECK_INTERVAL_MS);

  reEngageTimer = setInterval(() => {
    void checkReEngagement();
  }, RE_ENGAGEMENT_CHECK_INTERVAL_MS);
}

export function stopScheduler(): void {
  if (reminderTimer) { clearInterval(reminderTimer); reminderTimer = null; }
  if (reEngageTimer)  { clearInterval(reEngageTimer);  reEngageTimer  = null; }
  console.log("[Scheduler] Stopped");
}

// ═════════════════════════════════════════════════════════════════════════════
// JOB 1: Appointment Reminders
// ═════════════════════════════════════════════════════════════════════════════

async function checkAppointmentReminders(): Promise<void> {
  try {
    const now = new Date();

    // ── تذكير 24 ساعة (المعيار الصناعي) ───────────────────────────────────────
    const window24hStart = new Date(now.getTime() + 23.5 * 60 * 60 * 1000);
    const window24hEnd   = new Date(now.getTime() + 24.5 * 60 * 60 * 1000);

    const due24h = await db
      .select({ appt: appointments, patient: patients })
      .from(appointments)
      .innerJoin(patients, eq(appointments.patient_id, patients.id))
      .where(
        and(
          eq(appointments.status, "scheduled"),
          eq(appointments.reminder_12h_sent, false),   // العمود القديم — يُمثّل الآن 24h
          gte(appointments.appointment_date, window24hStart),
          lte(appointments.appointment_date, window24hEnd)
        )
      );

    for (const { appt, patient } of due24h) {
      await sendAppointmentReminder(appt, patient, "24h");
    }

    // ── تذكير 2 ساعة ─────────────────────────────────────────────────────────
    const window2hStart = new Date(now.getTime() + 1.5 * 60 * 60 * 1000);
    const window2hEnd   = new Date(now.getTime() + 2.5 * 60 * 60 * 1000);

    const due2h = await db
      .select({ appt: appointments, patient: patients })
      .from(appointments)
      .innerJoin(patients, eq(appointments.patient_id, patients.id))
      .where(
        and(
          eq(appointments.status, "scheduled"),
          eq(appointments.reminder_2h_sent, false),
          gte(appointments.appointment_date, window2hStart),
          lte(appointments.appointment_date, window2hEnd)
        )
      );

    for (const { appt, patient } of due2h) {
      await sendAppointmentReminder(appt, patient, "2h");
    }
  } catch (err) {
    console.error("[Scheduler] checkAppointmentReminders error:", err);
  }
}

async function sendAppointmentReminder(
  appt: Appointment,
  patient: { phone: string; name: string | null },
  type: "24h" | "2h"
): Promise<void> {
  try {
    // ─── Quiet Hours Guard ────────────────────────────────────────────────────
    if (isQuietHours()) {
      console.log(`[Scheduler] 🌙 Quiet hours — skipping ${type} reminder for ${patient.phone}`);
      return;
    }

    // جلب إعدادات Z-API و Bot و نوع النشاط للـ workspace
    const config = await getWorkspaceZapiAndBot(appt.workspace_id);
    if (!config) {
      console.warn(`[Scheduler] No Z-API config for workspace ${appt.workspace_id}`);
      return;
    }

    const { zapiConfig, botSettings, businessType } = config;
    const labels = getWorkspaceLabels(businessType, {
      client_label: botSettings.client_label,
      staff_label:  botSettings.staff_label,
    });

    const name         = patient.name ?? "عزيزنا";
    const dateStr      = formatDateArabic(appt.appointment_date);
    const timeStr      = formatTimeArabic(appt.appointment_date);
    const doctorPart   = appt.doctor ? ` مع ${appt.doctor}` : "";
    const businessName = botSettings.business_name;
    const whenLabel    = getRelativeDateLabel(appt.appointment_date);

    let message: string;
    if (type === "24h") {
      message = [
        `🌟 *تذكير بموعدك القادم — ${businessName}*`,
        ``,
        `أهلاً بك ${name}،`,
        `نود تذكيرك بموعدك لدى ${businessName} ${whenLabel}:`,
        ``,
        `📅 التاريخ: ${dateStr}`,
        `⏰ الوقت: ${timeStr}`,
        appt.doctor ? `${labels.staffEmoji} ${labels.staffLabel}: ${appt.doctor}` : "",
        appt.appointment_type ? `${labels.brandEmoji} الخدمة: ${appt.appointment_type}` : "",
        ``,
        `في حال وجود أي ظرف يمنعك من الحضور، نرجو إبلاغنا مسبقاً لإعادة الجدولة.`,
        `نسعد دائماً بخدمتكم. ✨`
      ].filter(Boolean).join("\n");
    } else {
      message = [
        `⏰ *اقترب موعدك! — ${businessName}*`,
        ``,
        `مرحباً ${name}،`,
        `نحن بانتظارك ${whenLabel} خلال الساعتين القادمتين.`,
        `موعدك في تمام الساعة ${timeStr}${doctorPart}.`,
        ``,
        `رافقتكم السلامة، ونراكم قريباً! 😊`
      ].filter(Boolean).join("\n");
    }

    const sent = await sendMessageWithConfig(patient.phone, message, zapiConfig);

    if (sent) {
      await db
        .update(appointments)
        .set({
          [type === "24h" ? "reminder_12h_sent" : "reminder_2h_sent"]: true,
          updated_at: new Date(),
        })
        .where(eq(appointments.id, appt.id));

      console.log(`[Scheduler] ✅ Reminder ${type} sent → ${patient.phone} (appt: ${appt.id})`);
    }
  } catch (err) {
    console.error(`[Scheduler] sendAppointmentReminder error (${type}):`, err);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// JOB 2: Re-Engagement (المستخدمون الصامتون)
// ═════════════════════════════════════════════════════════════════════════════

async function checkReEngagement(): Promise<void> {
  try {
    // ─── Quiet Hours Guard ────────────────────────────────────────────────────
    if (isQuietHours()) return;

    const silenceCutoff = new Date(
      Date.now() - RE_ENGAGEMENT_SILENCE_HOURS * 60 * 60 * 1000
    );

    // جلب جميع المحادثات النشطة
    const activeConvs = await db
      .select({ conv: conversations, patient: patients })
      .from(conversations)
      .innerJoin(patients, eq(conversations.patient_id, patients.id))
      .where(eq(conversations.status, "active"));

    for (const { conv, patient } of activeConvs) {
      // ─── الإصلاح الجوهري: نجلب آخر رسالة في المحادثة (أي اتجاه) ────────────────
      // وليس فقط "أي رسالة واردة قديمة" — هذا يمنع إرسال الرسالة لمريض لا يزال يتحدث
      const [latestMsg] = await db
        .select()
        .from(messages)
        .where(eq(messages.conversation_id, conv.id))
        .orderBy(desc(messages.created_at))
        .limit(1);

      if (!latestMsg) continue;

      // الشرطان الحقيقيان:
      // 1. آخر رسالة في المحادثة (بغض النظر عن اتجاهها) مضى عليها 24 ساعة
      // 2. آخر رسالة كانت من المريض (inbound) — يعني البوت رد والمريض صمت
      if (
        latestMsg.created_at >= silenceCutoff ||
        latestMsg.direction !== "inbound"
      ) continue;

      // تحقق: هل أُرسلت رسالة re-engagement لهذه المحادثة من قبل؟
      const alreadySent = await db
        .select()
        .from(reEngagementLog)
        .where(eq(reEngagementLog.conversation_id, conv.id))
        .limit(RE_ENGAGEMENT_MAX_PER_CONV);

      if (alreadySent.length >= RE_ENGAGEMENT_MAX_PER_CONV) continue;

      // جلب إعدادات المساحة
      const config = await getWorkspaceZapiAndBot(conv.workspace_id);
      if (!config) continue;

      const { zapiConfig, botSettings, businessType } = config;
      const labels       = getWorkspaceLabels(businessType, {
        client_label: botSettings.client_label,
        staff_label:  botSettings.staff_label,
      });
      const name         = patient.name ?? "";
      const businessName = botSettings.business_name;
      const message      = buildReEngagementMessage(name, businessName, labels.brandEmoji);
      const sent         = await sendMessageWithConfig(patient.phone, message, zapiConfig);

      if (sent) {
        await db.insert(reEngagementLog).values({
          workspace_id:    conv.workspace_id,
          patient_id:      conv.patient_id,
          conversation_id: conv.id,
          message_text:    message,
        });
        console.log(`[Scheduler] 💬 Re-engagement sent → ${patient.phone} (last msg: ${latestMsg.created_at.toISOString()})`);
      }
    }
  } catch (err) {
    console.error("[Scheduler] checkReEngagement error:", err);
  }
}

function buildReEngagementMessage(name: string, businessName: string, emoji: string): string {
  const greeting = name ? `أهلاً بك ${name}،` : "أهلاً بك،";
  return [
    `👋 *${greeting}*`,
    ``,
    `لقد سعدنا بتواصلك مع *${businessName}*.`,
    `لاحظنا توقف المحادثة قبل أن نتمكن من مساعدتك بالكامل.`,
    ``,
    `يسعدنا دائماً خدمتك. هل ترغب في استكمال المحادثة لتحديد موعد يناسبك؟ ${emoji}✨`,
    ``,
    `نرجو الرد بـ:`,
    `✅ *نعم* — وسنقوم بترتيب الموعد فوراً.`,
    `❌ *لا، شكراً* — في حال تغيرت خططك.`,
    ``,
    `بانتظار تواصلك! 🙏`,
  ].join("\n");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Quiet Hours — لا نرسل أي تذكير قبل 8 صباحاً أو بعد 9 مساءً (توقيت غزة)
 * يمنع إزعاج المرضى في أوقات غير مناسبة
 */
function isQuietHours(): boolean {
  const hour = Number(
    new Date().toLocaleString("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: "Asia/Gaza",
    })
  );
  // ساعة العمل: 8 صباحاً (8) ← → 9 مساءً (21)
  return hour < 8 || hour >= 21;
}

/**
 * يحسب التسمية الزمنية النسبية لموعد ما:
 *   "اليوم"  — إذا كان الموعد في نفس اليوم الميلادي (غزة)
 *   "غداً"   — إذا كان الموعد غداً
 *   التاريخ الكامل — لأي يوم آخر
 *
 * يحل مشكلة الرسائل التي تقول "غداً" بشكل خاطئ.
 */
function getRelativeDateLabel(appointmentDate: Date): string {
  const tz = "Asia/Gaza";
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-CA", { timeZone: tz }); // YYYY-MM-DD

  const apptDay     = fmt(appointmentDate);
  const todayDay    = fmt(new Date());
  const tomorrowDay = fmt(new Date(Date.now() + 24 * 60 * 60 * 1000));

  if (apptDay === todayDay)    return "اليوم";
  if (apptDay === tomorrowDay) return "غداً";
  return formatDateArabic(appointmentDate); // التاريخ الكامل
}

async function getWorkspaceZapiAndBot(workspaceId: string) {
  try {
    const rows = await db
      .select({
        zapiConfig: workspaceZapiConfig,
        botSettings: workspaceBotSettings,
        businessType: workspaces.business_type,
      })
      .from(workspaceZapiConfig)
      .innerJoin(
        workspaceBotSettings,
        eq(workspaceBotSettings.workspace_id, workspaceZapiConfig.workspace_id)
      )
      .innerJoin(
        workspaces,
        eq(workspaces.id, workspaceZapiConfig.workspace_id)
      )
      .where(eq(workspaceZapiConfig.workspace_id, workspaceId))
      .limit(1);

    return rows.length ? rows[0] : null;
  } catch {
    return null;
  }
}

function formatDateArabic(date: Date): string {
  return new Date(date).toLocaleDateString("ar-SA", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Riyadh",
  });
}

function formatTimeArabic(date: Date): string {
  return new Date(date).toLocaleTimeString("ar-SA", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Riyadh",
  });
}
