/**
 * Workspaces.tsx — إدارة العملاء (Super Admin)
 * ملاحظة: داخل DashboardLayout — لا min-h-screen هنا
 */

import { useState } from "react";
import { trpc } from "../lib/trpc";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Building2,
  ShoppingBag,
  UtensilsCrossed,
  Home,
  Briefcase,
  Plus,
  AlertCircle,
  Search,
  Users,
  Bot,
  Activity,
  Loader2,
} from "lucide-react";
import { CreateWorkspaceModal } from "../components/workspaces/CreateWorkspaceModal";
import { WorkspaceCard } from "../components/workspaces/WorkspaceCard";
import { PageTransition } from "../components/PageTransition";
import { PageSkeleton } from "../components/PageSkeleton";

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
      {stats.map(({ label, value, Icon, color }, idx) => {
        const [textColor, bgColor] = color.split(" ");
        return (
          <motion.div
            key={label}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: idx * 0.05 }}
          >
            <Card className="transition-all hover:shadow-sm">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">{label}</p>
                  <div className={`h-8 w-8 rounded-xl ${bgColor} flex items-center justify-center`}>
                    <Icon className={`h-4 w-4 ${textColor}`} />
                  </div>
                </div>
                <p className={`text-2xl font-bold mt-2 tracking-tight ${textColor}`}>{value}</p>
              </CardContent>
            </Card>
          </motion.div>
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
    <PageTransition className="space-y-6" dir="rtl">
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
        <PageSkeleton />
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
        <motion.div 
          layout
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          <AnimatePresence>
            {filtered.map((row: any, idx: number) => (
              <motion.div
                key={row.workspace.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2, delay: idx * 0.03 }}
              >
                <WorkspaceCard 
                  row={row} 
                  onRefresh={refetch} 
                  typeInfo={BUSINESS_TYPES[row.workspace.business_type as BusinessType] ?? BUSINESS_TYPES.other}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      <CreateWorkspaceModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSuccess={() => refetch()}
        businessTypes={BUSINESS_TYPES}
      />
    </PageTransition>
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