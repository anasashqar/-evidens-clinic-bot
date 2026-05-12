/**
 * ═══════════════════════════════════════════════════════════════════
 *  BotSettings.tsx — صفحة إعدادات الـ workspace الكاملة
 *
 *  تبويبات:
 *  1. إعدادات Z-API (ربط رقم الواتساب)
 *  2. محرر الشخصية (System Prompt)
 *  3. إعدادات التحويل (Handoff)
 *  4. محاكي المحادثة (Simulator)
 *
 *  الاستخدام في router:
 *    <Route path="/admin/workspace/:workspaceId/settings" element={<BotSettings />} />
 * ═══════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { trpc } from "../utils/trpc"; // عدّل المسار حسب مشروعك

// ─── Tab type ──────────────────────────────────────────────────────────────────

type Tab = "zapi" | "prompt" | "handoff" | "simulator";

// ─── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ message, type }: { message: string; type: "success" | "error" }) {
  return (
    <div
      className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl px-5 py-3 text-sm font-medium text-white shadow-xl transition-all ${
        type === "success" ? "bg-green-600" : "bg-red-600"
      }`}
    >
      {type === "success" ? "✅ " : "❌ "}
      {message}
    </div>
  );
}

// ─── Tab: Z-API Config ─────────────────────────────────────────────────────────

function ZApiTab({
  workspaceId,
  initial,
}: {
  workspaceId: string;
  initial?: { instance_id: string; token: string; client_token: string; base_url?: string };
}) {
  const [form, setForm] = useState({
    instance_id: initial?.instance_id ?? "",
    token: initial?.token ?? "",
    client_token: initial?.client_token ?? "",
    base_url: initial?.base_url ?? "https://api.z-api.io",
  });
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const saveMutation = trpc.admin.saveZapiConfig.useMutation({
    onSuccess: () => showToast("تم حفظ إعدادات Z-API بنجاح ✓", "success"),
    onError: (e) => showToast(e.message, "error"),
  });

  const showToast = (msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  return (
    <div className="space-y-5" dir="rtl">
      <div>
        <h2 className="text-lg font-bold text-gray-900">إعدادات Z-API</h2>
        <p className="mt-1 text-sm text-gray-500">
          ربط رقم واتساب هذا العميل. ستجد هذه القيم في لوحة تحكم{" "}
          <a
            href="https://app.z-api.io"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline"
          >
            z-api.io
          </a>
        </p>
      </div>

      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-700">
        <p className="font-medium">⚡ مهم: الـ Instance ID هو مفتاح الـ Webhook</p>
        <p className="mt-1 text-xs opacity-80">
          عند وصول أي رسالة، يستخدم النظام Instance ID لتحديد هذا العميل تلقائياً.
          تأكد أن كل عميل له Instance ID مختلف.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Instance ID"
          placeholder="ABC12345"
          value={form.instance_id}
          onChange={(v) => setForm((f) => ({ ...f, instance_id: v }))}
          mono
          hint="من صفحة الـ Instance في Z-API"
        />
        <Field
          label="Token"
          placeholder="your-token-here"
          value={form.token}
          onChange={(v) => setForm((f) => ({ ...f, token: v }))}
          mono
          isPassword
          hint="Security Token من Z-API"
        />
        <Field
          label="Client Token"
          placeholder="your-client-token"
          value={form.client_token}
          onChange={(v) => setForm((f) => ({ ...f, client_token: v }))}
          mono
          isPassword
          hint="من إعدادات الحساب"
        />
        <Field
          label="Base URL"
          placeholder="https://api.z-api.io"
          value={form.base_url}
          onChange={(v) => setForm((f) => ({ ...f, base_url: v }))}
          mono
          hint="اتركه كما هو في الغالب"
        />
      </div>

      <button
        onClick={() => saveMutation.mutate({ workspaceId, ...form })}
        disabled={saveMutation.isPending}
        className="w-full rounded-xl bg-gray-900 py-3 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50"
      >
        {saveMutation.isPending ? "جاري الحفظ..." : "💾 حفظ إعدادات Z-API"}
      </button>

      {toast && <Toast message={toast.msg} type={toast.type} />}
    </div>
  );
}

// ─── Tab: System Prompt ────────────────────────────────────────────────────────

const PROMPT_TEMPLATES: Record<string, string> = {
  clinic: `أنت مساعد ذكي لـ {اسم_العيادة}. دورك هو:
1. استقبال المرضى بود وترحيب
2. جمع المعلومات الأساسية: الاسم، المشكلة الصحية، والوقت المفضل للموعد
3. عند اكتمال المعلومات، أخبر المريض أن المنسق سيتواصل معه لتأكيد الموعد

القواعد:
- كن مختصراً وواضحاً في كل رسالة
- لا تعطِ نصائح طبية
- إذا كانت الحالة طارئة، وجّه المريض لأقرب طوارئ`,

  store: `أنت مساعد خدمة عملاء لـ {اسم_المتجر}. دورك هو:
1. الإجابة على استفسارات المنتجات والأسعار
2. مساعدة العميل في اختيار المنتج المناسب
3. شرح طريقة الطلب والشحن
4. تحويل الطلبات الخاصة للفريق البشري

لا تتعهد بأسعار أو توافر منتجات دون تأكيد`,

  restaurant: `أنت مساعد حجوزات لـ {اسم_المطعم}. دورك هو:
1. استقبال طلبات الحجز: الاسم، العدد، التاريخ والوقت
2. الإجابة عن قائمة الطعام والعروض
3. تأكيد الحجوزات بعد جمع المعلومات

كن ودوداً وسريعاً في الرد`,

  real_estate: `أنت مساعد عقاري لـ {اسم_الشركة}. دورك هو:
1. فهم احتياج العميل: بيع/شراء/إيجار، نوع العقار، الميزانية، والموقع
2. تقديم خيارات مناسبة من المتاح
3. جدولة زيارات ميدانية مع المسؤول

لا تعطِ أسعاراً نهائية دون الرجوع للمسؤول`,
};

function PromptTab({
  workspaceId,
  businessType,
  initial,
  businessName,
}: {
  workspaceId: string;
  businessType: string;
  initial?: { business_name: string; system_prompt: string };
  businessName?: string;
}) {
  const [name, setName] = useState(initial?.business_name ?? businessName ?? "");
  const [prompt, setPrompt] = useState(
    initial?.system_prompt?.startsWith("⚠️") ? "" : (initial?.system_prompt ?? "")
  );
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const saveMutation = trpc.admin.saveBotSettings.useMutation({
    onSuccess: () => showToast("تم حفظ شخصية البوت بنجاح ✓", "success"),
    onError: (e) => showToast(e.message, "error"),
  });

  const showToast = (msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadTemplate = () => {
    const template = PROMPT_TEMPLATES[businessType] ?? PROMPT_TEMPLATES.clinic;
    setPrompt(template.replace(/{.*?}/g, name || "البزنس"));
    textareaRef.current?.focus();
  };

  const charCount = prompt.length;
  const isShort = charCount > 0 && charCount < 20;

  return (
    <div className="space-y-5" dir="rtl">
      <div>
        <h2 className="text-lg font-bold text-gray-900">محرر شخصية البوت</h2>
        <p className="mt-1 text-sm text-gray-500">
          الـ System Prompt يُحدد شخصية البوت وكيف يتعامل مع الزبائن. يمكن تعديله في أي وقت دون إعادة نشر.
        </p>
      </div>

      <Field
        label="اسم البزنس"
        placeholder="عيادة النور للجلدية"
        value={name}
        onChange={setName}
        hint="يُذكر في رسائل التحويل للموظف"
      />

      {/* منطقة الـ Prompt */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700">
            System Prompt <span className="text-red-500">*</span>
          </label>
          <button
            onClick={loadTemplate}
            className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 transition hover:bg-blue-100"
          >
            📋 تحميل قالب {businessType === "clinic" ? "العيادة" : businessType === "store" ? "المتجر" : businessType === "restaurant" ? "المطعم" : "العقارات"}
          </button>
        </div>

        <textarea
          ref={textareaRef}
          className={`w-full rounded-xl border bg-white px-4 py-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            isShort ? "border-red-300" : "border-gray-300"
          }`}
          rows={14}
          placeholder="اكتب تعليمات البوت هنا... أو حمّل قالباً جاهزاً من الأعلى"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          style={{ fontFamily: "Tahoma, Arial, sans-serif", direction: "rtl" }}
        />

        <div className="mt-1 flex items-center justify-between text-xs">
          <span className={isShort ? "text-red-500" : "text-gray-400"}>
            {isShort ? "⚠️ الـ prompt قصير جداً (20 حرف على الأقل)" : `${charCount} حرف`}
          </span>
          <span className="text-gray-400">
            {charCount > 2000 ? "⚠️ prompt طويل — قد يؤثر على الأداء" : ""}
          </span>
        </div>
      </div>

      {/* نصائح */}
      <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
        <p className="mb-2 text-xs font-semibold text-gray-600">💡 نصائح لـ prompt أفضل</p>
        <ul className="space-y-1 text-xs text-gray-500 list-disc list-inside">
          <li>حدد دور البوت بوضوح في البداية</li>
          <li>اذكر المعلومات التي يجب جمعها من الزبون</li>
          <li>حدد متى يجب تحويل المحادثة لموظف بشري</li>
          <li>اذكر الأشياء التي يجب تجنبها (مثل: لا تعطِ أسعاراً)</li>
        </ul>
      </div>

      <button
        onClick={() =>
          saveMutation.mutate({
            workspaceId,
            business_name: name,
            system_prompt: prompt,
          })
        }
        disabled={saveMutation.isPending || isShort || !name}
        className="w-full rounded-xl bg-gray-900 py-3 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50"
      >
        {saveMutation.isPending ? "جاري الحفظ..." : "💾 حفظ شخصية البوت"}
      </button>

      {toast && <Toast message={toast.msg} type={toast.type} />}
    </div>
  );
}

// ─── Tab: Handoff Settings ─────────────────────────────────────────────────────

function HandoffTab({
  workspaceId,
  initial,
}: {
  workspaceId: string;
  initial?: {
    business_name: string;
    system_prompt: string;
    handoff_phone?: string | null;
    handoff_name?: string | null;
    max_messages_before_handoff?: number;
    is_bot_active?: boolean;
  };
}) {
  const [form, setForm] = useState({
    business_name: initial?.business_name ?? "",
    system_prompt: initial?.system_prompt ?? "",
    handoff_phone: initial?.handoff_phone ?? "",
    handoff_name: initial?.handoff_name ?? "المنسق",
    max_messages_before_handoff: initial?.max_messages_before_handoff ?? 12,
    is_bot_active: initial?.is_bot_active ?? true,
  });
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const saveMutation = trpc.admin.saveBotSettings.useMutation({
    onSuccess: () => showToast("تم حفظ إعدادات التحويل بنجاح ✓", "success"),
    onError: (e) => showToast(e.message, "error"),
  });

  const showToast = (msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h2 className="text-lg font-bold text-gray-900">إعدادات التحويل</h2>
        <p className="mt-1 text-sm text-gray-500">
          عند اكتمال المحادثة أو طلب الزبون، يُحوِّل البوت المحادثة لموظف بشري على هذا الرقم.
        </p>
      </div>

      <div className="rounded-2xl border bg-white p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-700 border-b pb-2">📞 بيانات المنسق البشري</h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="رقم هاتف المنسق"
            placeholder="9725XXXXXXXX"
            value={form.handoff_phone}
            onChange={(v) => setForm((f) => ({ ...f, handoff_phone: v }))}
            hint="بالصيغة الدولية بدون + (مثال: 972501234567)"
          />
          <Field
            label="اسم المنسق"
            placeholder="مريم"
            value={form.handoff_name}
            onChange={(v) => setForm((f) => ({ ...f, handoff_name: v }))}
            hint="سيذكره البوت للزبون عند التحويل"
          />
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-700 border-b pb-2">⚙️ إعدادات متقدمة</h3>

        {/* Max messages */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            الحد الأقصى للرسائل قبل التحويل
          </label>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={3}
              max={30}
              value={form.max_messages_before_handoff}
              onChange={(e) =>
                setForm((f) => ({ ...f, max_messages_before_handoff: Number(e.target.value) }))
              }
              className="flex-1"
            />
            <span className="w-12 rounded-lg bg-gray-100 py-1 text-center text-sm font-bold text-gray-700">
              {form.max_messages_before_handoff}
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-400">
            إذا تجاوز عدد رسائل المحادثة هذا الحد، يُحوَّل تلقائياً
          </p>
        </div>

        {/* تفعيل/تعطيل البوت */}
        <div className="flex items-center justify-between rounded-xl bg-gray-50 p-4">
          <div>
            <p className="text-sm font-medium text-gray-700">حالة البوت</p>
            <p className="text-xs text-gray-400">
              {form.is_bot_active ? "البوت يعمل ويرد على الرسائل" : "البوت متوقف — الرسائل لن تُعالج"}
            </p>
          </div>
          <button
            onClick={() => setForm((f) => ({ ...f, is_bot_active: !f.is_bot_active }))}
            className={`relative h-7 w-14 rounded-full transition-colors ${
              form.is_bot_active ? "bg-green-500" : "bg-gray-300"
            }`}
          >
            <span
              className={`absolute top-0.5 h-6 w-6 transform rounded-full bg-white shadow transition-transform ${
                form.is_bot_active ? "translate-x-7" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      </div>

      {/* معاينة رسالة التحويل */}
      {form.handoff_phone && (
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
          <p className="mb-2 text-xs font-semibold text-blue-700">👁️ معاينة رسالة التحويل للمنسق</p>
          <div className="rounded-xl bg-white p-3 text-xs text-gray-600 whitespace-pre-line border border-blue-100">
            {`🔔 *طلب جديد - ${initial?.business_name ?? "البزنس"}*

👤 *العميل:* [اسم الزبون]
📱 *الهاتف:* [رقم الزبون]

📋 *ملخص المحادثة:*
[ملخص تلقائي من البوت]

---
يرجى التواصل مع العميل في أقرب وقت.`}
          </div>
          <p className="mt-2 text-xs text-blue-600">
            ✅ ستُرسل لـ {form.handoff_name} على {form.handoff_phone}
          </p>
        </div>
      )}

      <button
        onClick={() =>
          saveMutation.mutate({
            workspaceId,
            business_name: form.business_name || (initial?.business_name ?? ""),
            system_prompt: form.system_prompt || (initial?.system_prompt ?? " "),
            handoff_phone: form.handoff_phone || undefined,
            handoff_name: form.handoff_name || undefined,
            max_messages_before_handoff: form.max_messages_before_handoff,
            is_bot_active: form.is_bot_active,
          })
        }
        disabled={saveMutation.isPending}
        className="w-full rounded-xl bg-gray-900 py-3 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50"
      >
        {saveMutation.isPending ? "جاري الحفظ..." : "💾 حفظ إعدادات التحويل"}
      </button>

      {toast && <Toast message={toast.msg} type={toast.type} />}
    </div>
  );
}

// ─── Tab: Simulator ────────────────────────────────────────────────────────────

type SimMsg = { id: string; direction: "inbound" | "outbound"; content: string; timestamp: string };

function SimulatorTab({ workspaceId }: { workspaceId: string }) {
  const [phone] = useState("0500000000"); // رقم ثابت للمحاكي
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const messagesQuery = trpc.admin.getSimulatorMessages.useQuery(
    { workspaceId, phone },
    { refetchInterval: 1500 }
  );

  const sendMutation = trpc.admin.simulateMessage.useMutation({
    onSuccess: () => messagesQuery.refetch(),
  });

  const handleSend = () => {
    if (!input.trim()) return;
    sendMutation.mutate({ workspaceId, phone, message: input.trim() });
    setInput("");
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messagesQuery.data]);

  const messages: SimMsg[] = messagesQuery.data ?? [];

  return (
    <div className="flex h-[600px] flex-col rounded-2xl border border-gray-200 overflow-hidden" dir="rtl">
      {/* الهيدر */}
      <div className="flex items-center gap-3 border-b bg-gray-900 px-4 py-3 text-white">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-500 text-lg">
          💬
        </div>
        <div>
          <p className="text-sm font-semibold">محاكي المحادثة</p>
          <p className="text-xs text-gray-400">زبون تجريبي — {phone}</p>
        </div>
        <div className="mr-auto flex items-center gap-1 rounded-full bg-green-500/20 px-2.5 py-0.5 text-xs text-green-400">
          <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
          محاكاة
        </div>
      </div>

      {/* الرسائل */}
      <div className="flex-1 overflow-y-auto bg-[#efeae2] p-4 space-y-2">
        {messages.length === 0 && !messagesQuery.isLoading && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center text-gray-400">
            <span className="text-4xl">👋</span>
            <p className="text-sm">ابدأ المحادثة بكتابة رسالة أدناه</p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.direction === "inbound" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-xs rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                msg.direction === "inbound"
                  ? "rounded-tr-sm bg-[#d9fdd3] text-gray-800"
                  : "rounded-tl-sm bg-white text-gray-800"
              }`}
            >
              <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
              <p className="mt-1 text-right text-xs text-gray-400">
                {new Date(msg.timestamp).toLocaleTimeString("ar-SA", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {msg.direction === "inbound" ? " ✓✓" : ""}
              </p>
            </div>
          </div>
        ))}

        {sendMutation.isPending && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-tl-sm bg-white px-4 py-2.5 text-sm shadow-sm text-gray-400">
              <span className="flex gap-1 items-center">
                <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "300ms" }} />
              </span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* إدخال الرسالة */}
      <div className="border-t bg-white px-3 py-2.5 flex gap-2 items-end">
        <textarea
          className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="اكتب رسالة تجريبية..."
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <button
          onClick={handleSend}
          disabled={sendMutation.isPending || !input.trim()}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-600 text-white transition hover:bg-green-700 disabled:opacity-40"
        >
          ↩
        </button>
      </div>
    </div>
  );
}

// ─── Field Component ──────────────────────────────────────────────────────────

function Field({
  label,
  placeholder,
  value,
  onChange,
  hint,
  mono,
  isPassword,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  mono?: boolean;
  isPassword?: boolean;
}) {
  const [show, setShow] = useState(false);

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      <div className="relative">
        <input
          type={isPassword && !show ? "password" : "text"}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            mono ? "font-mono" : ""
          } ${isPassword ? "pl-10" : ""}`}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            {show ? "🙈" : "👁️"}
          </button>
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BotSettings() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>("zapi");

  const { data: allWorkspaces, isLoading } = trpc.admin.workspaces.useQuery();

  const workspaceRow = allWorkspaces?.find(
    (w: any) => w.workspace.id === workspaceId
  );

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center" dir="rtl">
        <div className="text-center text-gray-400">
          <div className="mb-3 text-4xl animate-spin">⚙️</div>
          <p>جاري التحميل...</p>
        </div>
      </div>
    );
  }

  if (!workspaceRow) {
    return (
      <div className="flex min-h-screen items-center justify-center" dir="rtl">
        <div className="text-center text-gray-400">
          <p className="text-xl">⚠️ الـ Workspace غير موجود</p>
          <button
            onClick={() => navigate("/admin/workspaces")}
            className="mt-4 rounded-xl bg-gray-900 px-5 py-2.5 text-sm text-white"
          >
            العودة
          </button>
        </div>
      </div>
    );
  }

  const { workspace, botSettings, zapiConfig } = workspaceRow;

  const tabs: { id: Tab; label: string; icon: string; done: boolean }[] = [
    { id: "zapi",      label: "Z-API",       icon: "📱", done: !!zapiConfig },
    { id: "prompt",    label: "الشخصية",     icon: "🤖", done: !!(botSettings?.system_prompt && !botSettings.system_prompt.startsWith("⚠️")) },
    { id: "handoff",   label: "التحويل",     icon: "🔄", done: !!botSettings?.handoff_phone },
    { id: "simulator", label: "المحاكي",     icon: "💬", done: true },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-6" dir="rtl">
      {/* الهيدر */}
      <div className="mb-6 flex items-center gap-4">
        <button
          onClick={() => navigate("/admin/workspaces")}
          className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          ← رجوع
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            ⚙️ إعدادات: {workspace.name}
          </h1>
          <p className="text-sm text-gray-400 font-mono">{workspace.slug}</p>
        </div>
        {/* شريط التقدم */}
        <div className="mr-auto flex items-center gap-2">
          {tabs.filter((t) => t.id !== "simulator").map((t) => (
            <div key={t.id} className="flex items-center gap-1 text-xs">
              <span className={t.done ? "text-green-600" : "text-gray-300"}>
                {t.done ? "✅" : "⭕"}
              </span>
              <span className="text-gray-500 hidden sm:inline">{t.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-6">
        {/* القائمة الجانبية */}
        <div className="w-44 shrink-0">
          <nav className="space-y-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? "bg-gray-900 text-white shadow-lg"
                    : "text-gray-600 hover:bg-white hover:shadow"
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                {tab.id !== "simulator" && (
                  <span className={`mr-auto text-xs ${tab.done ? "text-green-400" : "text-orange-400"}`}>
                    {tab.done ? "✓" : "!"}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* المحتوى */}
        <div className="flex-1 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          {activeTab === "zapi" && (
            <ZApiTab
              workspaceId={workspace.id}
              initial={zapiConfig ?? undefined}
            />
          )}
          {activeTab === "prompt" && (
            <PromptTab
              workspaceId={workspace.id}
              businessType={workspace.business_type}
              initial={botSettings ?? undefined}
              businessName={workspace.name}
            />
          )}
          {activeTab === "handoff" && (
            <HandoffTab
              workspaceId={workspace.id}
              initial={botSettings ?? undefined}
            />
          )}
          {activeTab === "simulator" && (
            <SimulatorTab workspaceId={workspace.id} />
          )}
        </div>
      </div>
    </div>
  );
}
