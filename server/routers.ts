import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { handleIncomingMessage } from "./bot";
import {
  createAppointmentManual,
  getAllAppointments,
  getAllConversations,
  getAllHandoffs,
  getConversationMessages,
  getDashboardMetrics,
  updateHandoffStatus,
} from "./queries";
import { extractMessageFromWebhook, type ZApiWebhookPayload } from "./zapi";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // Webhook endpoint for Z-API
  webhook: router({
    zapi: publicProcedure
      .input(z.any())
      .mutation(async ({ input }) => {
        try {
          const payload = input as ZApiWebhookPayload;
          console.log('[Webhook] Received Z-API webhook:', JSON.stringify(payload, null, 2));

          // Extract message from webhook
          const extracted = extractMessageFromWebhook(payload);
          if (!extracted) {
            console.log('[Webhook] No valid message extracted, ignoring');
            return { success: true, message: 'Ignored' };
          }

          // Process message with bot
          await handleIncomingMessage(extracted.instanceId, extracted.phone, extracted.message);


          return { success: true, message: 'Processed' };
        } catch (error) {
          console.error('[Webhook] Error processing webhook:', error);
          return { success: false, error: String(error) };
        }
      }),
  }),

  // Admin panel endpoints
  admin: router({
    // Dashboard metrics
    metrics: publicProcedure.query(async () => {
      return await getDashboardMetrics();
    }),

    // Conversations
    conversations: publicProcedure.query(async () => {
      return await getAllConversations();
    }),

    conversationMessages: publicProcedure
      .input(z.object({ conversationId: z.string() }))
      .query(async ({ input }) => {
        return await getConversationMessages(input.conversationId);
      }),

    // Appointments
    appointments: publicProcedure.query(async () => {
      return await getAllAppointments();
    }),

    createAppointment: publicProcedure
      .input(
        z.object({
          patient_id: z.string(),
          doctor: z.enum(['dr_gabriel', 'dr_romulo']),
          appointment_date: z.string(),
          appointment_type: z.enum(['first_consultation', 'procedure']),
          preferred_period: z.string().optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        return await createAppointmentManual(input);
      }),

    // Handoffs
    handoffs: publicProcedure.query(async () => {
      return await getAllHandoffs();
    }),

    updateHandoff: publicProcedure
      .input(
        z.object({
          handoffId: z.string(),
          status: z.enum(['pending', 'in_progress', 'completed']),
        })
      )
      .mutation(async ({ input }) => {
        return await updateHandoffStatus(input.handoffId, input.status);
      }),

    // Simulator endpoint
    simulateMessage: publicProcedure
      .input(
        z.object({
          phone: z.string(),
          message: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        try {
          // Process message with bot (isSimulator = true)
          await handleIncomingMessage(input.phone, input.message, true);
          return { success: true };
        } catch (error) {
          console.error('[Simulator] Error:', error);
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      }),

    // Get simulator messages
    getSimulatorMessages: publicProcedure
      .input(z.object({ phone: z.string() }))
      .query(async ({ input }) => {
        try {
          const { getOrCreatePatient, getActiveConversation, getConversationMessages } = await import('./supabase');
          
          const patient = await getOrCreatePatient(input.phone);
          if (!patient) {
            return [];
          }

          const conversation = await getActiveConversation(patient.id);
          if (!conversation) {
            return [];
          }

          const messages = await getConversationMessages(conversation.id);
          return messages.map((m: any) => ({
            id: m.id,
            direction: m.direction,
            content: m.content,
            timestamp: m.created_at,
          }));
        } catch (error) {
          console.error('[Simulator] Error getting messages:', error);
          return [];
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
