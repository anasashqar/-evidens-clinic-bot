/**
 * ═══════════════════════════════════════════════════════════════════
 *  Workspaces.tsx — صفحة إدارة العملاء (Super Admin)
 *
 *  الوظائف:
 *  - عرض كل الـ workspaces مع حالتها
 *  - إنشاء workspace جديد
 *  - تفعيل / تعطيل workspace
 *  - الانتقال لصفحة إعدادات كل workspace
 * ═══════════════════════════════════════════════════════════════════
 */

import { useState } from "react";
import { trpc } from "../lib/trpc"; // عدّل المسار حسب مشروعك
import { useLocation } from "wouter";

// ─── Types ─────────────────────────────────────────────────────────────────────

type BusinessType = "clinic" | "store" | "restaurant" | "real_estate" | "other";

const BUSINESS_TYPE_LABELS: Record<BusinessType, { label: string; icon: string; color: string }> = {
  clinic:      { label: "عيادة",     icon: "🏥", color: "bg-blue-50 text-blue-700 border-blue-200" },
  store:       { label: "متجر",      icon: "🛍️", color: "bg-purple-50 text-purple-700 border-purple-200" },
  restaurant:  { label: "مطعم",      icon: "🍽️", color: "bg-orange-50 text-orange-700 border-orange-200" },
  real_estate: { label: "عقارات",    icon: "🏢", color: "bg-green-50 text-green-700 border-green-200" },
  other:       { label: "أخرى",      icon: "💼", color: "bg-gray-50 text-gray-700 border-gray-200" },
};

// ─── Modal: Create Workspace ───────────────────────────────────────────────────

function CreateWorkspaceModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    slug: "",
    business_type: "clinic" as BusinessType,
    owner_email: "",
  });
  const [errors, setErrors] = useState<Partial<typeof form>>({});

  const createMutation = trpc.admin.createWorkspace.useMutation({
    onSuccess: () => {
      onSuccess();
      onClose();
    },
  });

  // توليد slug تلقائي من الاسم
  const handleNameChange = (name: string) => {
    const slug = name
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\w-]/g, "")
      .slice(0, 50);
    setForm((f) => ({ ...f, name, slug }));
  };

  const validate = () => {
    const e: Partial<typeof form> = {};
    if (form.name.length < 2) e.name = "الاسم قصير جداً";
    if (!/^[a-z0-9-]+$/.test(form.slug)) e.slug = "حروف إنجليزية صغيرة وأرقام وشرطة فقط";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    createMutation.mutate({
      name: form.name,
      slug: form.slug,
      business_type: form.business_type,
      owner_email: form.owner_email || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" dir="rtl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">إضافة عميل جديد</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          {/* اسم البزنس */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              اسم البزنس <span className="text-red-500">*</span>
            </label>
            <input
              className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.name ? "border-red-400" : "border-gray-300"
              }`}
              placeholder="مثال: عيادة النور للجلدية"
              value={form.name}
              onChange={(e) => handleNameChange(e.target.value)}
            />
            {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
          </div>

          {/* Slug */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              المعرف (Slug) <span className="text-red-500">*</span>
            </label>
            <input
              className={`w-full rounded-lg border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.slug ? "border-red-400" : "border-gray-300"
              }`}
              placeholder="al-noor-clinic"
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
            />
            {errors.slug ? (
              <p className="mt-1 text-xs text-red-500">{errors.slug}</p>
            ) : (
              <p className="mt-1 text-xs text-gray-400">يُستخدم داخلياً للتوجيه — لا يمكن تغييره لاحقاً</p>
            )}
          </div>

          {/* نوع البزنس */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">نوع البزنس</label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.entries(BUSINESS_TYPE_LABELS) as [BusinessType, any][]).map(
                ([type, { label, icon }]) => (
                  <button
                    key={type}
                    onClick={() => setForm((f) => ({ ...f, business_type: type }))}
                    className={`flex flex-col items-center gap-1 rounded-xl border-2 py-3 text-xs font-medium transition-all ${
                      form.business_type === type
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-gray-200 text-gray-500 hover:border-gray-300"
                    }`}
                  >
                    <span className="text-xl">{icon}</span>
                    {label}
                  </button>
                )
              )}
            </div>
          </div>

          {/* البريد الإلكتروني (اختياري) */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              بريد صاحب البزنس{" "}
              <span className="text-xs font-normal text-gray-400">(اختياري)</span>
            </label>
            <input
              type="email"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="owner@example.com"
              value={form.owner_email}
              onChange={(e) => setForm((f) => ({ ...f, owner_email: e.target.value }))}
            />
          </div>
        </div>

        {createMutation.error && (
          <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">
            {createMutation.error.message}
          </p>
        )}

        <div className="mt-6 flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={createMutation.isPending}
            className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {createMutation.isPending ? "جاري الإنشاء..." : "إنشاء العميل"}
          </button>
          <button
            onClick={onClose}
            className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── WorkspaceCard ─────────────────────────────────────────────────────────────

function WorkspaceCard({
  row,
  onRefresh,
}: {
  row: any;
  onRefresh: () => void;
}) {
  const [, setLocation] = useLocation();
  const { workspace, botSettings, zapiConfig } = row;
  const typeInfo = BUSINESS_TYPE_LABELS[workspace.business_type as BusinessType] ?? BUSINESS_TYPE_LABELS.other;

  const toggleMutation = trpc.admin.updateWorkspace.useMutation({
    onSuccess: onRefresh,
  });

  const isConfigured = !!(zapiConfig && botSettings?.system_prompt && !botSettings.system_prompt.startsWith("⚠️"));
  const hasPendingSetup = !zapiConfig || !botSettings;

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border bg-white transition-all duration-200 hover:shadow-lg ${
        workspace.is_active ? "border-gray-200" : "border-gray-100 opacity-60"
      }`}
    >
      {/* شريط الحالة العلوي */}
      <div
        className={`h-1 w-full ${
          !workspace.is_active
            ? "bg-gray-200"
            : isConfigured
            ? "bg-gradient-to-r from-green-400 to-emerald-500"
            : "bg-gradient-to-r from-yellow-400 to-orange-400"
        }`}
      />

      <div className="p-5">
        {/* الهيدر */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-11 w-11 items-center justify-center rounded-xl border text-2xl ${typeInfo.color}`}
            >
              {typeInfo.icon}
            </div>
            <div>
              <h3 className="font-bold text-gray-900">{workspace.name}</h3>
              <p className="text-xs text-gray-400 font-mono">{workspace.slug}</p>
            </div>
          </div>

          {/* تبديل التفعيل */}
          <button
            onClick={() =>
              toggleMutation.mutate({
                workspaceId: workspace.id,
                is_active: !workspace.is_active,
              })
            }
            title={workspace.is_active ? "تعطيل" : "تفعيل"}
            className={`relative h-6 w-11 rounded-full transition-colors ${
              workspace.is_active ? "bg-green-500" : "bg-gray-300"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                workspace.is_active ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>

        {/* الإحصائيات السريعة */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <StatusBadge
            icon="📱"
            label="Z-API"
            ok={!!zapiConfig}
            okText={zapiConfig?.instance_id?.slice(0, 12) + "…"}
            failText="غير مربوط"
          />
          <StatusBadge
            icon="🤖"
            label="البوت"
            ok={isConfigured}
            okText="مُعدَّ"
            failText={botSettings ? "يحتاج prompt" : "غير مُعدَّ"}
          />
        </div>

        {/* بريد المالك */}
        {workspace.owner_email && (
          <p className="mt-3 text-xs text-gray-400">
            📧 {workspace.owner_email}
          </p>
        )}

        {/* تنبيه الإعداد */}
        {hasPendingSetup && workspace.is_active && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-700">
            <span>⚠️</span>
            <span>يحتاج إعداد قبل التشغيل</span>
          </div>
        )}

        {/* أزرار الإجراءات */}
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => setLocation(`/admin/workspace/${workspace.id}/settings`)}
            className="flex-1 rounded-xl bg-gray-900 py-2 text-xs font-semibold text-white transition hover:bg-gray-800"
          >
            ⚙️ الإعدادات
          </button>
          <button
            onClick={() => setLocation(`/admin/workspace/${workspace.id}/conversations`)}
            className="flex-1 rounded-xl border border-gray-200 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            💬 المحادثات
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── StatusBadge ──────────────────────────────────────────────────────────────

function StatusBadge({
  icon,
  label,
  ok,
  okText,
  failText,
}: {
  icon: string;
  label: string;
  ok: boolean;
  okText: string;
  failText: string;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border p-2 text-xs ${
        ok
          ? "border-green-100 bg-green-50 text-green-700"
          : "border-red-100 bg-red-50 text-red-600"
      }`}
    >
      <span>{icon}</span>
      <div className="min-w-0">
        <p className="font-medium truncate">{ok ? okText : failText}</p>
      </div>
    </div>
  );
}

// ─── Stats Bar ─────────────────────────────────────────────────────────────────

function StatsBar({ workspaces }: { workspaces: any[] }) {
  const active = workspaces.filter((w) => w.workspace.is_active).length;
  const total = workspaces.length;
  const configured = workspaces.filter(
    (w) => w.zapiConfig && w.botSettings?.system_prompt && !w.botSettings.system_prompt.startsWith("⚠️")
  ).length;

  const counts = Object.entries(BUSINESS_TYPE_LABELS).map(([type, { label, icon }]) => ({
    type,
    label,
    icon,
    count: workspaces.filter((w) => w.workspace.business_type === type).length,
  }));

  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard label="إجمالي العملاء" value={total} icon="🏢" color="bg-blue-50 text-blue-700" />
      <StatCard label="نشط الآن" value={active} icon="✅" color="bg-green-50 text-green-700" />
      <StatCard label="مُعدَّ بالكامل" value={configured} icon="🤖" color="bg-purple-50 text-purple-700" />
      <StatCard
        label="يحتاج إعداد"
        value={total - configured}
        icon="⚠️"
        color="bg-amber-50 text-amber-700"
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: string;
  color: string;
}) {
  return (
    <div className={`rounded-2xl border p-4 ${color.replace("text-", "border-").replace("-700", "-100")} ${color.split(" ")[0]}`}>
      <p className="text-xs font-medium opacity-70">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-bold">{value}</span>
        <span className="text-lg">{icon}</span>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WorkspacesPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<BusinessType | "all">("all");

  const { data, isLoading, refetch } = trpc.admin.workspaces.useQuery();

  const filtered = (data ?? []).filter((row: any) => {
    const matchSearch =
      !search ||
      row.workspace.name.includes(search) ||
      row.workspace.slug.includes(search) ||
      row.workspace.owner_email?.includes(search);
    const matchType = filterType === "all" || row.workspace.business_type === filterType;
    return matchSearch && matchType;
  });

  return (
    <div className="min-h-screen bg-gray-50 p-6" dir="rtl">
      {/* الهيدر */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">إدارة العملاء</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {data?.length ?? 0} عميل مسجل في المنصة
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700"
        >
          <span>+</span> إضافة عميل
        </button>
      </div>

      {/* الإحصائيات */}
      {data && <StatsBar workspaces={data} />}

      {/* الفلاتر */}
      <div className="mb-4 flex flex-wrap gap-2">
        <input
          className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="🔍 ابحث بالاسم أو الـ slug..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex gap-1">
          <FilterButton label="الكل" active={filterType === "all"} onClick={() => setFilterType("all")} />
          {(Object.entries(BUSINESS_TYPE_LABELS) as [BusinessType, any][]).map(([type, { label, icon }]) => (
            <FilterButton
              key={type}
              label={`${icon} ${label}`}
              active={filterType === type}
              onClick={() => setFilterType(type)}
            />
          ))}
        </div>
      </div>

      {/* شبكة البطاقات */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <div className="text-center">
            <div className="mb-3 text-4xl animate-spin">⚙️</div>
            <p>جاري تحميل العملاء...</p>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-gray-200 py-20 text-center text-gray-400">
          <span className="text-5xl">🏢</span>
          <p className="font-medium">لا يوجد عملاء</p>
          <p className="text-sm">ابدأ بإضافة عميلك الأول</p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            إضافة عميل
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((row: any) => (
            <WorkspaceCard key={row.workspace.id} row={row} onRefresh={refetch} />
          ))}
        </div>
      )}

      {/* Modal الإنشاء */}
      {showCreate && (
        <CreateWorkspaceModal
          onClose={() => setShowCreate(false)}
          onSuccess={() => refetch()}
        />
      )}
    </div>
  );
}

// ─── FilterButton ─────────────────────────────────────────────────────────────

function FilterButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
        active
          ? "bg-gray-900 text-white shadow"
          : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
      }`}
    >
      {label}
    </button>
  );
}
