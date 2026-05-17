/**
 * ═══════════════════════════════════════════════════════════════════
 *  ROUTERS — Multi-tenant tRPC Router
 *
 *  الفروق عن routers.ts القديم:
 *
 *  webhook.zapi:
 *    - القديم: handleIncomingMessage(phone, message)
 *    - الجديد: handleIncomingMessage(instanceId, phone, message)
 *    ← instanceId يحدد الـ workspace تلقائياً
 *
 *  admin.*:
 *    - القديم: queries غير مقيدة بـ workspace واحد
 *    - الجديد: كل query تستقبل workspaceId
 *
 *  admin.workspaces*  ← جديد: إدارة العملاء من لوحة المدير
 *  admin.saveZapiConfig ← جديد: ربط Z-API لكل عميل
 *  admin.saveBotSettings ← جديد: تعديل شخصية البوت لكل عميل
 * ═══════════════════════════════════════════════════════════════════
 */

import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "../_core/cookies";
import { systemRouter } from "../_core/systemRouter";
import { adminProcedure, publicProcedure, router } from "../_core/trpc";
import { ENV } from "../_core/env";
import { handleIncomingMessage } from "../services/bot.engine";
import { debounceMessage } from "../services/message.debouncer";
import { z } from "zod";
import {
  getAllWorkspaces,
  createWorkspace,
  updateWorkspace,
  upsertZapiConfig,
  upsertBotSettings,
  getWorkspaceDashboardMetrics,
  getWorkspaceConversations,
  getConversationMessages,
  getWorkspaceHandoffs,
  updateHandoffStatus,
  getOrCreateWorkspacePatient,         
  getActiveWorkspaceConversation,        
  getLatestWorkspaceConversation,
  // — Appointments —
  createAppointment,
  getWorkspaceAppointments,
  getUpcomingWorkspaceAppointments,
  updateAppointment,
  updateAppointmentStatus,
  deleteAppointment,
  getAppointmentStats,
} from "../db/workspace.queries";
import {
  extractMessageFromWebhook,
  type ZApiWebhookPayload,
} from "../services/zapi.service";
import { transcribeAudio } from "../_core/llm";

export const appRouter = router({
  system: systemRouter,

  // ─── Auth ───────────────────────────────────────────────────────────────────
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Smart Webhook ────────────────────────────────────────────────────────────
  //
  //  نقطة استقبال واحدة لجميع الـ workspaces
  //  التوجيه يتم داخلياً بناءً على instanceId الموجود في كل webhook payload
  //
  //  الـ Debouncing:
  //    الـ webhook يستجيب فوراً بـ "Queued"، والمعالجة تتم في الخلفية بعد 2.5 ثانية
  //    إذا أرسل المستخدم رسائل متعددة بسرعة، تُدمج جميعها وتُعالج مرة واحدة
  //
  webhook: router({
    zapi: publicProcedure
      .input(z.any())
      .mutation(async ({ input, ctx }) => {
        try {
          // Fix #1: تحقق من سر الـ webhook عبر query param
          // أضف ?secret=YOUR_SECRET لـ URL في إعدادات Z-API
          const webhookSecret = ENV.webhookSecret;
          if (webhookSecret) {
            const providedSecret = (ctx.req as any).query?.secret as string | undefined;
            if (providedSecret !== webhookSecret) {
              console.warn(`[Webhook] ⛔ Rejected request — invalid or missing secret`);
              return { success: false, error: "Unauthorized" };
            }
          }

          const payload = input as ZApiWebhookPayload;

          const extracted = extractMessageFromWebhook(payload);
          if (!extracted) {
            return { success: true, message: "Ignored" };
          }

          console.log(
            `[Webhook] instanceId=${extracted.instanceId} phone=${extracted.phone} type=${extracted.messageType}`
          );

          // Fix #7: جميع المعالجة (تحويل + debounce) تتم في الخلفية
          // الـ webhook يستجيب فوراً — Z-API لا ينتظر ولا يُعيد المحاولة
          void (async () => {
            try {
              let finalMessage = extracted.message;

              // تحويل الفويس لنص (قبل الـ debouncing حتى يندمج مع الرسائل النصية)
              if (extracted.messageType === "audio" && extracted.audioUrl) {
                console.log(`[Webhook] 🎤 Transcribing audio for ${extracted.phone}...`);
                const transcribed = await transcribeAudio(extracted.audioUrl);

                if (!transcribed) {
                  console.warn(`[Webhook] Empty transcription for ${extracted.phone} — skipping`);
                  return;
                }

                finalMessage = transcribed;
                console.log(`[Webhook] ✓ Transcribed: "${transcribed.slice(0, 80)}${transcribed.length > 80 ? "..." : ""}"`);
              }

              // Fix #5: نمرّر batchSize للـ engine لعد الرسائل بشكل صحيح
              debounceMessage(
                extracted.instanceId,
                extracted.phone,
                finalMessage,
                extracted.messageId,           // ← للـ quoted reply على آخر رسالة
                async (combinedMessage, quotedMessageId, batchSize) => {
                  await handleIncomingMessage(
                    extracted.instanceId,
                    extracted.phone,
                    combinedMessage,            // ← الرسائل مدموجة بـ \n
                    false,
                    undefined,
                    quotedMessageId,            // ← للـ quoted reply
                    batchSize                   // ← Fix #5: العدد الحقيقي
                  );
                }
              );
            } catch (bgErr) {
              console.error("[Webhook] Background processing error:", bgErr);
            }
          })();

          // الـ webhook يستجيب فوراً بدون انتظار — Z-API لا يُعيد المحاولة
          return { success: true, message: "Queued" };
        } catch (error) {
          console.error("[Webhook] Error:", error);
          return { success: false, error: String(error) };
        }
      }),
  }),

  // ─── Super Admin Routes ─────────────────────────────────────────────────────
  admin: router({

    // ── Workspace Management ──────────────────────────────────────────────────

    /** جلب كل العملاء مع إعداداتهم */
    workspaces: adminProcedure.query(async () => {
      return await getAllWorkspaces();
    }),

    /** إنشاء عميل جديد */
    createWorkspace: adminProcedure
      .input(
        z.object({
          name: z.string().min(2, "اسم قصير جداً"),
          slug: z
            .string()
            .min(2)
            .regex(/^[a-z0-9-]+$/, "استخدم حروف إنجليزية صغيرة وأرقام وشرطة فقط"),
          business_type: z.enum([
            "clinic",
            "store",
            "restaurant",
            "real_estate",
            "other",
          ]),
          owner_email: z.string().email().optional(),
        })
      )
      .mutation(async ({ input }) => {
        return await createWorkspace(input);
      }),

    /** تعديل حالة العميل (تفعيل/تعطيل) */
    updateWorkspace: adminProcedure
      .input(
        z.object({
          workspaceId: z.string().uuid(),
          name: z.string().min(2).optional(),
          is_active: z.boolean().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { workspaceId, ...data } = input;
        return await updateWorkspace(workspaceId, data);
      }),

    // ── Z-API Config ──────────────────────────────────────────────────────────

    /** ربط رقم واتساب (Z-API instance) بعميل */
    saveZapiConfig: adminProcedure
      .input(
        z.object({
          workspaceId: z.string().uuid(),
          instance_id: z.string().min(1, "Instance ID مطلوب"),
          token: z.string().min(1, "Token مطلوب"),
          client_token: z.string().min(1, "Client Token مطلوب"),
          base_url: z.string().url().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { workspaceId, ...config } = input;
        return await upsertZapiConfig(workspaceId, config);
      }),

    // ── Bot Settings ──────────────────────────────────────────────────────────

    /** تعديل شخصية البوت والـ system prompt لعميل محدد */
    saveBotSettings: adminProcedure
      .input(
        z.object({
          workspaceId: z.string().uuid(),
          business_name: z.string().min(1, "اسم البزنس مطلوب"),
          system_prompt: z.string().min(20, "الـ prompt قصير جداً"),
          handoff_phone: z.string().optional(),
          handoff_name: z.string().optional(),
          max_messages_before_handoff: z.number().min(3).max(50).optional(),
          is_bot_active: z.boolean().optional(),
          /** قالب رسالة المنسق — null يعني استخدام القالب الافتراضي */
          handoff_message_template: z.string().nullable().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { workspaceId, ...settings } = input;
        return await upsertBotSettings(workspaceId, settings);
      }),

    // ── Per-workspace Dashboard ───────────────────────────────────────────────

    /** إحصائيات dashboard لعميل محدد */
    workspaceMetrics: adminProcedure
      .input(z.object({ workspaceId: z.string().uuid() }))
      .query(async ({ input }) => {
        return await getWorkspaceDashboardMetrics(input.workspaceId);
      }),

    /** المحادثات الخاصة بعميل محدد */
    workspaceConversations: adminProcedure
      .input(z.object({ workspaceId: z.string().uuid() }))
      .query(async ({ input }) => {
        return await getWorkspaceConversations(input.workspaceId);
      }),

    /** رسائل محادثة بعينها */
    conversationMessages: adminProcedure
      .input(z.object({ conversationId: z.string().uuid() }))
      .query(async ({ input }) => {
        return await getConversationMessages(input.conversationId);
      }),

    /** قائمة الـ handoffs لعميل محدد */
    workspaceHandoffs: adminProcedure
      .input(z.object({ workspaceId: z.string().uuid() }))
      .query(async ({ input }) => {
        return await getWorkspaceHandoffs(input.workspaceId);
      }),

    /** تحديث حالة handoff */
    updateHandoff: adminProcedure
      .input(
        z.object({
          handoffId: z.string().uuid(),
          status: z.enum(["pending", "in_progress", "completed"]),
        })
      )
      .mutation(async ({ input }) => {
        return await updateHandoffStatus(input.handoffId, input.status);
      }),

    // ── Simulator (workspace-aware) ───────────────────────────────────────────

    /** محاكي المحادثة — يعمل مع workspace محدد */
    simulateMessage: adminProcedure
      .input(
        z.object({
          workspaceId: z.string().uuid(),
          phone: z.string().min(5),
          message: z.string().min(1),
        })
      )
      .mutation(async ({ input }) => {
        try {
          // الـ simulator يستخدم الـ debouncer مثل الـ webhook الحقيقي تماماً
          // هذا يُتيح اختبار سيناريو الرسائل المقطّعة في المحاكي
          // ويمنع تعليق الـ UI طول فترة معالجة الـ LLM (5-8 ثانية)
          debounceMessage(
            `sim::${input.workspaceId}`,  // key منفصل عن الـ webhook الحقيقي
            input.phone,
            input.message,
            undefined,                    // لا messageId في الـ simulator
            async (combinedMessage, _, batchSize) => {
              await handleIncomingMessage(
                "",
                input.phone,
                combinedMessage,
                true,
                input.workspaceId,
                undefined,
                batchSize
              );
            }
          );

          // يُرجع فوراً — الـ UI لا ينتظر الـ LLM
          return { success: true };
        } catch (error) {
          console.error("[Simulator] Error:", error);
          return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      }),

    /** رسائل المحاكي لعرضها في الواجهة */
    getSimulatorMessages: adminProcedure
      .input(
        z.object({
          workspaceId: z.string().uuid(),
          phone: z.string(),
        })
      )
      .query(async ({ input }) => {
        try {
          const patient = await getOrCreateWorkspacePatient(
            input.workspaceId,
            input.phone
          );
          if (!patient) return [];

          const conversation =
            (await getActiveWorkspaceConversation(input.workspaceId, patient.id)) ??
            (await getLatestWorkspaceConversation(input.workspaceId, patient.id));

          if (!conversation) return [];

          const messages = await getConversationMessages(conversation.id);
          return messages.map((m: any) => ({
            id: m.id,
            direction: m.direction,
            content: m.content,
            timestamp: m.created_at,
          }));
        } catch (error) {
          console.error("[Simulator] Error getting messages:", error);
          return [];
        }
      }),

  }),

  // ─── Appointments ─────────────────────────────────────────────────────────────────────
  appointments: router({

    /** جميع مواعيد workspace */
    list: adminProcedure
      .input(z.object({ workspaceId: z.string().uuid() }))
      .query(async ({ input }) => {
        return await getWorkspaceAppointments(input.workspaceId);
      }),

    /** المواعيد القادمة فقط */
    upcoming: adminProcedure
      .input(z.object({ workspaceId: z.string().uuid() }))
      .query(async ({ input }) => {
        return await getUpcomingWorkspaceAppointments(input.workspaceId);
      }),

    /** إحصائيات المواعيد */
    stats: adminProcedure
      .input(z.object({ workspaceId: z.string().uuid() }))
      .query(async ({ input }) => {
        return await getAppointmentStats(input.workspaceId);
      }),

    /** إضافة موعد جديد */
    create: adminProcedure
      .input(
        z.object({
          workspaceId:      z.string().uuid(),
          patientPhone:     z.string().min(5),
          patientName:      z.string().optional(),
          appointmentDate:  z.string(),   // ISO string
          doctor:           z.string().optional(),
          appointmentType:  z.string().optional(),
          preferredPeriod:  z.string().optional(),
          notes:            z.string().optional(),
          conversationId:   z.string().uuid().optional(),
        })
      )
      .mutation(async ({ input }) => {
        // جلب أو إنشاء المريض
        const patient = await getOrCreateWorkspacePatient(input.workspaceId, input.patientPhone);
        if (!patient) throw new Error("تعذر إنشاء سجل المريض");

        return await createAppointment({
          workspace_id:     input.workspaceId,
          patient_id:       patient.id,
          conversation_id:  input.conversationId ?? null,
          appointment_date: new Date(input.appointmentDate),
          doctor:           input.doctor ?? null,
          appointment_type: input.appointmentType ?? null,
          preferred_period: input.preferredPeriod ?? null,
          notes:            input.notes ?? null,
          status:           "scheduled",
        });
      }),

    /** تحديث موعد */
    update: adminProcedure
      .input(
        z.object({
          appointmentId:   z.string().uuid(),
          appointmentDate: z.string().optional(),
          doctor:          z.string().optional(),
          appointmentType: z.string().optional(),
          preferredPeriod: z.string().optional(),
          notes:           z.string().optional(),
          status:          z.enum(["scheduled", "confirmed", "cancelled", "completed"]).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { appointmentId, appointmentDate, ...rest } = input;
        return await updateAppointment(appointmentId, {
          ...(appointmentDate ? { appointment_date: new Date(appointmentDate) } : {}),
          ...(rest.doctor          !== undefined ? { doctor: rest.doctor }                   : {}),
          ...(rest.appointmentType !== undefined ? { appointment_type: rest.appointmentType } : {}),
          ...(rest.preferredPeriod !== undefined ? { preferred_period: rest.preferredPeriod } : {}),
          ...(rest.notes           !== undefined ? { notes: rest.notes }                     : {}),
          ...(rest.status          !== undefined ? { status: rest.status }                   : {}),
        });
      }),

    /** تغيير حالة الموعد فقط */
    updateStatus: adminProcedure
      .input(
        z.object({
          appointmentId: z.string().uuid(),
          status: z.enum(["scheduled", "confirmed", "cancelled", "completed"]),
        })
      )
      .mutation(async ({ input }) => {
        return await updateAppointmentStatus(input.appointmentId, input.status);
      }),

    /** حذف موعد */
    delete: adminProcedure
      .input(z.object({ appointmentId: z.string().uuid() }))
      .mutation(async ({ input }) => {
        await deleteAppointment(input.appointmentId);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
