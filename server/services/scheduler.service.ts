/**
 * ═══════════════════════════════════════════════════════════════════
 *  SCHEDULER SERVICE — Automated Reminders & Re-Engagement
 *
 *  يشغّل ثلاثة jobs دورية:
 *
 *  1. checkAppointmentReminders()  — كل دقيقة
 *     → يُرسل تذكيراً لكل موعد قادم خلال 12 ساعة (مرة واحدة)
 *     → يُرسل تذكيراً لكل موعد قادم خلال 2 ساعة (مرة واحدة)
 *
 *  2. checkReEngagement()  — كل 30 دقيقة
 *     → يجد المحادثات التي صمت فيها المستخدم أكثر من 3 ساعات
 *     → يُرسل رسالة لطيفة لاستئناف التواصل
 *     → يسجّل الإرسال حتى لا يتكرر
 * ═══════════════════════════════════════════════════════════════════
 */

import { db } from "../db/index";
import { eq, and, lt, gte, lte, isNull, or } from "drizzle-orm";
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

// ─── Config ───────────────────────────────────────────────────────────────────

const REMINDER_CHECK_INTERVAL_MS  = 60_000;        // كل دقيقة
const RE_ENGAGEMENT_CHECK_INTERVAL_MS = 30 * 60_000; // كل 30 دقيقة
const RE_ENGAGEMENT_SILENCE_HOURS = 3;             // ساعات الصمت قبل الإرسال
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

    // ── تذكير 12 ساعة ────────────────────────────────────────────────────────
    const window12hStart = new Date(now.getTime() + 11.5 * 60 * 60 * 1000);
    const window12hEnd   = new Date(now.getTime() + 12.5 * 60 * 60 * 1000);

    const due12h = await db
      .select({ appt: appointments, patient: patients })
      .from(appointments)
      .innerJoin(patients, eq(appointments.patient_id, patients.id))
      .where(
        and(
          eq(appointments.status, "scheduled"),
          eq(appointments.reminder_12h_sent, false),
          gte(appointments.appointment_date, window12hStart),
          lte(appointments.appointment_date, window12hEnd)
        )
      );

    for (const { appt, patient } of due12h) {
      await sendAppointmentReminder(appt, patient, "12h");
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
  type: "12h" | "2h"
): Promise<void> {
  try {
    // جلب إعدادات Z-API و Bot للـ workspace
    const config = await getWorkspaceZapiAndBot(appt.workspace_id);
    if (!config) {
      console.warn(`[Scheduler] No Z-API config for workspace ${appt.workspace_id}`);
      return;
    }

    const { zapiConfig, botSettings } = config;
    const name = patient.name ?? "عزيزنا";
    const dateStr = formatDateArabic(appt.appointment_date);
    const timeStr = formatTimeArabic(appt.appointment_date);
    const doctorPart = appt.doctor ? ` مع ${appt.doctor}` : "";
    const businessName = botSettings.business_name;

    let message: string;
    if (type === "12h") {
      message = [
        `🗓️ *تذكير بموعدك — ${businessName}*`,
        ``,
        `أهلاً ${name}، نذكّرك بموعدك المحجوز غداً:`,
        `📅 ${dateStr} الساعة ${timeStr}${doctorPart}`,
        appt.appointment_type ? `🔧 الخدمة: ${appt.appointment_type}` : "",
        ``,
        `إذا كنت تريد تأجيل الموعد أو إلغاءه، تواصل معنا في أقرب وقت.`,
        `نتطلع لرؤيتك! 🙏`,
      ].filter(Boolean).join("\n");
    } else {
      message = [
        `⏰ *تذكير أخير — ${businessName}*`,
        ``,
        `أهلاً ${name}، موعدك بعد ساعتين تقريباً:`,
        `🕐 الساعة ${timeStr}${doctorPart}`,
        ``,
        `نتطلع لاستقبالك! 😊`,
      ].filter(Boolean).join("\n");
    }

    const sent = await sendMessageWithConfig(patient.phone, message, zapiConfig);

    if (sent) {
      // حدّث علامة الإرسال في DB
      await db
        .update(appointments)
        .set({
          [type === "12h" ? "reminder_12h_sent" : "reminder_2h_sent"]: true,
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
    const silenceCutoff = new Date(
      Date.now() - RE_ENGAGEMENT_SILENCE_HOURS * 60 * 60 * 1000
    );

    // جلب المحادثات النشطة التي آخر رسالة وردت فيها قبل الـ cutoff
    // ولم تصلها رسالة re-engagement قبل ذلك
    const activeConvs = await db
      .select({
        conv: conversations,
        patient: patients,
        lastMsg: messages,
      })
      .from(conversations)
      .innerJoin(patients, eq(conversations.patient_id, patients.id))
      .innerJoin(messages, eq(messages.conversation_id, conversations.id))
      .where(
        and(
          eq(conversations.status, "active"),
          lt(messages.created_at, silenceCutoff),
          eq(messages.direction, "inbound")
        )
      );

    // نجمّع حسب conversation_id ونأخذ آخر رسالة واردة لكل محادثة
    const convMap = new Map<string, typeof activeConvs[0]>();
    for (const row of activeConvs) {
      const existing = convMap.get(row.conv.id);
      if (!existing || row.lastMsg.created_at > existing.lastMsg.created_at) {
        convMap.set(row.conv.id, row);
      }
    }

    for (const { conv, patient } of Array.from(convMap.values())) {
      // تحقق: هل أُرسلت رسالة re-engagement لهذه المحادثة من قبل؟
      const alreadySent = await db
        .select()
        .from(reEngagementLog)
        .where(eq(reEngagementLog.conversation_id, conv.id))
        .limit(RE_ENGAGEMENT_MAX_PER_CONV);

      if (alreadySent.length >= RE_ENGAGEMENT_MAX_PER_CONV) continue;

      // جلب إعدادات Z-API
      const config = await getWorkspaceZapiAndBot(conv.workspace_id);
      if (!config) continue;

      const { zapiConfig, botSettings } = config;
      const name = patient.name ?? "";
      const businessName = botSettings.business_name;

      const message = buildReEngagementMessage(name, businessName);

      const sent = await sendMessageWithConfig(patient.phone, message, zapiConfig);

      if (sent) {
        // سجّل الإرسال
        await db.insert(reEngagementLog).values({
          workspace_id: conv.workspace_id,
          patient_id: conv.patient_id,
          conversation_id: conv.id,
          message_text: message,
        });

        console.log(`[Scheduler] 💬 Re-engagement sent → ${patient.phone}`);
      }
    }
  } catch (err) {
    console.error("[Scheduler] checkReEngagement error:", err);
  }
}

function buildReEngagementMessage(name: string, businessName: string): string {
  const greeting = name ? `أهلاً ${name}،` : "أهلاً،";
  return [
    `👋 ${greeting}`,
    ``,
    `لاحظنا أنك تواصلت معنا في ${businessName} ولم نتمكن من إكمال محادثتنا.`,
    ``,
    `هل لا تزال مهتماً بحجز موعد؟ نحن هنا لمساعدتك! 😊`,
    ``,
    `يمكنك الرد بـ:`,
    `• *نعم* — للمتابعة وحجز موعد`,
    `• *لا شكراً* — إذا تغيّرت خططك`,
    ``,
    `نتطلع للتواصل معك 🙏`,
  ].join("\n");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getWorkspaceZapiAndBot(workspaceId: string) {
  try {
    const rows = await db
      .select({
        zapiConfig: workspaceZapiConfig,
        botSettings: workspaceBotSettings,
      })
      .from(workspaceZapiConfig)
      .innerJoin(
        workspaceBotSettings,
        eq(workspaceBotSettings.workspace_id, workspaceZapiConfig.workspace_id)
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
