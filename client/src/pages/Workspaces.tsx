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
  CheckCircle2,
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">الأنظمة الآلية (Bots)</h1>
          <p className="text-base text-muted-foreground mt-1">
            إدارة وتكوين الأنظمة الآلية للعملاء بطريقة احترافية وفعالة.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} size="lg" className="gap-2 font-semibold shadow-sm">
          <Plus className="h-5 w-5" />
          تهيئة نظام جديد
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 bg-muted/20 p-4 rounded-xl border">
        <div className="relative flex-grow max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pr-10 h-10 w-full bg-background border-muted shadow-sm"
            placeholder="البحث باسم العميل أو المعرف..."
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
          <Bot className="h-12 w-12 opacity-20" />
          <div>
            <p className="font-medium">لا يوجد بوتات مسجلة</p>
            <p className="text-sm mt-1">ابدأ بإضافة البوت الأول الخاص بك</p>
          </div>
          <Button onClick={() => setShowCreate(true)} variant="outline">
            <Plus className="h-4 w-4 ml-1.5" />
            إضافة بوت
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
      className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all ${
        active
          ? "bg-primary text-primary-foreground shadow-md ring-1 ring-primary/20"
          : "bg-background border text-muted-foreground hover:text-foreground hover:bg-accent hover:border-accent-foreground/20"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}