/**
 * BotSettings.tsx — إعدادات الـ Workspace
 * ملاحظة: داخل DashboardLayout — لا min-h-screen هنا
 */

import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "../lib/trpc";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Smartphone,
  Bot,
  ArrowRightLeft,
  MessageSquare,
  ChevronRight,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { PageTransition } from "../components/PageTransition";
import { PageSkeleton } from "../components/PageSkeleton";

// ─── Field Component ───────────────────────────────────────────────────────────

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
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="relative">
        <Input
          type={isPassword && !show ? "password" : "text"}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${mono ? "font-mono text-sm" : ""} ${isPassword ? "pl-9" : ""}`}
          dir="ltr"
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ─── Tab: Z-API ────────────────────────────────────────────────────────────────

function ZApiTab({
  workspaceId,
  initial,
}: {
  workspaceId: string;
  initial?: { instance_id: string; token: string; client_token: string; base_url?: string };
}) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState({
    instance_id: initial?.instance_id ?? "",
    token: initial?.token ?? "",
    client_token: initial?.client_token ?? "",
    base_url: initial?.base_url ?? "https://api.z-api.io",
  });

  const saveMutation = trpc.admin.saveZapiConfig.useMutation({
    onSuccess: () => {
      toast.success("تم حفظ إعدادات Z-API بنجاح");
      utils.admin.workspaces.invalidate();
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  useEffect(() => {
    if (initial) {
      setForm({
        instance_id: initial.instance_id ?? "",
        token: initial.token ?? "",
        client_token: initial.client_token ?? "",
        base_url: initial.base_url ?? "https://api.z-api.io",
      });
    }
  }, [initial?.instance_id, initial?.token, initial?.client_token, initial?.base_url]);

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h2 className="text-base font-semibold">ربط Z-API</h2>
        <p className="text-sm text-muted-foreground mt-1">
          ستجد هذه القيم في لوحة تحكم{" "}
          <a
            href="https://app.z-api.io"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2"
          >
            z-api.io
          </a>
        </p>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-4 pb-4">
          <p className="text-sm font-medium text-primary">مهم: الـ Instance ID هو مفتاح الـ Webhook</p>
          <p className="text-xs text-muted-foreground mt-1">
            كل عميل يجب أن يكون له Instance ID مختلف لتوجيه الرسائل بشكل صحيح.
          </p>
        </CardContent>
      </Card>

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

      <Button
        onClick={() => saveMutation.mutate({ workspaceId, ...form })}
        disabled={saveMutation.isPending}
        className="w-full"
      >
        {saveMutation.isPending ? (
          <>
            <Loader2 className="h-4 w-4 ml-2 animate-spin" />
            جاري الحفظ...
          </>
        ) : (
          "حفظ إعدادات Z-API"
        )}
      </Button>


    </div>
  );
}

// ─── Tab: Prompt ───────────────────────────────────────────────────────────────

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

const BUSINESS_TYPE_LABELS: Record<string, string> = {
  clinic: "العيادة",
  store: "المتجر",
  restaurant: "المطعم",
  real_estate: "العقارات",
  other: "البزنس",
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const utils = trpc.useUtils();
  const saveMutation = trpc.admin.saveBotSettings.useMutation({
    onSuccess: () => {
      toast.success("تم حفظ شخصية البوت بنجاح");
      utils.admin.workspaces.invalidate();
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  useEffect(() => {
    if (initial) {
      setName(initial.business_name ?? businessName ?? "");
      setPrompt(initial.system_prompt?.startsWith("⚠️") ? "" : (initial.system_prompt ?? ""));
    }
  }, [initial?.business_name, initial?.system_prompt, businessName]);

  const charCount = prompt.length;
  const isShort = charCount > 0 && charCount < 20;
  const typeLabel = BUSINESS_TYPE_LABELS[businessType] ?? "البزنس";

  const loadTemplate = () => {
    const template = PROMPT_TEMPLATES[businessType] ?? PROMPT_TEMPLATES.clinic;
    setPrompt(template.replace(/{.*?}/g, name || typeLabel));
    textareaRef.current?.focus();
  };

  return (
    <div className="space-y-5" dir="rtl">
      <div>
        <h2 className="text-base font-semibold">محرر شخصية البوت</h2>
        <p className="text-sm text-muted-foreground mt-1">
          الـ System Prompt يُحدد كيف يتصرف البوت مع الزبائن. يمكن تعديله في أي وقت.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="biz-name">اسم البزنس</Label>
        <Input
          id="biz-name"
          placeholder="مثال: عيادة النور للجلدية"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">يُذكر في رسائل التحويل للموظف</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>
            System Prompt <span className="text-destructive">*</span>
          </Label>
          <Button variant="outline" size="sm" onClick={loadTemplate} className="h-7 text-xs">
            تحميل قالب {typeLabel}
          </Button>
        </div>

        <textarea
          ref={textareaRef}
          className={`w-full rounded-lg border bg-background px-4 py-3 text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-ring transition-colors ${
            isShort ? "border-destructive ring-destructive/20" : "border-input"
          }`}
          rows={13}
          placeholder="اكتب تعليمات البوت هنا، أو حمّل قالباً جاهزاً..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          style={{ fontFamily: "Tahoma, Arial, sans-serif", direction: "rtl" }}
        />

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className={isShort ? "text-destructive" : ""}>
            {isShort ? "⚠️ الـ prompt قصير جداً (20 حرف على الأقل)" : `${charCount} حرف`}
          </span>
          {charCount > 2000 && (
            <span className="text-amber-600">⚠️ prompt طويل — قد يؤثر على الأداء</span>
          )}
        </div>
      </div>

      <Card className="bg-muted/50 border-0">
        <CardContent className="pt-4 pb-4">
          <p className="text-xs font-semibold mb-2">نصائح لـ prompt أفضل</p>
          <ul className="space-y-1 text-xs text-muted-foreground list-disc list-inside">
            <li>حدد دور البوت بوضوح في البداية</li>
            <li>اذكر المعلومات التي يجب جمعها من الزبون</li>
            <li>حدد متى يجب تحويل المحادثة لموظف بشري</li>
            <li>اذكر الأشياء التي يجب تجنبها (مثل: لا تعطِ أسعاراً)</li>
          </ul>
        </CardContent>
      </Card>

      <Button
        onClick={() =>
          saveMutation.mutate({ workspaceId, business_name: name, system_prompt: prompt })
        }
        disabled={saveMutation.isPending || isShort || !name}
        className="w-full"
      >
        {saveMutation.isPending ? (
          <>
            <Loader2 className="h-4 w-4 ml-2 animate-spin" />
            جاري الحفظ...
          </>
        ) : (
          "حفظ شخصية البوت"
        )}
      </Button>


    </div>
  );
}

// ─── Tab: Handoff ──────────────────────────────────────────────────────────────

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
    handoff_message_template?: string | null;
    client_label?: string | null;
    staff_label?: string | null;
  };
}) {
  const [form, setForm] = useState({
    business_name: initial?.business_name ?? "",
    system_prompt: initial?.system_prompt ?? "",
    handoff_phone: initial?.handoff_phone ?? "",
    handoff_name: initial?.handoff_name ?? "المنسق",
    max_messages_before_handoff: initial?.max_messages_before_handoff ?? 12,
    is_bot_active: initial?.is_bot_active ?? true,
    handoff_message_template: initial?.handoff_message_template ?? "",
    client_label: initial?.client_label ?? "",
    staff_label: initial?.staff_label ?? "",
  });

  const utils = trpc.useUtils();
  const saveMutation = trpc.admin.saveBotSettings.useMutation({
    onSuccess: () => {
      toast.success("تم حفظ إعدادات التحويل بنجاح");
      utils.admin.workspaces.invalidate();
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  useEffect(() => {
    if (initial) {
      setForm({
        business_name: initial.business_name ?? "",
        system_prompt: initial.system_prompt ?? "",
        handoff_phone: initial.handoff_phone ?? "",
        handoff_name: initial.handoff_name ?? "المنسق",
        max_messages_before_handoff: initial.max_messages_before_handoff ?? 12,
        is_bot_active: initial.is_bot_active ?? true,
        handoff_message_template: initial.handoff_message_template ?? "",
        client_label: initial.client_label ?? "",
        staff_label: initial.staff_label ?? "",
      });
    }
  }, [
    initial?.business_name,
    initial?.system_prompt,
    initial?.handoff_phone,
    initial?.handoff_name,
    initial?.max_messages_before_handoff,
    initial?.is_bot_active,
    initial?.handoff_message_template,
  ]);

  return (
    <div className="space-y-5" dir="rtl">
      <div>
        <h2 className="text-base font-semibold">إعدادات التحويل</h2>
        <p className="text-sm text-muted-foreground mt-1">
          عند اكتمال المحادثة، يُحوِّل البوت الزبون لموظف بشري على هذا الرقم.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">بيانات المنسق البشري</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>رقم هاتف المنسق</Label>
              <Input
                placeholder="972501234567"
                value={form.handoff_phone}
                onChange={(e) => setForm((f) => ({ ...f, handoff_phone: e.target.value }))}
                dir="ltr"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                بالصيغة الدولية بدون + (مثال: 972501234567)
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>اسم المنسق</Label>
              <Input
                placeholder="مريم"
                value={form.handoff_name}
                onChange={(e) => setForm((f) => ({ ...f, handoff_name: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                سيذكره البوت للزبون عند التحويل
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">إعدادات متقدمة</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Max messages slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>الحد الأقصى للرسائل قبل التحويل</Label>
              <span className="text-sm font-bold bg-muted px-2.5 py-0.5 rounded-md">
                {form.max_messages_before_handoff}
              </span>
            </div>
            <input
              type="range"
              min={3}
              max={30}
              value={form.max_messages_before_handoff}
              onChange={(e) =>
                setForm((f) => ({ ...f, max_messages_before_handoff: Number(e.target.value) }))
              }
              className="w-full accent-primary"
            />
            <p className="text-xs text-muted-foreground">
              إذا تجاوز عدد رسائل المحادثة هذا الحد، يُحوَّل تلقائياً
            </p>
          </div>

          {/* Bot toggle */}
          <div className="flex items-center justify-between rounded-xl bg-muted/50 p-4">
            <div>
              <p className="text-sm font-medium">حالة البوت</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {form.is_bot_active
                  ? "البوت يعمل ويرد على الرسائل"
                  : "البوت متوقف — الرسائل لن تُعالج"}
              </p>
            </div>
            <button
              onClick={() => setForm((f) => ({ ...f, is_bot_active: !f.is_bot_active }))}
              className={`relative h-7 w-14 rounded-full transition-colors ${
                form.is_bot_active ? "bg-green-500" : "bg-muted-foreground/30"
              }`}
            >
              <span
                className={`absolute top-0.5 h-6 w-6 transform rounded-full bg-white shadow-sm transition-transform ${
                  form.is_bot_active ? "translate-x-7" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        </CardContent>
      </Card>

      {/* قالب رسالة التحويل المخصص */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">تسميات مخصصة (اختياري)</CardTitle>
          <CardDescription className="text-xs">
            يستبدل التسميات الافتراضية حسب نوع البزنس — اتركها فارغةً لاستخدام القيم الذكية تلقائياً.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="client-label">تسمية العميل</Label>
              <Input
                id="client-label"
                placeholder="مريض / عميل / زبون..."
                value={form.client_label}
                onChange={(e) => setForm((f) => ({ ...f, client_label: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">افتراضي: حسب نوع البزنس (مريض / عميل / زبون)</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="staff-label">تسمية مقدم الخدمة</Label>
              <Input
                id="staff-label"
                placeholder="الطبيب / المختص / الوكيل..."
                value={form.staff_label}
                onChange={(e) => setForm((f) => ({ ...f, staff_label: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">افتراضي: حسب نوع البزنس (الطبيب / المختص / الوكيل)</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* قالب رسالة التحويل المخصص */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">قالب رسالة المنسق</CardTitle>
          <CardDescription className="text-xs">
            اكتب قالبك باستخدام المتغيرات أدناه. إذا تركته فارغاً يُستخدم القالب الافتراضي.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* بطاقة المتغيرات */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {[
              { key: "{name}", label: "الاسم" },
              { key: "{phone}", label: "رقم الهاتف" },
              { key: "{phone_link}", label: "رابط واتساب" },
              { key: "{concern}", label: "الطلب/الخدمة" },
              { key: "{preferred_period}", label: "الوقت المفضل" },
              { key: "{is_urgent}", label: "مستعجل/عادي" },
              { key: "{is_returning}", label: "جديد/عائد" },
              { key: "{response_time}", label: "وقت الاستجابة" },
              { key: "{message_count}", label: "عدد الرسائل" },
              { key: "{business_name}", label: "اسم البزنس" },
            ].map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    handoff_message_template: f.handoff_message_template + key,
                  }))
                }
                className="flex flex-col items-start rounded-lg border border-dashed border-primary/40 bg-primary/5 px-2 py-1.5 text-left hover:bg-primary/10 transition-colors"
              >
                <span className="font-mono text-[10px] text-primary">{key}</span>
                <span className="text-[10px] text-muted-foreground">{label}</span>
              </button>
            ))}
          </div>

          <textarea
            className="w-full rounded-lg border border-input bg-background px-4 py-3 text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-ring font-mono"
            rows={8}
            placeholder={`🔔 *عميل جديد*\n━━━━━━━━━━━━━━━━━━━━\n👤 الاسم: {name}\n📞 الهاتف: {phone}\n🔗 واتساب: {phone_link}\n🔧 الطلب: {concern}\n⏰ التفضيل: {preferred_period}\n⚡ الإلحاح: {is_urgent}`}
            value={form.handoff_message_template}
            onChange={(e) =>
              setForm((f) => ({ ...f, handoff_message_template: e.target.value }))
            }
            dir="rtl"
          />

          {/* معاينة حية */}
          {form.handoff_message_template && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">معاينة الرسالة</p>
              <div className="rounded-xl border bg-muted/40 px-4 py-3 text-sm whitespace-pre-line leading-relaxed font-mono text-foreground">
                {form.handoff_message_template
                  .replace(/\{name\}/g, "سارة الأحمدي")
                  .replace(/\{phone\}/g, "966501234567")
                  .replace(/\{phone_link\}/g, "wa.me/966501234567")
                  .replace(/\{concern\}/g, "استشارة أولية")
                  .replace(/\{preferred_period\}/g, "مساء الأسبوع القادم")
                  .replace(/\{is_urgent\}/g, "عادي")
                  .replace(/\{is_returning\}/g, "جديد 🆕")
                  .replace(/\{response_time\}/g, "4 دقائق")
                  .replace(/\{message_count\}/g, "6")
                  .replace(/\{business_name\}/g, initial?.business_name || "البزنس")}
              </div>
            </div>
          )}
        </CardContent>
      </Card>



      <Button
        onClick={() =>
          saveMutation.mutate({
            workspaceId,
            business_name: form.business_name || (initial?.business_name ?? ""),
            system_prompt: form.system_prompt || (initial?.system_prompt ?? " "),
            handoff_phone: form.handoff_phone || undefined,
            handoff_name: form.handoff_name || undefined,
            max_messages_before_handoff: form.max_messages_before_handoff,
            is_bot_active: form.is_bot_active,
            handoff_message_template: form.handoff_message_template || null,
            client_label: form.client_label || null,
            staff_label: form.staff_label || null,
          })
        }
        disabled={saveMutation.isPending}
        className="w-full"
      >
        {saveMutation.isPending ? (
          <>
            <Loader2 className="h-4 w-4 ml-2 animate-spin" />
            جاري الحفظ...
          </>
        ) : (
          "حفظ إعدادات التحويل"
        )}
      </Button>


    </div>
  );
}

// ─── Tab: Simulator ────────────────────────────────────────────────────────────

type SimMsg = { id: string; direction: "inbound" | "outbound"; content: string; timestamp: string };

function SimulatorTab({ workspaceId }: { workspaceId: string }) {
  const [phone] = useState("0500000000");
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
    <div
      className="flex flex-col rounded-xl border overflow-hidden"
      style={{ height: "520px" }}
      dir="rtl"
    >
      <div className="flex items-center gap-3 border-b bg-muted/50 px-4 py-3">
        <div className="h-8 w-8 rounded-full bg-green-500 flex items-center justify-center text-white shrink-0">
          <MessageSquare className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-medium">محاكي المحادثة</p>
          <p className="text-xs text-muted-foreground">{phone}</p>
        </div>
        <Badge variant="outline" className="mr-auto text-xs text-green-600 border-green-200 bg-green-50 gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
          محاكاة
        </Badge>
      </div>

      <div className="flex-1 overflow-y-auto bg-muted/30 dark:bg-background/50 p-4 space-y-3">
        {messages.length === 0 && !messagesQuery.isLoading && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground opacity-60">
            <MessageSquare className="h-10 w-10" />
            <p className="text-sm">ابدأ المحادثة بكتابة رسالة أدناه</p>
          </div>
        )}
        <AnimatePresence>
          {messages.map((msg) => (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              key={msg.id}
              className={`flex ${msg.direction === "inbound" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-xs rounded-2xl px-4 py-2.5 text-sm shadow-sm border ${
                  msg.direction === "inbound"
                    ? "rounded-tr-sm bg-primary/10 border-primary/20 text-foreground"
                    : "rounded-tl-sm bg-card border-border text-foreground"
                }`}
              >
                <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                <p className="mt-1.5 text-left text-[10px] text-muted-foreground font-mono">
                  {new Date(msg.timestamp).toLocaleTimeString("ar-SA", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {msg.direction === "inbound" ? " ✓✓" : ""}
                </p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {sendMutation.isPending && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-tl-sm bg-white px-4 py-2.5 shadow-sm">
              <div className="flex gap-1 items-center">
                {[0, 150, 300].map((delay) => (
                  <span
                    key={delay}
                    className="h-2 w-2 rounded-full bg-gray-400 animate-bounce"
                    style={{ animationDelay: `${delay}ms` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t bg-background px-3 py-2.5 flex gap-2 items-end">
        <textarea
          className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
        <Button
          size="icon"
          onClick={handleSend}
          disabled={sendMutation.isPending || !input.trim()}
          className="shrink-0 bg-green-600 hover:bg-green-700"
        >
          {sendMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowRight className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function BotSettings() {
  const params = useParams<{ workspaceId: string }>();
  const workspaceId = params.workspaceId;
  const [, navigate] = useLocation();

  const { data: allWorkspaces, isLoading, isFetching } = trpc.admin.workspaces.useQuery(
    undefined,
    { staleTime: 30_000 } // 30 ثانية — تمنع إعادة الفتش عند الانتقال بين الصفحات
  );
  const workspaceRow = allWorkspaces?.find((w: any) => w.workspace.id === workspaceId);

  // Show loading if: initial load OR no workspaceId OR still fetching and no cached match yet
  if (!workspaceId || isLoading || (isFetching && !workspaceRow)) {
    return <PageSkeleton />;
  }

  if (!workspaceRow) {
    return (
      <PageTransition className="flex flex-col items-center justify-center py-32 gap-4" dir="rtl">
        <AlertCircle className="h-12 w-12 text-muted-foreground/30" />
        <p className="text-muted-foreground">الـ Workspace غير موجود</p>
        <Button variant="outline" onClick={() => navigate("/workspaces")}>
          العودة للعملاء
        </Button>
      </PageTransition>
    );
  }

  const { workspace, botSettings, zapiConfig } = workspaceRow;

  const tabs = [
    {
      id: "zapi",
      label: "Z-API",
      icon: Smartphone,
      done: !!zapiConfig,
    },
    {
      id: "prompt",
      label: "الشخصية",
      icon: Bot,
      done: !!(botSettings?.system_prompt && !botSettings.system_prompt.startsWith("⚠️")),
    },
    {
      id: "handoff",
      label: "التحويل",
      icon: ArrowRightLeft,
      done: !!botSettings?.handoff_phone,
    },
    {
      id: "simulator",
      label: "المحاكي",
      icon: MessageSquare,
      done: true,
    },
  ];

  return (
    <PageTransition className="space-y-5" dir="rtl">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/workspaces")}
          className="gap-1.5"
        >
          <ChevronRight className="h-4 w-4" />
          العملاء
        </Button>
        <span className="text-muted-foreground">/</span>
        <div>
          <h1 className="text-xl font-bold tracking-tight">{workspace.name}</h1>
          <p className="text-xs text-muted-foreground font-mono">{workspace.slug}</p>
        </div>

        {/* Progress indicators */}
        <div className="mr-auto hidden sm:flex items-center gap-1.5">
          {tabs
            .filter((t) => t.id !== "simulator")
            .map((t) => (
              <Badge
                key={t.id}
                variant={t.done ? "default" : "outline"}
                className={`gap-1 text-xs ${t.done ? "bg-green-600" : "text-muted-foreground"}`}
              >
                {t.done ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : (
                  <AlertCircle className="h-3 w-3" />
                )}
                {t.label}
              </Badge>
            ))}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="zapi">
        <TabsList className="grid w-full grid-cols-4">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id} className="gap-1.5 text-xs sm:text-sm">
              <tab.icon className="h-4 w-4" />
              <span className="hidden sm:inline">{tab.label}</span>
              {tab.id !== "simulator" && (
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    tab.done ? "bg-green-500" : "bg-amber-400"
                  }`}
                />
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="mt-4 rounded-xl border bg-card p-6 overflow-hidden">
          <TabsContent value="zapi" className="mt-0">
            <ZApiTab workspaceId={workspace.id} initial={zapiConfig ?? undefined} />
          </TabsContent>

          <TabsContent value="prompt" className="mt-0">
            <PromptTab
              workspaceId={workspace.id}
              businessType={workspace.business_type}
              initial={botSettings ?? undefined}
              businessName={workspace.name}
            />
          </TabsContent>

          <TabsContent value="handoff" className="mt-0">
            <HandoffTab workspaceId={workspace.id} initial={botSettings ?? undefined} />
          </TabsContent>

          <TabsContent value="simulator" className="mt-0">
            <SimulatorTab workspaceId={workspace.id} />
          </TabsContent>
        </div>
      </Tabs>
    </PageTransition>
  );
}