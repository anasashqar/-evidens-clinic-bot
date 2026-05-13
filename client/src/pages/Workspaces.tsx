/**
 * Workspaces.tsx — إدارة العملاء (Super Admin)
 * ملاحظة: داخل DashboardLayout — لا min-h-screen هنا
 */

import { useState } from "react";
import { trpc } from "../lib/trpc";
import { useLocation } from "wouter";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Building2,
  ShoppingBag,
  UtensilsCrossed,
  Home,
  Briefcase,
  Plus,
  CheckCircle2,
  AlertCircle,
  Settings,
  MessageSquare,
  Search,
  Users,
  Bot,
  Activity,
  Loader2,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

type BusinessType = "clinic" | "store" | "restaurant" | "real_estate" | "other";

const BUSINESS_TYPES: Record<
  BusinessType,
  { label: string; Icon: React.ElementType; color: string; bg: string }
> = {
  clinic:      { label: "عيادة",   Icon: Building2,       color: "text-blue-600",   bg: "bg-blue-50" },
  store:       { label: "متجر",    Icon: ShoppingBag,     color: "text-purple-600", bg: "bg-purple-50" },
  restaurant:  { label: "مطعم",    Icon: UtensilsCrossed, color: "text-orange-600", bg: "bg-orange-50" },
  real_estate: { label: "عقارات",  Icon: Home,            color: "text-green-600",  bg: "bg-green-50" },
  other:       { label: "أخرى",    Icon: Briefcase,       color: "text-gray-600",   bg: "bg-gray-50" },
};

// ─── Modal: Create Workspace ───────────────────────────────────────────────────

function CreateWorkspaceModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
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
      setForm({ name: "", slug: "", business_type: "clinic", owner_email: "" });
    },
  });

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
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>إضافة عميل جديد</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* اسم البزنس */}
          <div className="space-y-1.5">
            <Label>
              اسم البزنس <span className="text-destructive">*</span>
            </Label>
            <Input
              placeholder="عيادة النور للجلدية"
              value={form.name}
              onChange={(e) => handleNameChange(e.target.value)}
              className={errors.name ? "border-destructive" : ""}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name}</p>
            )}
          </div>

          {/* Slug */}
          <div className="space-y-1.5">
            <Label>
              المعرف (Slug) <span className="text-destructive">*</span>
            </Label>
            <Input
              placeholder="al-noor-clinic"
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              className={`font-mono text-sm ${errors.slug ? "border-destructive" : ""}`}
              dir="ltr"
            />
            {errors.slug ? (
              <p className="text-xs text-destructive">{errors.slug}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                يُستخدم داخلياً — لا يمكن تغييره لاحقاً
              </p>
            )}
          </div>

          {/* نوع البزنس */}
          <div className="space-y-2">
            <Label>نوع البزنس</Label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.entries(BUSINESS_TYPES) as [BusinessType, any][]).map(
                ([type, { label, Icon }]) => (
                  <button
                    key={type}
                    onClick={() => setForm((f) => ({ ...f, business_type: type }))}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border-2 py-3 px-2 text-xs font-medium transition-all ${
                      form.business_type === type
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-muted-foreground/40"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    {label}
                  </button>
                )
              )}
            </div>
          </div>

          {/* البريد الإلكتروني */}
          <div className="space-y-1.5">
            <Label>
              بريد صاحب البزنس{" "}
              <span className="text-xs font-normal text-muted-foreground">(اختياري)</span>
            </Label>
            <Input
              type="email"
              placeholder="owner@example.com"
              value={form.owner_email}
              onChange={(e) => setForm((f) => ({ ...f, owner_email: e.target.value }))}
              dir="ltr"
            />
          </div>
        </div>

        {createMutation.error && (
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive mt-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {createMutation.error.message}
          </div>
        )}

        <div className="flex gap-2 mt-4">
          <Button
            onClick={handleSubmit}
            disabled={createMutation.isPending}
            className="flex-1"
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                جاري الإنشاء...
              </>
            ) : (
              "إنشاء العميل"
            )}
          </Button>
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Workspace Card ────────────────────────────────────────────────────────────

function WorkspaceCard({ row, onRefresh }: { row: any; onRefresh: () => void }) {
  const [, setLocation] = useLocation();
  const { workspace, botSettings, zapiConfig } = row;
  const typeInfo = BUSINESS_TYPES[workspace.business_type as BusinessType] ?? BUSINESS_TYPES.other;
  const { Icon } = typeInfo;

  const toggleMutation = trpc.admin.updateWorkspace.useMutation({
    onSuccess: onRefresh,
  });

  const isConfigured = !!(
    zapiConfig &&
    botSettings?.system_prompt &&
    !botSettings.system_prompt.startsWith("⚠️")
  );
  const hasPendingSetup = !zapiConfig || !botSettings;

  return (
    <Card
      className={`relative overflow-hidden transition-all duration-200 hover:shadow-md ${
        !workspace.is_active ? "opacity-60" : ""
      }`}
    >
      {/* Status bar */}
      <div
        className={`h-0.5 w-full ${
          !workspace.is_active
            ? "bg-muted"
            : isConfigured
            ? "bg-gradient-to-r from-green-400 to-emerald-500"
            : "bg-gradient-to-r from-amber-400 to-orange-400"
        }`}
      />

      <CardHeader className="pb-0">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-xl ${typeInfo.bg} ${typeInfo.color} shrink-0`}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-sm truncate">{workspace.name}</h3>
              <p className="text-xs text-muted-foreground font-mono truncate">
                {workspace.slug}
              </p>
            </div>
          </div>

          {/* Toggle */}
          <button
            onClick={() =>
              toggleMutation.mutate({
                workspaceId: workspace.id,
                is_active: !workspace.is_active,
              })
            }
            title={workspace.is_active ? "تعطيل" : "تفعيل"}
            className={`relative h-6 w-11 rounded-full transition-colors shrink-0 ${
              workspace.is_active ? "bg-green-500" : "bg-muted-foreground/30"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                workspace.is_active ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-3">
        {/* Status badges */}
        <div className="grid grid-cols-2 gap-2">
          <div
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${
              zapiConfig
                ? "border-green-200 bg-green-50 text-green-700"
                : "border-red-200 bg-red-50 text-red-600"
            }`}
          >
            {zapiConfig ? (
              <CheckCircle2 className="h-3 w-3 shrink-0" />
            ) : (
              <AlertCircle className="h-3 w-3 shrink-0" />
            )}
            <span className="truncate font-medium">
              {zapiConfig ? zapiConfig.instance_id?.slice(0, 10) + "…" : "غير مربوط"}
            </span>
          </div>
          <div
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${
              isConfigured
                ? "border-green-200 bg-green-50 text-green-700"
                : "border-amber-200 bg-amber-50 text-amber-700"
            }`}
          >
            {isConfigured ? (
              <CheckCircle2 className="h-3 w-3 shrink-0" />
            ) : (
              <AlertCircle className="h-3 w-3 shrink-0" />
            )}
            <span className="font-medium">
              {isConfigured ? "البوت مُعدَّ" : botSettings ? "يحتاج prompt" : "غير مُعدَّ"}
            </span>
          </div>
        </div>

        {/* Owner email */}
        {workspace.owner_email && (
          <p className="text-xs text-muted-foreground truncate">{workspace.owner_email}</p>
        )}

        {/* Warning */}
        {hasPendingSetup && workspace.is_active && (
          <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-2 text-xs text-amber-700">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            يحتاج إعداد قبل التشغيل
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1 h-8 text-xs"
            onClick={() => setLocation(`/workspace/${workspace.id}/settings`)}
          >
            <Settings className="h-3.5 w-3.5 ml-1.5" />
            الإعدادات
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-8 text-xs"
            onClick={() => setLocation("/dashboard")}
          >
            <MessageSquare className="h-3.5 w-3.5 ml-1.5" />
            المحادثات
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Stats Bar ─────────────────────────────────────────────────────────────────

function StatsBar({ workspaces }: { workspaces: any[] }) {
  const total = workspaces.length;
  const active = workspaces.filter((w) => w.workspace.is_active).length;
  const configured = workspaces.filter(
    (w) =>
      w.zapiConfig &&
      w.botSettings?.system_prompt &&
      !w.botSettings.system_prompt.startsWith("⚠️")
  ).length;
  const needsSetup = total - configured;

  const stats = [
    { label: "إجمالي العملاء", value: total, Icon: Users, color: "text-blue-600 bg-blue-50" },
    { label: "نشط الآن",       value: active, Icon: Activity, color: "text-green-600 bg-green-50" },
    { label: "مُعدَّ بالكامل",  value: configured, Icon: Bot,  color: "text-purple-600 bg-purple-50" },
    { label: "يحتاج إعداد",    value: needsSetup, Icon: AlertCircle, color: "text-amber-600 bg-amber-50" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map(({ label, value, Icon, color }) => {
        const [textColor, bgColor] = color.split(" ");
        return (
          <Card key={label}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{label}</p>
                <div className={`h-7 w-7 rounded-lg ${bgColor} flex items-center justify-center`}>
                  <Icon className={`h-3.5 w-3.5 ${textColor}`} />
                </div>
              </div>
              <p className={`text-2xl font-bold mt-2 ${textColor}`}>{value}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

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
    <div className="space-y-6" dir="rtl">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">إدارة العملاء</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {data?.length ?? 0} عميل مسجل في المنصة
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          إضافة عميل
        </Button>
      </div>

      {/* Stats */}
      {data && <StatsBar workspaces={data} />}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pr-9 w-56"
            placeholder="ابحث بالاسم أو الـ slug..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex gap-1 flex-wrap">
          <FilterButton
            label="الكل"
            active={filterType === "all"}
            onClick={() => setFilterType("all")}
          />
          {(Object.entries(BUSINESS_TYPES) as [BusinessType, any][]).map(
            ([type, { label, Icon }]) => (
              <FilterButton
                key={type}
                label={label}
                icon={<Icon className="h-3.5 w-3.5" />}
                active={filterType === type}
                onClick={() => setFilterType(type)}
              />
            )
          )}
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin" />
            جاري تحميل العملاء...
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed py-20 text-center text-muted-foreground">
          <Building2 className="h-12 w-12 opacity-20" />
          <div>
            <p className="font-medium">لا يوجد عملاء</p>
            <p className="text-sm mt-1">ابدأ بإضافة عميلك الأول</p>
          </div>
          <Button onClick={() => setShowCreate(true)} variant="outline">
            <Plus className="h-4 w-4 ml-1.5" />
            إضافة عميل
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((row: any) => (
            <WorkspaceCard key={row.workspace.id} row={row} onRefresh={refetch} />
          ))}
        </div>
      )}

      <CreateWorkspaceModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSuccess={() => refetch()}
      />
    </div>
  );
}

// ─── FilterButton ──────────────────────────────────────────────────────────────

function FilterButton({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon?: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
        active
          ? "bg-foreground text-background shadow-sm"
          : "bg-background border border-border text-muted-foreground hover:text-foreground hover:bg-muted"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}