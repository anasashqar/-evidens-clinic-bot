/**
 * Dashboard.tsx — لوحة التحكم الرئيسية
 * ملاحظة: هذه الصفحة داخل DashboardLayout — لا header منفصل هنا
 */

import { useState, useEffect, useRef } from "react";
import { trpc } from "../lib/trpc";
import { useLocation } from "wouter";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

// ─── Status helpers ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  active:      { label: "نشطة",     variant: "default" },
  handoff:     { label: "تحويل",    variant: "outline" },
  closed:      { label: "مغلقة",    variant: "secondary" },
  pending:     { label: "بانتظار",  variant: "outline" },
  in_progress: { label: "جارية",    variant: "default" },
  completed:   { label: "مكتملة",   variant: "secondary" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_CONFIG[status] ?? { label: status, variant: "secondary" as const };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

// ─── Metric Card ───────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  icon: Icon,
  description,
  loading,
}: {
  label: string;
  value: number | undefined;
  icon: React.ElementType;
  description?: string;
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="h-4 w-4 text-primary" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold tracking-tight">
          {loading ? (
            <span className="text-muted-foreground/40 text-xl">—</span>
          ) : (
            (value ?? 0)
          )}
        </div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Conversation Dialog ───────────────────────────────────────────────────────

function ConversationDialog({
  conversationId,
  onClose,
}: {
  conversationId: string;
  onClose: () => void;
}) {
  const { data: messages, isLoading } = trpc.admin.conversationMessages.useQuery({
    conversationId,
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg p-0 overflow-hidden" dir="rtl">
        <DialogHeader className="px-5 py-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            رسائل المحادثة
          </DialogTitle>
        </DialogHeader>

        <div className="h-96 overflow-y-auto bg-[#efeae2] p-4 space-y-2">
          {isLoading && (
            <p className="text-center text-sm text-muted-foreground py-10">
              جاري التحميل...
            </p>
          )}
          {messages?.map((msg: any) => (
            <div
              key={msg.id}
              className={`flex ${
                msg.direction === "inbound" ? "justify-end" : "justify-start"
              }`}
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
                  {new Date(msg.created_at).toLocaleTimeString("ar-SA", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          ))}
          {messages?.length === 0 && !isLoading && (
            <p className="text-center text-sm text-muted-foreground py-10">
              لا توجد رسائل
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

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
      const name = newest?.patient?.name || newest?.patient?.phone || "مريض";
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

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6" dir="rtl">

      {/* 🔔 Notification Banner */}
      {notification && (
        <div className="fixed top-4 right-1/2 translate-x-1/2 z-50 animate-in slide-in-from-top-2">
          <div className="flex items-center gap-3 rounded-xl bg-orange-500 px-5 py-3 text-white shadow-2xl">
            <Bell className="h-4 w-4 shrink-0" />
            <span className="text-sm font-medium">{notification}</span>
            <button
              onClick={() => setNotification(null)}
              className="mr-2 rounded-md p-0.5 hover:bg-white/20 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

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
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          label="إجمالي المحادثات"
          value={metrics?.totalConversations}
          icon={MessageSquare}
          loading={metricsLoading}
        />
        <MetricCard
          label="محادثات نشطة"
          value={metrics?.activeConversations}
          icon={Activity}
          loading={metricsLoading}
        />
        <MetricCard
          label="Handoffs بانتظار"
          value={metrics?.pendingHandoffs}
          icon={Clock}
          loading={metricsLoading}
        />
        <MetricCard
          label="إجمالي المرضى"
          value={metrics?.totalPatients}
          icon={Users}
          loading={metricsLoading}
        />
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

        {/* Handoffs Table */}
        {activeTab === "handoffs" && (
          <Card className="mt-4 border-0 shadow-none">
            <CardHeader className="px-0 pb-3">
              <CardTitle className="text-base">Handoffs الأخيرة</CardTitle>
              <CardDescription>
                التحويلات التي تحتاج متابعة بشرية
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <div className="rounded-xl border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-right">المريض</TableHead>
                      <TableHead className="text-right">الهاتف</TableHead>
                      <TableHead className="text-right">السبب</TableHead>
                      <TableHead className="text-right hidden md:table-cell">الملخص</TableHead>
                      <TableHead className="text-right">الحالة</TableHead>
                      <TableHead className="text-right hidden sm:table-cell">التاريخ</TableHead>
                      <TableHead className="text-right">إجراء</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {handoffs?.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          className="py-16 text-center text-muted-foreground"
                        >
                          <div className="flex flex-col items-center gap-2">
                            <CheckCircle2 className="h-8 w-8 opacity-30" />
                            <span>لا توجد handoffs بعد</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                    {handoffs?.map((row: any) => {
                      const h = row.handoff;
                      const p = row.patient;
                      return (
                        <TableRow key={h.id}>
                          <TableCell className="font-medium">{p?.name || "—"}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {p?.phone || "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {h.reason || "—"}
                          </TableCell>
                          <TableCell className="hidden md:table-cell max-w-[200px]">
                            <p className="truncate text-xs text-muted-foreground">
                              {h.summary || "—"}
                            </p>
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={h.status} />
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                            {new Date(h.created_at).toLocaleDateString("ar-SA")}
                          </TableCell>
                          <TableCell>
                            {h.status === "pending" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs text-green-700 border-green-200 hover:bg-green-50"
                                onClick={() =>
                                  updateHandoffMutation.mutate({
                                    handoffId: h.id,
                                    status: "completed",
                                  })
                                }
                                disabled={updateHandoffMutation.isPending}
                              >
                                <CheckCircle2 className="h-3 w-3 ml-1" />
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
        )}

        {/* Conversations Table */}
        {activeTab === "conversations" && (
          <Card className="mt-4 border-0 shadow-none">
            <CardHeader className="px-0 pb-3">
              <CardTitle className="text-base">المحادثات الأخيرة</CardTitle>
              <CardDescription>سجل محادثات المرضى مع البوت</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <div className="rounded-xl border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-right">المريض</TableHead>
                      <TableHead className="text-right">الهاتف</TableHead>
                      <TableHead className="text-right">الحالة</TableHead>
                      <TableHead className="text-right hidden sm:table-cell">الخطوة</TableHead>
                      <TableHead className="text-right hidden md:table-cell">البداية</TableHead>
                      <TableHead className="text-right">رسائل</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {conversations?.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="py-16 text-center text-muted-foreground"
                        >
                          <div className="flex flex-col items-center gap-2">
                            <MessageSquare className="h-8 w-8 opacity-30" />
                            <span>لا توجد محادثات بعد</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                    {conversations?.map((row: any) => {
                      const c = row.conversation;
                      const p = row.patient;
                      return (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">{p?.name || "—"}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {p?.phone || "—"}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={c.status} />
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                            {c.current_step || "—"}
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                            {new Date(c.started_at).toLocaleDateString("ar-SA")}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs gap-1"
                              onClick={() => setSelectedConvId(c.id)}
                            >
                              عرض
                              <ChevronRight className="h-3 w-3" />
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
        )}
      </div>

      {/* Conversation Dialog */}
      {selectedConvId && (
        <ConversationDialog
          conversationId={selectedConvId}
          onClose={() => setSelectedConvId(null)}
        />
      )}
    </div>
  );
}