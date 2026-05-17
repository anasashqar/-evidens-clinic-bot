/**
 * Dashboard.tsx — لوحة التحكم الرئيسية
 * ملاحظة: هذه الصفحة داخل DashboardLayout — لا header منفصل هنا
 */

import { useState, useEffect, useRef } from "react";
import { trpc } from "../lib/trpc";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  MessageSquare,
  Users,
  Clock,
  Activity,
  Settings,
  CheckCircle2,
  ChevronRight,
  Bell,
  X,
} from "lucide-react";

import { StatusBadge } from "../components/dashboard/StatusBadge";
import { MetricCard } from "../components/dashboard/MetricCard";
import { ConversationDialog } from "../components/dashboard/ConversationDialog";
import { PageTransition } from "../components/PageTransition";
import { PageSkeleton } from "../components/PageSkeleton";

export const STEP_LABELS: Record<string, string> = {
  greeting:           "ترحيب",
  collecting_name:    "جمع الاسم",
  collecting_concern: "سبب الزيارة",
  collecting_time:    "الوقت المفضل",
  confirming:         "تأكيد",
  handoff:            "تحويل",
  initial:            "بداية",
};

// ─── Main Dashboard ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [, navigate] = useLocation();
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"handoffs" | "conversations">("handoffs");
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const prevPendingCount = useRef<number>(0);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const { data: workspaces, isLoading: wsLoading } = trpc.admin.workspaces.useQuery(undefined);

  useEffect(() => {
    if (workspaces?.length && !selectedWorkspaceId) {
      setSelectedWorkspaceId(workspaces[0].workspace.id);
    }
  }, [workspaces]);

  const workspaceId = selectedWorkspaceId || (workspaces?.[0]?.workspace?.id ?? "");

  const { data: metrics, isLoading: metricsLoading } = trpc.admin.workspaceMetrics.useQuery(
    { workspaceId },
    { enabled: !!workspaceId }
  );

  const { data: handoffs, refetch: refetchHandoffs } = trpc.admin.workspaceHandoffs.useQuery(
    { workspaceId },
    { enabled: !!workspaceId, refetchInterval: 5000 }
  );

  const { data: conversations } = trpc.admin.workspaceConversations.useQuery(
    { workspaceId },
    { enabled: !!workspaceId, refetchInterval: 5000 }
  );

  const updateHandoffMutation = trpc.admin.updateHandoff.useMutation({
    onSuccess: () => refetchHandoffs(),
  });

  // ── Realtime notification ────────────────────────────────────────────────
  useEffect(() => {
    const pending = handoffs?.filter((r: any) => r.handoff.status === "pending").length ?? 0;

    if (pending > prevPendingCount.current && prevPendingCount.current !== -1) {
      const newest = handoffs?.find((r: any) => r.handoff.status === "pending");
      const name = newest?.patient?.name || newest?.patient?.phone || "عميل";
      setNotification(`طلب جديد من ${name} — يحتاج متابعة`);

      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 520;
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.4);
      } catch {}

      setTimeout(() => setNotification(null), 6000);
    }

    prevPendingCount.current = pending;
  }, [handoffs]);

  const currentWs = workspaces?.find((w: any) => w.workspace.id === workspaceId);

  if (wsLoading || (workspaces?.length && metricsLoading && !metrics)) {
    return <PageSkeleton />;
  }

  return (
    <PageTransition className="space-y-6" dir="rtl">

      {/* 🔔 Notification Banner */}
      <AnimatePresence>
        {notification && (
          <motion.div 
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-6 right-1/2 translate-x-1/2 z-50"
          >
            <div className="flex items-center gap-3 rounded-2xl bg-orange-500/95 backdrop-blur-md px-6 py-3.5 text-white shadow-2xl ring-1 ring-white/20">
              <div className="bg-white/20 rounded-full p-1.5 animate-pulse">
                <Bell className="h-4 w-4 shrink-0" />
              </div>
            <span className="text-sm font-medium">{notification}</span>
            <button
              onClick={() => setNotification(null)}
              className="mr-2 rounded-md p-0.5 hover:bg-white/20 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">لوحة التحكم</h1>
          {currentWs && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {currentWs.workspace.name}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Workspace Selector */}
          {!wsLoading && workspaces && workspaces.length > 1 && (
            <Select value={workspaceId} onValueChange={setSelectedWorkspaceId}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="اختر العميل" />
              </SelectTrigger>
              <SelectContent>
                {workspaces.map((w: any) => (
                  <SelectItem key={w.workspace.id} value={w.workspace.id}>
                    {w.workspace.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {workspaceId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/workspace/${workspaceId}/settings`)}
            >
              <Settings className="h-4 w-4 ml-1.5" />
              الإعدادات
            </Button>
          )}
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5 xl:grid-cols-5">
        {[
          { label: "إجمالي المحادثات", value: metrics?.totalConversations, icon: MessageSquare },
          { label: "محادثات اليوم", value: metrics?.todayConversations, icon: Activity, desc: "بدأت اليوم" },
          { label: "Handoffs بانتظار", value: metrics?.pendingHandoffs, icon: Clock },
          { label: "Handoffs اليوم", value: metrics?.todayHandoffs, icon: CheckCircle2, desc: "طلبات اليوم" },
          { label: "إجمالي العملاء", value: metrics?.totalPatients, icon: Users },
        ].map((item, idx) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
          >
            <MetricCard
              label={item.label}
              value={item.value}
              icon={item.icon}
              description={item.desc}
              loading={metricsLoading}
            />
          </motion.div>
        ))}
      </div>

      {/* Tabs */}
      <div>
        {/* Custom Tab Bar */}
        <div className="flex gap-1 border-b">
          {(["handoffs", "conversations"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all -mb-px ${
                activeTab === tab
                  ? "border-b-2 border-foreground text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "handoffs" ? (
                <>
                  <Clock className="h-4 w-4" />
                  Handoffs
                  {(metrics?.pendingHandoffs ?? 0) > 0 && (
                    <Badge className="h-5 px-1.5 text-[10px]">
                      {metrics?.pendingHandoffs}
                    </Badge>
                  )}
                </>
              ) : (
                <>
                  <MessageSquare className="h-4 w-4" />
                  المحادثات
                </>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content with Animations */}
        <AnimatePresence mode="wait">
          {activeTab === "handoffs" ? (
            <motion.div
              key="handoffs-tab"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <Card className="mt-4 border-0 shadow-sm ring-1 ring-border">
                <CardHeader className="px-5 pb-3">
                  <CardTitle className="text-base font-semibold">Handoffs الأخيرة</CardTitle>
                  <CardDescription>التحويلات التي تحتاج متابعة بشرية عاجلة</CardDescription>
                </CardHeader>
                <CardContent className="px-0">
                  <div className="overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30 border-y hover:bg-muted/30">
                          <TableHead className="text-right pr-5">العميل</TableHead>
                          <TableHead className="text-right">الهاتف</TableHead>
                          <TableHead className="text-right">السبب</TableHead>
                          <TableHead className="text-right hidden md:table-cell">الملخص</TableHead>
                          <TableHead className="text-right">الحالة</TableHead>
                          <TableHead className="text-right hidden sm:table-cell">التاريخ</TableHead>
                          <TableHead className="text-right pl-5">إجراء</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {handoffs?.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={7} className="py-20 text-center text-muted-foreground">
                              <div className="flex flex-col items-center gap-3 opacity-60">
                                <CheckCircle2 className="h-10 w-10 text-primary" />
                                <span className="font-medium">لا توجد طلبات تحويل حالياً</span>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                        {handoffs?.map((row: any) => {
                          const h = row.handoff;
                          const p = row.patient;
                          return (
                            <TableRow key={h.id} className="group hover:bg-muted/20 transition-colors">
                              <TableCell className="font-medium pr-5">{p?.name || "—"}</TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground" dir="ltr">
                                {p?.phone || "—"}
                              </TableCell>
                              <TableCell className="text-muted-foreground text-sm">{h.reason || "—"}</TableCell>
                              <TableCell className="hidden md:table-cell max-w-[200px]">
                                <p className="truncate text-xs text-muted-foreground" title={h.summary}>
                                  {h.summary || "—"}
                                </p>
                              </TableCell>
                              <TableCell>
                                <StatusBadge status={h.status} />
                              </TableCell>
                              <TableCell className="hidden sm:table-cell text-xs text-muted-foreground font-mono">
                                {new Date(h.created_at).toLocaleDateString("ar-SA")}
                              </TableCell>
                              <TableCell className="pl-5">
                                {h.status === "pending" && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 text-xs font-medium text-green-700 border-green-200 hover:bg-green-50 hover:border-green-300 dark:text-green-400 dark:border-green-900/50 dark:hover:bg-green-900/20"
                                    onClick={() => updateHandoffMutation.mutate({ handoffId: h.id, status: "completed" })}
                                    disabled={updateHandoffMutation.isPending}
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5 ml-1.5" />
                                    إتمام
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ) : (
            <motion.div
              key="conversations-tab"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <Card className="mt-4 border-0 shadow-sm ring-1 ring-border">
                <CardHeader className="px-5 pb-3">
                  <CardTitle className="text-base font-semibold">المحادثات الأخيرة</CardTitle>
                  <CardDescription>سجل تفاعل العملاء مع البوت الآلي</CardDescription>
                </CardHeader>
                <CardContent className="px-0">
                  <div className="overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30 border-y hover:bg-muted/30">
                          <TableHead className="text-right pr-5">العميل</TableHead>
                          <TableHead className="text-right">الهاتف</TableHead>
                          <TableHead className="text-right">الحالة</TableHead>
                          <TableHead className="text-right hidden sm:table-cell">الخطوة الحالية</TableHead>
                          <TableHead className="text-right hidden md:table-cell">تاريخ البداية</TableHead>
                          <TableHead className="text-right pl-5">إجراء</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {conversations?.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={6} className="py-20 text-center text-muted-foreground">
                              <div className="flex flex-col items-center gap-3 opacity-60">
                                <MessageSquare className="h-10 w-10 text-primary" />
                                <span className="font-medium">لا توجد محادثات بعد</span>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                        {conversations?.map((row: any) => {
                          const c = row.conversation;
                          const p = row.patient;
                          return (
                            <TableRow key={c.id} className="group hover:bg-muted/20 transition-colors">
                              <TableCell className="font-medium pr-5">{p?.name || "—"}</TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground" dir="ltr">
                                {p?.phone || "—"}
                              </TableCell>
                              <TableCell>
                                <StatusBadge status={c.status} />
                              </TableCell>
                              <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                                {STEP_LABELS[c.current_step] ?? c.current_step ?? "—"}
                              </TableCell>
                              <TableCell className="hidden md:table-cell text-xs text-muted-foreground font-mono">
                                {new Date(c.started_at).toLocaleDateString("ar-SA")}
                              </TableCell>
                              <TableCell className="pl-5">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 text-xs font-medium gap-1 text-primary hover:bg-primary/5"
                                  onClick={() => setSelectedConvId(c.id)}
                                >
                                  عرض
                                  <ChevronRight className="h-3.5 w-3.5" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Conversation Dialog */}
      {selectedConvId && (
        <ConversationDialog
          conversationId={selectedConvId}
          onClose={() => setSelectedConvId(null)}
        />
      )}
    </PageTransition>
  );
}