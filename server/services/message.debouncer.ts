/**
 * ═══════════════════════════════════════════════════════════════════
 *  MESSAGE DEBOUNCER — Smart Message Batching
 *
 *  يحل مشكلة المستخدمين الذين يقسّمون رسالتهم لأجزاء متعددة:
 *
 *    المستخدم يكتب بسرعة:
 *      "أريد موعد"          ← رسالة 1
 *      "لتنظيف الأسنان"     ← رسالة 2
 *      "يوم الأربعاء"       ← رسالة 3
 *
 *    بدون debouncer: 3 استدعاءات LLM منفصلة، ردود ناقصة غير طبيعية
 *    مع debouncer:   استدعاء واحد بعد 2.5 ث بنص مدمج:
 *                    "أريد موعد\nلتنظيف الأسنان\nيوم الأربعاء"
 *
 *  آلية العمل:
 *    1. كل رسالة واردة → أضفها للـ batch + أعد تشغيل الـ timer
 *    2. إذا مرّت DEBOUNCE_MS بدون رسالة جديدة → اعالج الـ batch
 *    3. key = instanceId::phone  ← عزل كامل بين المستخدمين والـ workspaces
 *
 *  الـ quotedMessageId:
 *    نحتفظ بـ messageId آخر رسالة في الـ batch → نستخدمه للـ quoted reply
 *    (الرد "على" آخر رسالة من المستخدم = أكثر طبيعية في واتساب)
 * ═══════════════════════════════════════════════════════════════════
 */

/** فترة الانتظار بالمللي ثانية بعد آخر رسالة قبل المعالجة */
const DEBOUNCE_MS = 2_500;

/**
 * نوع الـ processor — الدالة التي تُستدعى عند انتهاء الـ debounce window
 * @param combinedMessage  - الرسائل مدموجة بـ \n
 * @param quotedMessageId  - messageId آخر رسالة (للـ quoted reply) أو undefined
 * @param batchSize        - عدد الرسائل الفعلي في الـ batch (للـ message_count الصحيح)
 */
export type MessageProcessor = (
  combinedMessage: string,
  quotedMessageId: string | undefined,
  batchSize: number
) => Promise<void>;

interface PendingBatch {
  /** جميع الرسائل المتراكمة في هذا الـ window */
  messages: string[];
  /** messageId آخر رسالة — يُستخدم للـ quoted reply */
  lastMessageId: string | undefined;
  /** الـ timer الحالي — يُلغى عند كل رسالة جديدة */
  timer: ReturnType<typeof setTimeout>;
}

/**
 * مفتاح الـ debounce: instanceId + phone
 * يضمن عزل كامل بين كل مستخدم وبين كل workspace
 */
function batchKey(instanceId: string, phone: string): string {
  return `${instanceId}::${phone}`;
}

/** الخريطة الرئيسية: batchKey → pending batch */
const pending = new Map<string, PendingBatch>();

/**
 * يستقبل رسالة واحدة، يجمعها مع ما سبق (إن وُجد)،
 * وينتظر DEBOUNCE_MS بعد آخر رسالة قبل استدعاء الـ processor.
 *
 * الدالة لا تُعيد Promise — الـ webhook يستجيب فوراً بـ "Queued"
 * والمعالجة تتم بشكل async في الخلفية.
 *
 * @param instanceId  - معرف الـ Z-API instance (مفتاح الـ workspace)
 * @param phone       - رقم هاتف المستخدم
 * @param message     - نص الرسالة (بعد أي تحويل مثل transcription)
 * @param messageId   - messageId من واتساب (للـ quoted reply)
 * @param processor   - الدالة المسؤولة عن معالجة الرسالة النهائية
 */
export function debounceMessage(
  instanceId: string,
  phone: string,
  message: string,
  messageId: string | undefined,
  processor: MessageProcessor
): void {
  const key = batchKey(instanceId, phone);
  const existing = pending.get(key);

  if (existing) {
    // ─── batch موجود: ألغِ الـ timer القديم وأضف الرسالة ─────────────────
    clearTimeout(existing.timer);
    existing.messages.push(message);
    // نحتفظ دائماً بـ messageId آخر رسالة
    if (messageId) existing.lastMessageId = messageId;

    console.log(
      `[Debouncer] +1 message queued for ${phone} (batch size: ${existing.messages.length})`
    );

    // أعد تشغيل الـ timer
    existing.timer = createTimer(key, existing, processor, phone);
  } else {
    // ─── batch جديد: ابدأ من الصفر ───────────────────────────────────────
    const batch: PendingBatch = {
      messages: [message],
      lastMessageId: messageId,
      timer: undefined as unknown as ReturnType<typeof setTimeout>,
    };

    batch.timer = createTimer(key, batch, processor, phone);
    pending.set(key, batch);

    console.log(`[Debouncer] New batch started for ${phone}`);
  }
}

/** ينشئ timer يُطلق المعالجة بعد DEBOUNCE_MS */
function createTimer(
  key: string,
  batch: PendingBatch,
  processor: MessageProcessor,
  phone: string
): ReturnType<typeof setTimeout> {
  return setTimeout(() => {
    pending.delete(key);

    const combined = batch.messages.join("\n");
    const quotedId = batch.lastMessageId;

    console.log(
      `[Debouncer] 🚀 Firing batch for ${phone}: ${batch.messages.length} msg(s) → "${combined.slice(0, 100)}${combined.length > 100 ? "…" : ""}"`
    );

    processor(combined, quotedId, batch.messages.length).catch((err) =>
      console.error(`[Debouncer] Processor error for ${phone}:`, err)
    );
  }, DEBOUNCE_MS);
}

/** عدد الـ batches النشطة حالياً — مفيد للـ monitoring */
export function activeBatchCount(): number {
  return pending.size;
}
