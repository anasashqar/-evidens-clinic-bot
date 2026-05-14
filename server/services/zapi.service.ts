/**
 * ═══════════════════════════════════════════════════════════════════
 *  Z-API SERVICE — Multi-tenant
 *
 *  الفرق عن zapi.ts القديم:
 *  - لا يوجد env vars ثابتة للـ instance/token
 *  - كل دالة تستقبل WorkspaceZapiConfig كـ parameter
 *  - extractMessageFromWebhook تُرجع instanceId الآن
 *    (هو مفتاح التوجيه للـ workspace المناسب)
 * ═══════════════════════════════════════════════════════════════════
 */

import type { WorkspaceZapiConfig } from "../../drizzle/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ZApiWebhookPayload {
  instanceId?: string;        // ← المفتاح لتحديد الـ workspace
  messageId?: string;
  phone?: string;
  fromMe?: boolean;
  momment?: number;
  status?: string;
  chatName?: string;
  senderName?: string;
  participantPhone?: string;
  type?: string;
  isGroup?: boolean;           // جديد: للتصفية الصارمة للمجموعات
  text?: { message?: string };
  image?: { caption?: string; imageUrl?: string; mimeType?: string };
  audio?: { audioUrl?: string; mimeType?: string };
  video?: { caption?: string; videoUrl?: string; mimeType?: string };
  document?: { documentUrl?: string; mimeType?: string; title?: string };
  location?: { latitude?: number; longitude?: number; address?: string };
}

export interface ExtractedWebhookMessage {
  instanceId: string;  // ← جديد: للـ workspace routing
  phone: string;
  message: string;
  messageType: string;
  audioUrl?: string;   // ← يُمرَّر عند الفويس لتحويله لنص لاحقاً
}

// ─── Core: Send Message ───────────────────────────────────────────────────────

/**
 * يرسل رسالة نصية باستخدام إعدادات Z-API الخاصة بـ workspace محدد
 */
export async function sendMessageWithConfig(
  phone: string,
  message: string,
  config: WorkspaceZapiConfig
): Promise<boolean> {
  const url = `${config.base_url}/instances/${config.instance_id}/token/${config.token}/send-text`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Client-Token": config.client_token,
      },
      body: JSON.stringify({ phone, message }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[Z-API][${config.instance_id}] Send failed: ${response.status}`,
        errorText
      );
      return false;
    }

    console.log(`[Z-API][${config.instance_id}] ✓ Sent to ${phone}`);
    return true;
  } catch (error) {
    console.error(`[Z-API][${config.instance_id}] Error sending:`, error);
    return false;
  }
}

// ─── Handoff Notification ─────────────────────────────────────────────────────

/**
 * يُرسل إشعار للمنسق البشري عند حدوث handoff
 * الرقم ومعلومات البزنس تأتي من workspace_bot_settings
 */
export async function notifyHandoffWithConfig(params: {
  coordinatorPhone: string;     // من workspace_bot_settings.handoff_phone
  businessName: string;         // من workspace_bot_settings.business_name
  patientName: string;
  patientPhone: string;
  summary: string;
  zapiConfig: WorkspaceZapiConfig;
}): Promise<boolean> {
  const message = `
🔔 *طلب جديد - ${params.businessName}*

👤 *العميل:* ${params.patientName}
📱 *الهاتف:* ${params.patientPhone}

📋 *ملخص المحادثة:*
${params.summary}

---
يرجى التواصل مع العميل في أقرب وقت.
  `.trim();

  return await sendMessageWithConfig(
    params.coordinatorPhone,
    message,
    params.zapiConfig
  );
}

// ─── Webhook Parser ───────────────────────────────────────────────────────────

/**
 * يستخرج بيانات الرسالة من webhook payload
 * يُرجع instanceId الآن ← هذا هو مفتاح الـ multi-tenancy
 */
export function extractMessageFromWebhook(
  payload: ZApiWebhookPayload
): ExtractedWebhookMessage | null {
  // 1. تجاهل الرسائل الصادرة منّا
  if (payload.fromMe) return null;

  // 2. التحقق من وجود instanceId (ضروري للتوجيه)
  const instanceId = payload.instanceId || "";
  if (!instanceId) return null;

  // 3. تجاهل أحداث الحالة (ليست رسائل حقيقية)
  const IGNORED_TYPES = ["DeliveryCallback", "ReadCallback", "PlayedCallback", "presence"];
  if (payload.type && IGNORED_TYPES.includes(payload.type)) return null;

  // 4. كشف المجموعات (بشكل صارم جداً)
  // في Z-API، أي رسالة تحتوي على participantPhone أو isGroup هي رسالة مجموعة
  if (payload.isGroup === true) return null;
  
  if (payload.participantPhone && payload.participantPhone !== payload.phone) {
    return null;
  }

  const phone = payload.phone || "";
  const participantPhone = payload.participantPhone || "";

  // التحقق من الصيغ المعروفة للمجموعات في WhatsApp
  const isGroupJid = (jid: string) => 
    jid.includes("@g.us") || 
    jid.includes("-group") || 
    jid.includes("@temp") || 
    jid.includes("@broadcast");

  if (isGroupJid(phone) || isGroupJid(participantPhone)) {
    return null;
  }

  // 5. استخراج المحتوى حسب النوع
  if (!phone) return null;

  if (payload.text?.message) {
    return { instanceId, phone, message: payload.text.message, messageType: "text" };
  }
  if (payload.type === "image" && payload.image?.caption) {
    return { instanceId, phone, message: payload.image.caption, messageType: "image" };
  }
  if (payload.type === "video" && payload.video?.caption) {
    return { instanceId, phone, message: payload.video.caption, messageType: "video" };
  }

  // رسائل الصوت (audio) والـ PTT (push-to-talk = فويسات واتساب)
  // نُمرِّر الـ audioUrl ليتم تحويله لنص في webhook handler
  if (
    (payload.type === "audio" || payload.type === "ptt") &&
    payload.audio?.audioUrl
  ) {
    return {
      instanceId,
      phone,
      message: "[audio]",        // placeholder — سيُستبدَل بالنص بعد التحويل
      messageType: "audio",
      audioUrl: payload.audio.audioUrl,
    };
  }

  // أنواع أخرى (مستند، موقع، إلخ) — نُخبر البوت بالنوع
  if (payload.type && payload.type !== "text") {
    return { instanceId, phone, message: `[${payload.type}]`, messageType: payload.type };
  }

  return null;
}
