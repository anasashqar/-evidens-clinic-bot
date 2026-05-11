/**
 * عيادة الأمل - بوت واتساب بالذكاء الاصطناعي
 * يستخدم Groq للمحادثات الطبيعية باللغة العربية
 */

import {
  createConversation,
  createHandoff,
  getActiveConversation,
  getConversationMessages,
  getOrCreatePatient,
  saveMessage,
  updateConversation,
  updatePatient,
  type Conversation,
  type Patient,
} from './supabase';
import { notifyEliana, sendMessage } from './zapi';
import { upsertGHLContact, addNoteToContact, getCalendarWidgetURL, getAvailableSlots } from './ghl';
import { invokeLLM } from './_core/llm';

export interface BotContext {
  patient: Patient;
  conversation: Conversation;
}

const SYSTEM_PROMPT = `أنتِ المساعدة الافتراضية لعيادة الأمل للجلدية، وهي عيادة متخصصة في علاج الجلد والشعر والأظافر.

## معلومات العيادة

**الأطباء:**
- د. محمد: متخصص في علاجات الجلد والإجراءات التجميلية
- د. سارة: متخصصة في علاجات الشعر وأمراض الفروة

**الأسعار:**
- الاستشارة (أول زيارة): 200 شيكل
- الإجراءات: تختلف حسب النوع (ستوضح مريم التفاصيل)

**أوقات العمل:**
- الأحد إلى الخميس: من 9 صباحاً حتى 8 مساءً
- السبت: حسب التوفر

## دورك

أنتِ مساعدة متعاونة ومهنية وودودة. هدفك هو:
1. الترحيب بالمرضى بشكل دافئ
2. فهم حاجة المريض (جلد، شعر، أظافر أو إجراء معين)
3. جمع الاسم الكامل
4. معرفة تفضيل الموعد
5. تحويل المريض إلى مريم (المنسقة البشرية) لإتمام الحجز

## قواعد مهمة

✅ دائماً:
- كوني طبيعية ومتعاطفة وإنسانية
- استخدمي لغة بسيطة ومريحة
- اطرحي سؤالاً واحداً في كل مرة
- أكّدي المعلومات المهمة
- كوني مختصرة وواضحة

لا تفعلي أبداً:
- استخدام تنسيق markdown (نجوم، خطوط، إلخ)
- عرض خيارات مرقمة (1، 2، 3)
- الردود الروبوتية أو الرسمية المفرطة
- طرح أسئلة متعددة في وقت واحد
- الوعد بما لا تستطيعي تحقيقه

## متى تحولين للمنسقة البشرية (مريم)

حوّلي فوراً عندما:
- يطلب المريض التحدث مع إنسان
- لا تعرفين الإجابة
- يُظهر المريض استياءً أو انزعاجاً
- جمعتِ: الاسم، الحاجة، وتفضيل الموعد
- يسأل المريض عن أسعار إجراءات محددة
- يريد المريض الحجز مباشرة

## التدفق المثالي

1. ترحيب: رحّبي بدفء واسألي إن كانت الزيارة الأولى
2. التعرف: إذا أول زيارة، اسألي عن الاسم. وإذا عائد، رحّبي به من جديد
3. الحاجة: اسألي عن الأمر الرئيسي (جلد، شعر، أظافر)
4. الطبيب: اقترحي الطبيب المناسب بناءً على الحاجة
5. الموعد: اسألي عن التفضيل الزمني
6. التحويل: أخبري المريض أنك ستُحضرين مريم لتأكيد الموعد

## أمثلة على ردود جيدة

"أهلاً وسهلاً بك في عيادة الأمل! 😊 هل هذه زيارتك الأولى معنا؟"
"رائع! ما هو اسمك الكامل؟"
"تشرفنا يا [الاسم]! أخبرني، هل تبحث عن علاج للجلد أم الشعر أم الأظافر؟"
"أفهم! للشعر، الدكتورة سارة هي الأنسب. هل تفضل موعداً صباحاً أم مساءً؟"
"ممتاز! سأستدعي مريم الآن لتأكيد موعدك. لحظة من فضلك!"

## سياق المحادثة

لديكِ وصول لتاريخ المحادثة كاملاً. استخدميه لـ:
- عدم تكرار الأسئلة
- الحفاظ على السياق
- التعامل بشكل أكثر طبيعية
- تخصيص الردود

ردّي دائماً كإنسانة حقيقية متعاونة ومهنية. تحدثي بالعربية فقط.`;

/**
 * المعالج الرئيسي للبوت - يعالج الرسائل الواردة بالذكاء الاصطناعي
 */
export async function handleIncomingMessage(phone: string, message: string, isSimulator: boolean = false): Promise<void> {
  try {
    // التحقق من الأرقام المسموح بها (وضع الاختبار)
    // أرقام المحاكي مسموح بها دائماً
    if (!isSimulator) {
      const allowedNumbers = process.env.ALLOWED_PHONE_NUMBERS;
      if (allowedNumbers) {
        const allowedList = allowedNumbers.split(',').map(n => n.trim());
        if (!allowedList.includes(phone)) {
          console.log(`[Bot] الرقم ${phone} غير موجود في القائمة المسموح بها، تجاهل الرسالة`);
          return;
        }
      }
    }

    // الحصول على المريض أو إنشاؤه
    const patient = await getOrCreatePatient(phone);
    if (!patient) {
      console.error('[Bot] فشل في الحصول على المريض أو إنشائه');
      return;
    }

    // الحصول على المحادثة النشطة أو إنشاؤها
    let conversation = await getActiveConversation(patient.id);
    if (!conversation) {
      conversation = await createConversation(patient.id);
      if (!conversation) {
        console.error('[Bot] فشل في إنشاء المحادثة');
        return;
      }
    }

    // حفظ الرسالة الواردة
    await saveMessage({
      conversation_id: conversation.id,
      direction: 'inbound',
      content: message,
      message_type: 'text',
      metadata: {},
    });

    // التحقق إذا كانت المحادثة في وضع التحويل
    if (conversation.status === 'handoff') {
      console.log('[Bot] المحادثة في وضع التحويل، تجاهل الرسالة');
      return;
    }

    // معالجة الرسالة بالذكاء الاصطناعي
    const context: BotContext = { patient, conversation };
    await processWithAI(context, message);
  } catch (error) {
    console.error('[Bot] خطأ في معالجة الرسالة الواردة:', error);
  }
}

/**
 * معالجة الرسالة باستخدام Groq AI
 */
async function processWithAI(context: BotContext, userMessage: string): Promise<void> {
  try {
    // الحصول على تاريخ المحادثة
    const messages = await getConversationMessages(context.conversation.id);

    // بناء تاريخ المحادثة للذكاء الاصطناعي
    const conversationHistory = messages.map((msg: any) => ({
      role: (msg.direction === 'inbound' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: msg.content,
    }));

    // إضافة رسالة المستخدم الحالية
    conversationHistory.push({
      role: 'user',
      content: userMessage,
    });

    // الحصول على المواعيد المتاحة إذا كانت المحادثة متقدمة
    let availableSlotsInfo = '';
    if (context.conversation.context.name && context.conversation.context.concern) {
      const slots = await getAvailableAppointmentSlots(7);
      availableSlotsInfo = `\n\nالمواعيد المتاحة (الأيام السبعة القادمة):\n${slots}\n\nاستخدم هذه المعلومات عندما يسأل المريض عن المواعيد.`;
    }

    // بناء معلومات السياق
    const contextInfo = `
معلومات المريض:
- الاسم: ${context.patient.name || 'غير محدد'}
- الهاتف: ${context.patient.phone}
- مريض عائد: ${context.patient.is_returning_patient ? 'نعم' : 'لا'}

سياق المحادثة:
${JSON.stringify(context.conversation.context, null, 2)}${availableSlotsInfo}
`;

    // استدعاء Groq AI
    const response = await invokeLLM({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'system', content: contextInfo },
        ...conversationHistory,
      ],
    });

    const botResponse = typeof response.choices[0]?.message?.content === 'string'
      ? response.choices[0].message.content.trim()
      : '';

    if (!botResponse) {
      console.error('[Bot] استجابة فارغة من الذكاء الاصطناعي');
      return;
    }

    // تحليل ما إذا كان يجب التحويل لمريم
    const shouldHandoff = await analyzeHandoffNeed(context, conversationHistory, botResponse);

    if (shouldHandoff) {
      await performHandoff(context, botResponse);
      return;
    }

    // استخراج وتحديث سياق المحادثة
    await updateContextFromConversation(context, userMessage, botResponse);

    // إرسال رد البوت
    await sendBotMessage(context, botResponse);

    // المزامنة مع GoHighLevel إذا عندنا اسم المريض
    if (context.patient.name) {
      await syncWithGHL(context);
    }

  } catch (error) {
    console.error('[Bot] خطأ في معالجة الذكاء الاصطناعي:', error);
  }
}

/**
 * تحليل ما إذا كان يجب التحويل لمريم
 */
async function analyzeHandoffNeed(
  context: BotContext,
  conversationHistory: any[],
  botResponse: string
): Promise<boolean> {
  // التحقق إذا كان البوت يذكر مريم أو التحويل
  if (botResponse.includes('مريم') ||
      botResponse.includes('أستدعي') ||
      botResponse.includes('سأحضر') ||
      botResponse.includes('تحويل') ||
      botResponse.includes('منسقة')) {
    return true;
  }

  // التحقق إذا كانت لدينا معلومات كافية
  const ctx = context.conversation.context;
  const hasName = !!ctx.name;
  const hasNeed = !!ctx.concern || !!ctx.need;
  const hasPreference = !!ctx.preferred_period || !!ctx.time_preference;

  // إذا كانت كل المعلومات متوفرة، نحوّل
  if (hasName && hasNeed && hasPreference) {
    return true;
  }

  // إذا طالت المحادثة أكثر من 10 رسائل
  if (conversationHistory.length > 10) {
    return true;
  }

  return false;
}

/**
 * تحديث سياق المحادثة من الرسائل
 */
async function updateContextFromConversation(
  context: BotContext,
  userMessage: string,
  botResponse: string
): Promise<void> {
  const currentContext = context.conversation.context || {};

  // استخراج الاسم إذا ذُكر
  const nameMatch = userMessage.match(/(?:اسمي|أنا|اسمك|اسم)\s+([ء-يa-zA-Z\s]+)/i);
  if (nameMatch) {
    currentContext.name = nameMatch[1].trim();
    await updatePatient(context.patient.id, { name: currentContext.name });
  }

  // استخراج الحاجة / المشكلة
  if (userMessage.includes('جلد') || userMessage.includes('بشرة') || userMessage.includes('وجه')) {
    currentContext.concern = 'جلد';
    currentContext.doctor = 'د. محمد';
  } else if (userMessage.includes('شعر') || userMessage.includes('فروة')) {
    currentContext.concern = 'شعر';
    currentContext.doctor = 'د. سارة';
  } else if (userMessage.includes('أظافر') || userMessage.includes('ظفر')) {
    currentContext.concern = 'أظافر';
    currentContext.doctor = 'د. محمد';
  }

  // استخراج تفضيل الوقت
  if (userMessage.includes('صباح')) {
    currentContext.preferred_period = 'صباحاً (9ص - 12م)';
  } else if (userMessage.includes('ظهر') || userMessage.includes('بعد الظهر')) {
    currentContext.preferred_period = 'بعد الظهر (12م - 4م)';
  } else if (userMessage.includes('مساء') || userMessage.includes('مساءً')) {
    currentContext.preferred_period = 'مساءً (4م - 8م)';
  } else if (userMessage.includes('سبت')) {
    currentContext.preferred_period = 'السبت';
  }

  // التحقق إذا كان مريضاً عائداً
  if (userMessage.includes('مرة ثانية') ||
      userMessage.includes('عدت') ||
      userMessage.includes('زرت') ||
      userMessage.includes('كنت')) {
    await updatePatient(context.patient.id, { is_returning_patient: true });
  }

  await updateConversation(context.conversation.id, { context: currentContext });
}

/**
 * تنفيذ التحويل إلى مريم
 */
async function performHandoff(context: BotContext, lastMessage: string): Promise<void> {
  // إرسال آخر رسالة أولاً
  await sendBotMessage(context, lastMessage);

  // تحديث حالة المحادثة
  await updateConversation(context.conversation.id, {
    status: 'handoff',
    current_step: 'handoff',
  });

  // إنشاء سجل التحويل
  const summary = `
الاسم: ${context.conversation.context.name || 'غير محدد'}
الهاتف: ${context.patient.phone}
الحاجة: ${context.conversation.context.concern || 'غير محددة'}
الطبيب المقترح: ${context.conversation.context.doctor || 'غير محدد'}
تفضيل الموعد: ${context.conversation.context.preferred_period || 'غير محدد'}
مريض عائد: ${context.patient.is_returning_patient ? 'نعم' : 'لا'}
  `.trim();

  await createHandoff({
    conversation_id: context.conversation.id,
    patient_id: context.patient.id,
    reason: 'qualification_complete',
    summary,
    status: 'pending',
  });

  // إشعار مريم
  await notifyEliana({
    patientName: context.conversation.context.name || 'غير محدد',
    patientPhone: context.patient.phone,
    summary,
    doctor: context.conversation.context.doctor,
    preferredPeriod: context.conversation.context.preferred_period,
  });
}

/**
 * إرسال رسالة من البوت
 */
async function sendBotMessage(context: BotContext, message: string): Promise<void> {
  // الإرسال عبر Z-API فقط إذا لم نكن في وضع المحاكاة
  const isSimulator = context.patient.phone.length === 13 && context.patient.phone.startsWith('55');

  if (!isSimulator) {
    try {
      await sendMessage(context.patient.phone, message);
    } catch (error) {
      console.error('[Bot] خطأ في إرسال الرسالة عبر Z-API:', error);
    }
  }

  // حفظ الرسالة في قاعدة البيانات دائماً
  await saveMessage({
    conversation_id: context.conversation.id,
    direction: 'outbound',
    content: message,
    message_type: 'text',
    metadata: {},
  });
}

/**
 * الحصول على المواعيد المتاحة من GoHighLevel
 */
async function getAvailableAppointmentSlots(daysAhead: number = 7): Promise<string> {
  try {
    const calendarId = process.env.GHL_CALENDAR_ID;
    if (!calendarId) {
      console.error('[Bot] GHL_CALENDAR_ID غير مضبوط');
      return 'المواعيد المتاحة: الأحد إلى الخميس، من 9ص حتى 8م';
    }

    const today = new Date();
    const endDate = new Date();
    endDate.setDate(today.getDate() + daysAhead);

    const startDateStr = today.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    const slots = await getAvailableSlots(calendarId, startDateStr, endDateStr);

    if (slots.length === 0) {
      return 'لا توجد مواعيد متاحة في الأيام القادمة حالياً. سأستدعي مريم للتحقق من خيارات أخرى!';
    }

    // تجميع المواعيد حسب التاريخ وتنسيقها
    const slotsByDate: Record<string, string[]> = {};
    slots.forEach(slot => {
      const date = new Date(slot);
      const dateKey = date.toLocaleDateString('ar-SA', { weekday: 'long', day: '2-digit', month: '2-digit' });
      const timeStr = date.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });

      if (!slotsByDate[dateKey]) {
        slotsByDate[dateKey] = [];
      }
      slotsByDate[dateKey].push(timeStr);
    });

    // تنسيق الرد
    let response = 'المواعيد المتاحة:\n\n';
    Object.entries(slotsByDate).forEach(([date, times]) => {
      response += `${date}: ${times.slice(0, 3).join(', ')}${times.length > 3 ? ' والمزيد...' : ''}\n`;
    });

    return response;
  } catch (error) {
    console.error('[Bot] خطأ في الحصول على المواعيد المتاحة:', error);
    return 'المواعيد المتاحة: الأحد إلى الخميس، من 9ص حتى 8م';
  }
}

/**
 * مزامنة المريض مع GoHighLevel
 */
async function syncWithGHL(context: BotContext): Promise<void> {
  try {
    const nameParts = (context.patient.name || '').split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    const contactId = await upsertGHLContact({
      firstName,
      lastName,
      phone: context.patient.phone,
      tags: ['واتساب بوت', 'عيادة الأمل'],
      customFields: {
        concern: context.conversation.context.concern,
        preferred_doctor: context.conversation.context.doctor,
        preferred_period: context.conversation.context.preferred_period,
      },
    });

    if (contactId) {
      // إضافة ملخص المحادثة كملاحظة
      const conversationSummary = `
محادثة عبر بوت واتساب:
- الحاجة: ${context.conversation.context.concern || 'غير محدد'}
- الطبيب: ${context.conversation.context.doctor || 'غير محدد'}
- الموعد المفضل: ${context.conversation.context.preferred_period || 'غير محدد'}
      `.trim();

      await addNoteToContact(contactId, conversationSummary);
      console.log('[Bot] تمت المزامنة مع GoHighLevel بنجاح');
    }
  } catch (error) {
    console.error('[Bot] خطأ في المزامنة مع GoHighLevel:', error);
  }
}