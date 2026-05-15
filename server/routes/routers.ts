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
      .mutation(async ({ input }) => {
        try {
          const payload = input as ZApiWebhookPayload;

          const extracted = extractMessageFromWebhook(payload);
          if (!extracted) {
            return { success: true, message: "Ignored" };
          }

          console.log(
            `[Webhook] instanceId=${extracted.instanceId} phone=${extracted.phone} type=${extracted.messageType}`
          );

          // ─── تحويل الفويس لنص (قبل الـ debouncing) ──────────────────────
          //  التحويل يتم أولاً حتى ينجح دمج الفويسات مع الرسائل النصية في نفس الـ batch
          let finalMessage = extracted.message;

          if (extracted.messageType === "audio" && extracted.audioUrl) {
            try {
              console.log(`[Webhook] 🎤 Transcribing audio for ${extracted.phone}...`);
              const transcribed = await transcribeAudio(extracted.audioUrl);

              if (transcribed) {
                finalMessage = transcribed;
                console.log(`[Webhook] ✓ Transcribed: "${transcribed.slice(0, 80)}${transcribed.length > 80 ? "..." : ""}"`)
              } else {
                console.warn(`[Webhook] Empty transcription for ${extracted.phone} — skipping`);
                return { success: true, message: "Empty audio" };
              }
            } catch (transcribeError) {
              console.error(`[Webhook] Transcription failed:`, transcribeError);
              return { success: true, message: "Audio transcription failed" };
            }
          }

          // ─── Debounce: اجمع الرسائل وعالجها معاً بعد 2.5 ثانية ─────────────
          //  الـ webhook يستجيب فوراً، والمعالجة تتم في الخلفية بشكل async
          debounceMessage(
            extracted.instanceId,
            extracted.phone,
            finalMessage,
            extracted.messageId,           // ← للـ quoted reply على آخر رسالة
            async (combinedMessage, quotedMessageId) => {
              await handleIncomingMessage(
                extracted.instanceId,
                extracted.phone,
                combinedMessage,            // ← الرسائل مدموجة بـ \n
                false,
                undefined,
                quotedMessageId             // ← للـ quoted reply
              );
            }
          );

          // الـ webhook يستجيب فوراً بدون انتظار المعالجة — Z-API لا ينتظر
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
          await handleIncomingMessage(
            "",                    // instanceId فارغ — simulator يتخطى الـ lookup
            input.phone,
            input.message,
            true,                  // isSimulator = true
            input.workspaceId      // ← workspaceId مباشر
          );
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
});

export type AppRouter = typeof appRouter;
