/**
 * ═══════════════════════════════════════════════════════════════════
 *  Dashboard.tsx — لوحة تحكم SaaS متعددة العملاء
 *
 *  - اختيار workspace من القائمة العلوية
 *  - إحصائيات حية لكل workspace
 *  - جداول Handoffs + المحادثات مع بنية البيانات الصحيحة
 * ═══════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useRef } from "react";
import { trpc } from "../lib/trpc";
import { useLocation } from "wouter";

// ─── Status helpers ────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  active:      { label: "نشطة",      cls: "bg-green-100 text-green-700" },
  handoff:     { label: "تحويل",     cls: "bg-yellow-100 text-yellow-700" },
  closed:      { label: "مغلقة",     cls: "bg-gray-100 text-gray-500" },
  pending:     { label: "بانتظار",   cls: "bg-orange-100 text-orange-700" },
  in_progress: { label: "جارية",     cls: "bg-blue-100 text-blue-700" },
  completed:   { label: "مكتملة",    cls: "bg-green-100 text-green-700" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? { label: status, cls: "bg-gray-100 text-gray-600" };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}

// ─── Metric Card ───────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  icon,
  color,
  loading,
}: {
  label: string;
  value: number | undefined;
  icon: string;
  color: string;
  loading: boolean;
}) {
  return (
    <div className={`rounded-2xl border p-5 ${color}`}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium opacity-75">{label}</p>
        <span className="text-2xl">{icon}</span>
      </div>
      <p className="mt-3 text-3xl font-bold">
        {loading ? <span className="text-lg opacity-50">...</span> : (value ?? 0)}
      </p>
    </div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" dir="rtl">
      <div className="flex w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl" style={{ maxHeight: "80vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h3 className="font-bold text-gray-900">💬 رسائل المحادثة</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100"
          >
            ✕
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto bg-[#efeae2] p-4 space-y-2">
          {isLoading && (
            <p className="text-center text-sm text-gray-400 py-10">جاري التحميل...</p>
          )}
          {messages?.map((msg: any) => (
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
                  {new Date(msg.created_at).toLocaleTimeString("ar-SA", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          ))}
          {messages?.length === 0 && !isLoading && (
            <p className="text-center text-sm text-gray-400 py-10">لا توجد رسائل</p>
          )}
        </div>
      </div>
    </div>
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

  // ── Realtime notification عند وصول handoff جديد ──────────────────────────
  useEffect(() => {
    const pending = handoffs?.filter((r: any) => r.handoff.status === "pending").length ?? 0;

    if (pending > prevPendingCount.current && prevPendingCount.current !== -1) {
      const newest = handoffs?.find((r: any) => r.handoff.status === "pending");
      const name = newest?.patient?.name || newest?.patient?.phone || "مريض";
      setNotification(`🔔 طلب جديد من ${name} — يحتاج متابعة`);

      // صوت تنبيه
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

      // إخفاء بعد 6 ثوانٍ
      setTimeout(() => setNotification(null), 6000);
    }

    prevPendingCount.current = pending;
  }, [handoffs]);

  // ── Current workspace info ─────────────────────────────────────────────────

  const currentWs = workspaces?.find((w: any) => w.workspace.id === workspaceId);
  const wsName = currentWs?.workspace?.name ?? "...";

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">

      {/* 🔔 Notification Banner */}
      {notification && (
        <div className="fixed top-4 left-1/2 z-50 -translate-x-1/2 animate-bounce">
          <div className="flex items-center gap-3 rounded-2xl bg-orange-500 px-5 py-3 text-white shadow-xl">
            <span className="text-lg">🔔</span>
            <span className="text-sm font-semibold">{notification}</span>
            <button
              onClick={() => setNotification(null)}
              className="mr-2 text-white/70 hover:text-white"
            >✕</button>
          </div>
        </div>
      )}
      {/* Top bar */}
      <header className="border-b bg-white px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-lg font-bold text-gray-900">🤖 EviDenS Bot</h1>
              <p className="text-xs text-gray-400">لوحة التحكم</p>
            </div>

            {/* Workspace Selector */}
            {!wsLoading && workspaces && workspaces.length > 0 && (
              <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-1.5">
                <span className="text-xs text-gray-500">العميل:</span>
                <select
                  className="bg-transparent text-sm font-semibold text-gray-800 focus:outline-none"
                  value={workspaceId}
                  onChange={(e) => setSelectedWorkspaceId(e.target.value)}
                >
                  {workspaces.map((w: any) => (
                    <option key={w.workspace.id} value={w.workspace.id}>
                      {w.workspace.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {workspaceId && (
              <button
                onClick={() => navigate(`/workspace/${workspaceId}/settings`)}
                className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                ⚙️ الإعدادات
              </button>
            )}
            <button
              onClick={() => navigate("/workspaces")}
              className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              🏢 العملاء
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-6 space-y-6">

        {/* Workspace Name */}
        <div>
          <h2 className="text-xl font-bold text-gray-900">{wsName}</h2>
          <p className="text-sm text-gray-500">
            slug: <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">{currentWs?.workspace?.slug}</code>
          </p>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricCard
            label="إجمالي المحادثات"
            value={metrics?.totalConversations}
            icon="💬"
            color="bg-blue-50 border-blue-100 text-blue-900"
            loading={metricsLoading}
          />
          <MetricCard
            label="محادثات نشطة"
            value={metrics?.activeConversations}
            icon="🟢"
            color="bg-green-50 border-green-100 text-green-900"
            loading={metricsLoading}
          />
          <MetricCard
            label="Handoffs بانتظار"
            value={metrics?.pendingHandoffs}
            icon="⏳"
            color="bg-orange-50 border-orange-100 text-orange-900"
            loading={metricsLoading}
          />
          <MetricCard
            label="إجمالي المرضى"
            value={metrics?.totalPatients}
            icon="👥"
            color="bg-purple-50 border-purple-100 text-purple-900"
            loading={metricsLoading}
          />
        </div>

        {/* Tabs */}
        <div>
          <div className="flex gap-1 border-b border-gray-200">
            {(["handoffs", "conversations"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-3 text-sm font-medium transition-all ${
                  activeTab === tab
                    ? "border-b-2 border-gray-900 text-gray-900"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab === "handoffs" ? "🔄 Handoffs" : "💬 المحادثات"}
                {tab === "handoffs" && metrics?.pendingHandoffs ? (
                  <span className="mr-2 rounded-full bg-orange-500 px-1.5 py-0.5 text-xs text-white">
                    {metrics.pendingHandoffs}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          {/* Handoffs Table */}
          {activeTab === "handoffs" && (
            <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200 bg-white">
              <div className="border-b px-5 py-4">
                <h3 className="font-semibold text-gray-900">Handoffs الأخيرة</h3>
                <p className="text-xs text-gray-400">التحويلات التي تحتاج متابعة بشرية</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-gray-50 text-xs text-gray-500">
                    <tr>
                      <th className="px-5 py-3 text-right font-medium">المريض</th>
                      <th className="px-5 py-3 text-right font-medium">الهاتف</th>
                      <th className="px-5 py-3 text-right font-medium">السبب</th>
                      <th className="px-5 py-3 text-right font-medium">الملخص</th>
                      <th className="px-5 py-3 text-right font-medium">الحالة</th>
                      <th className="px-5 py-3 text-right font-medium">التاريخ</th>
                      <th className="px-5 py-3 text-right font-medium">إجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {handoffs?.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-gray-400">
                          لا توجد handoffs بعد
                        </td>
                      </tr>
                    )}
                    {handoffs?.map((row: any) => {
                      // البنية الصحيحة: { handoff, patient, conversation }
                      const h = row.handoff;
                      const p = row.patient;
                      return (
                        <tr key={h.id} className="hover:bg-gray-50">
                          <td className="px-5 py-3 font-medium text-gray-900">
                            {p?.name || "—"}
                          </td>
                          <td className="px-5 py-3 font-mono text-gray-600 text-xs">
                            {p?.phone || "—"}
                          </td>
                          <td className="px-5 py-3 text-gray-600">
                            {h.reason || "—"}
                          </td>
                          <td className="max-w-xs px-5 py-3 text-gray-500">
                            <p className="truncate text-xs">{h.summary || "—"}</p>
                          </td>
                          <td className="px-5 py-3">
                            <StatusBadge status={h.status} />
                          </td>
                          <td className="px-5 py-3 text-xs text-gray-400">
                            {new Date(h.created_at).toLocaleDateString("ar-SA")}
                          </td>
                          <td className="px-5 py-3">
                            {h.status === "pending" && (
                              <button
                                onClick={() =>
                                  updateHandoffMutation.mutate({
                                    handoffId: h.id,
                                    status: "completed",
                                  })
                                }
                                disabled={updateHandoffMutation.isPending}
                                className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                              >
                                ✓ إتمام
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Conversations Table */}
          {activeTab === "conversations" && (
            <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200 bg-white">
              <div className="border-b px-5 py-4">
                <h3 className="font-semibold text-gray-900">المحادثات الأخيرة</h3>
                <p className="text-xs text-gray-400">سجل محادثات المرضى مع البوت</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-gray-50 text-xs text-gray-500">
                    <tr>
                      <th className="px-5 py-3 text-right font-medium">المريض</th>
                      <th className="px-5 py-3 text-right font-medium">الهاتف</th>
                      <th className="px-5 py-3 text-right font-medium">الحالة</th>
                      <th className="px-5 py-3 text-right font-medium">الخطوة</th>
                      <th className="px-5 py-3 text-right font-medium">البداية</th>
                      <th className="px-5 py-3 text-right font-medium">رسائل</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {conversations?.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-gray-400">
                          لا توجد محادثات بعد
                        </td>
                      </tr>
                    )}
                    {conversations?.map((row: any) => {
                      // البنية الصحيحة: { conversation, patient }
                      const c = row.conversation;
                      const p = row.patient;
                      return (
                        <tr key={c.id} className="hover:bg-gray-50">
                          <td className="px-5 py-3 font-medium text-gray-900">
                            {p?.name || "—"}
                          </td>
                          <td className="px-5 py-3 font-mono text-gray-600 text-xs">
                            {p?.phone || "—"}
                          </td>
                          <td className="px-5 py-3">
                            <StatusBadge status={c.status} />
                          </td>
                          <td className="px-5 py-3 text-xs text-gray-500">
                            {c.current_step || "—"}
                          </td>
                          <td className="px-5 py-3 text-xs text-gray-400">
                            {new Date(c.started_at).toLocaleDateString("ar-SA")}
                          </td>
                          <td className="px-5 py-3">
                            <button
                              onClick={() => setSelectedConvId(c.id)}
                              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
                            >
                              عرض
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>

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