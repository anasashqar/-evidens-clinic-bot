/**
 * Z-API WhatsApp Integration Service
 * Handles sending messages and webhook processing
 */

const Z_API_INSTANCE = process.env.Z_API_INSTANCE || '';
const Z_API_TOKEN = process.env.Z_API_TOKEN || '';
const Z_API_CLIENT_TOKEN = process.env.Z_API_CLIENT_TOKEN || ''; 
const Z_API_BASE_URL = process.env.Z_API_BASE_URL || 'https://api.z-api.io'

export interface ZApiMessage {
  phone: string;
  message: string;
}

export interface ZApiWebhookPayload {
  instanceId?: string;
  messageId?: string;
  phone?: string;
  fromMe?: boolean;
  momment?: number;
  status?: string;
  chatName?: string;
  senderPhoto?: string;
  senderName?: string;
  participantPhone?: string;
  photo?: string;
  broadcast?: boolean;
  type?: string;
  text?: {
    message?: string;
  };
  image?: {
    caption?: string;
    imageUrl?: string;
    thumbnailUrl?: string;
    mimeType?: string;
  };
  audio?: {
    audioUrl?: string;
    mimeType?: string;
  };
  video?: {
    caption?: string;
    videoUrl?: string;
    mimeType?: string;
  };
  contact?: {
    displayName?: string;
    vcard?: string;
  };
  location?: {
    latitude?: number;
    longitude?: number;
    address?: string;
    url?: string;
  };
  document?: {
    documentUrl?: string;
    mimeType?: string;
    title?: string;
    pageCount?: number;
  };
}

/**
 * Send a text message via Z-API
 */
export async function sendMessage(phone: string, message: string): Promise<boolean> {
  if (!Z_API_INSTANCE || !Z_API_TOKEN) {
    console.error('[Z-API] Missing credentials');
    return false;
  }

  try {
    const url = `${Z_API_BASE_URL}/instances/${Z_API_INSTANCE}/token/${Z_API_TOKEN}/send-text`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Client-Token': Z_API_CLIENT_TOKEN // <-- تمت إضافته هنا ليسمح لنا بالمرور
      },
      body: JSON.stringify({
        phone: phone,
        message: message,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Z-API] Failed to send message:', response.status, errorText);
      return false;
    }

    const result = await response.json();
    console.log('[Z-API] Message sent successfully:', result);
    return true;
  } catch (error) {
    console.error('[Z-API] Error sending message:', error);
    return false;
  }
}

/**
 * Extract message content from webhook payload
 */
export function extractMessageFromWebhook(payload: ZApiWebhookPayload): {
  phone: string;
  message: string;
  messageType: string;
} | null {
  // Ignore messages sent by us
  if (payload.fromMe) {
    return null;
  }

  const phone = payload.phone || payload.participantPhone || '';
  if (!phone) {
    return null;
  }

  // Extract text message
  if (payload.type === 'text' && payload.text?.message) {
    return {
      phone,
      message: payload.text.message,
      messageType: 'text',
    };
  }

  // Extract image caption
  if (payload.type === 'image' && payload.image?.caption) {
    return {
      phone,
      message: payload.image.caption,
      messageType: 'image',
    };
  }

  // Extract video caption
  if (payload.type === 'video' && payload.video?.caption) {
    return {
      phone,
      message: payload.video.caption,
      messageType: 'video',
    };
  }

  // For other types, return a placeholder
  if (payload.type) {
    return {
      phone,
      message: `[${payload.type}]`,
      messageType: payload.type,
    };
  }

  return null;
}

/**
 * Send handoff notification to Eliana
 */
export async function notifyEliana(params: {
  patientName: string;
  patientPhone: string;
  summary: string;
  doctor?: string;
  preferredPeriod?: string;
  appointmentType?: string;
}): Promise<boolean> {
  const elianaPhone = process.env.ELIANA_PHONE_NUMBER;
  
  if (!elianaPhone) {
    console.error('[Z-API] Eliana phone number not configured');
    return false;
  }

  const message = `
🔔 *Novo Atendimento - EviDenS Clinic*

👤 *Paciente:* ${params.patientName}
📱 *Telefone:* ${params.patientPhone}

📋 *Resumo da Conversa:*
${params.summary}

${params.doctor ? `👨‍⚕️ *Médico Escolhido:* ${params.doctor}\n` : ''}${params.preferredPeriod ? `🕐 *Preferência de Horário:* ${params.preferredPeriod}\n` : ''}${params.appointmentType ? `📝 *Tipo:* ${params.appointmentType}\n` : ''}
---
Por favor, entre em contato com o paciente para finalizar o agendamento.
  `.trim();

  return await sendMessage(elianaPhone, message);
}
