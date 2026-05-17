import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";
import { arSA } from "date-fns/locale";
import { toast } from "sonner";
import {
  Calendar, Plus, Search, Filter, Clock, User, Phone,
  CheckCircle2, XCircle, AlertCircle, Trash2, Edit3,
  CalendarCheck, CalendarX, RefreshCw, Stethoscope,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { motion, AnimatePresence } from "framer-motion";

// ─── Types ────────────────────────────────────────────────────────────────────
type AppointmentStatus = "scheduled" | "confirmed" | "cancelled" | "completed";

interface AppointmentRow {
  appointment: {
    id: string;
    appointment_date: string | Date;
    status: string | null;
    doctor: string | null;
    appointment_type: string | null;
    preferred_period: string | null;
    notes: string | null;
    reminder_12h_sent: boolean;
    reminder_2h_sent: boolean;
    workspace_id: string;
    patient_id: string;
  };
  patient: {
    id: string;
    phone: string;
    name: string | null;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<AppointmentStatus, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  scheduled: { label: "مجدول", icon: Clock, color: "text-blue-600", bg: "bg-blue-50 border-blue-200" },
  confirmed: { label: "مؤكد", icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" },
  cancelled: { label: "ملغي", icon: XCircle, color: "text-red-600", bg: "bg-red-50 border-red-200" },
  completed: { label: "مكتمل", icon: CalendarCheck, color: "text-purple-600", bg: "bg-purple-50 border-purple-200" },
};

function StatusBadge({ status }: { status: string | null }) {
  const s = (status ?? "scheduled") as AppointmentStatus;
  const cfg = STATUS_CONFIG[s] ?? STATUS_CONFIG.scheduled;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.color}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

function formatDate(d: string | Date) {
  return format(new Date(d), "EEEE، d MMMM yyyy — h:mm a", { locale: arSA });
}

function getWorkspaceId(): string {
  const m = window.location.pathname.match(/\/workspace\/([^/]+)/);
  return m?.[1] ?? "";
}

// ─── New Appointment Dialog ───────────────────────────────────────────────────
function NewAppointmentDialog({
  workspaceId,
  open,
  onClose,
  onCreated,
}: {
  workspaceId: string;
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    patientPhone: "",
    patientName: "",
    appointmentDate: "",
    doctor: "",
    appointmentType: "",
    preferredPeriod: "",
    notes: "",
  });

  const createMutation = trpc.appointments.create.useMutation({
    onSuccess: () => {
      toast.success("✅ تم إضافة الموعد بنجاح");
      onCreated();
      onClose();
      setForm({ patientPhone: "", patientName: "", appointmentDate: "", doctor: "", appointmentType: "", preferredPeriod: "", notes: "" });
    },
    onError: (e) => toast.error(`خطأ: ${e.message}`),
  });

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Plus className="h-5 w-5 text-primary" />
            إضافة موعد جديد
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>رقم الهاتف *</Label>
              <Input placeholder="9725XXXXXXXX" value={form.patientPhone} onChange={f("patientPhone")} dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <Label>اسم المريض</Label>
              <Input placeholder="الاسم الكامل" value={form.patientName} onChange={f("patientName")} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>تاريخ ووقت الموعد *</Label>
            <Input type="datetime-local" value={form.appointmentDate} onChange={f("appointmentDate")} dir="ltr" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>الطبيب / المختص</Label>
              <Input placeholder="اسم الطبيب" value={form.doctor} onChange={f("doctor")} />
            </div>
            <div className="space-y-1.5">
              <Label>نوع الخدمة</Label>
              <Input placeholder="فحص، علاج..." value={form.appointmentType} onChange={f("appointmentType")} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>الوقت المفضل</Label>
            <Input placeholder="صباحاً، مساءً..." value={form.preferredPeriod} onChange={f("preferredPeriod")} />
          </div>

          <div className="space-y-1.5">
            <Label>ملاحظات</Label>
            <Textarea placeholder="أي ملاحظات إضافية..." value={form.notes} onChange={f("notes")} rows={2} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button
            onClick={() => createMutation.mutate({ workspaceId, ...form })}
            disabled={!form.patientPhone || !form.appointmentDate || createMutation.isPending}
          >
            {createMutation.isPending ? "جاري الحفظ..." : "حفظ الموعد"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Dialog ──────────────────────────────────────────────────────────────
function EditAppointmentDialog({
  row,
  open,
  onClose,
  onUpdated,
}: {
  row: AppointmentRow;
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const appt = row.appointment;
  const localDate = new Date(appt.appointment_date);
  const pad = (n: number) => String(n).padStart(2, "0");
  const defaultDateStr = `${localDate.getFullYear()}-${pad(localDate.getMonth()+1)}-${pad(localDate.getDate())}T${pad(localDate.getHours())}:${pad(localDate.getMinutes())}`;

  const [form, setForm] = useState({
    appointmentDate: defaultDateStr,
    doctor: appt.doctor ?? "",
    appointmentType: appt.appointment_type ?? "",
    preferredPeriod: appt.preferred_period ?? "",
    notes: appt.notes ?? "",
    status: (appt.status ?? "scheduled") as AppointmentStatus,
  });

  const updateMutation = trpc.appointments.update.useMutation({
    onSuccess: () => { toast.success("✅ تم تحديث الموعد"); onUpdated(); onClose(); },
    onError: (e) => toast.error(`خطأ: ${e.message}`),
  });

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit3 className="h-5 w-5 text-primary" />
            تعديل الموعد
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="p-3 rounded-lg bg-muted/50 text-sm">
            <span className="font-medium">{row.patient.name ?? "غير محدد"}</span>
            <span className="text-muted-foreground ml-2 mr-2">·</span>
            <span className="text-muted-foreground" dir="ltr">{row.patient.phone}</span>
          </div>

          <div className="space-y-1.5">
            <Label>تاريخ ووقت الموعد</Label>
            <Input type="datetime-local" value={form.appointmentDate} onChange={f("appointmentDate")} dir="ltr" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>الطبيب</Label>
              <Input value={form.doctor} onChange={f("doctor")} />
            </div>
            <div className="space-y-1.5">
              <Label>نوع الخدمة</Label>
              <Input value={form.appointmentType} onChange={f("appointmentType")} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>الحالة</Label>
            <Select value={form.status} onValueChange={(v) => setForm(p => ({ ...p, status: v as AppointmentStatus }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>ملاحظات</Label>
            <Textarea value={form.notes} onChange={f("notes")} rows={2} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button
            onClick={() => updateMutation.mutate({ appointmentId: appt.id, ...form })}
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? "جاري الحفظ..." : "حفظ التعديلات"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Appointment Card ─────────────────────────────────────────────────────────
function AppointmentCard({
  row,
  onStatusChange,
  onEdit,
  onDelete,
}: {
  row: AppointmentRow;
  onStatusChange: (id: string, status: AppointmentStatus) => void;
  onEdit: (row: AppointmentRow) => void;
  onDelete: (id: string) => void;
}) {
  const appt = row.appointment;
  const patient = row.patient;
  const statusCfg = STATUS_CONFIG[(appt.status ?? "scheduled") as AppointmentStatus] ?? STATUS_CONFIG.scheduled;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className="group bg-card border border-border rounded-xl p-4 hover:shadow-md transition-all duration-200 hover:border-primary/20"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Patient info */}
          <div className="flex items-center gap-2 mb-2">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <User className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">{patient.name ?? "مريض غير محدد"}</p>
              <p className="text-xs text-muted-foreground" dir="ltr">{patient.phone}</p>
            </div>
          </div>

          {/* Date */}
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-2">
            <Calendar className="h-3.5 w-3.5 shrink-0" />
            <span>{formatDate(appt.appointment_date)}</span>
          </div>

          {/* Doctor / type */}
          {(appt.doctor || appt.appointment_type) && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
              {appt.doctor && (
                <span className="flex items-center gap-1">
                  <Stethoscope className="h-3 w-3" />
                  {appt.doctor}
                </span>
              )}
              {appt.appointment_type && (
                <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                  {appt.appointment_type}
                </span>
              )}
            </div>
          )}

          {/* Notes */}
          {appt.notes && (
            <p className="text-xs text-muted-foreground bg-muted/50 rounded-md px-2 py-1 mt-1 line-clamp-2">
              {appt.notes}
            </p>
          )}

          {/* Reminder indicators */}
          <div className="flex items-center gap-2 mt-2">
            <span className={`text-xs flex items-center gap-0.5 ${appt.reminder_12h_sent ? "text-emerald-600" : "text-muted-foreground/40"}`}>
              <AlertCircle className="h-3 w-3" />
              12س
            </span>
            <span className={`text-xs flex items-center gap-0.5 ${appt.reminder_2h_sent ? "text-emerald-600" : "text-muted-foreground/40"}`}>
              <AlertCircle className="h-3 w-3" />
              2س
            </span>
          </div>
        </div>

        {/* Status + actions */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          <StatusBadge status={appt.status} />
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => onEdit(row)}
            >
              <Edit3 className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={() => onDelete(appt.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Quick status actions */}
          {appt.status === "scheduled" && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-xs px-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              onClick={() => onStatusChange(appt.id, "confirmed")}
            >
              تأكيد
            </Button>
          )}
          {appt.status === "confirmed" && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-xs px-2 border-purple-300 text-purple-700 hover:bg-purple-50"
              onClick={() => onStatusChange(appt.id, "completed")}
            >
              إكمال
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Stats Cards ──────────────────────────────────────────────────────────────
function StatsCards({ workspaceId }: { workspaceId: string }) {
  const { data: stats } = trpc.appointments.stats.useQuery({ workspaceId }, { refetchInterval: 30_000 });

  const cards = [
    { label: "المواعيد اليوم", value: stats?.today ?? 0, icon: Calendar, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "القادمة", value: stats?.upcoming ?? 0, icon: CalendarCheck, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "الإجمالي", value: stats?.total ?? 0, icon: Clock, color: "text-violet-600", bg: "bg-violet-50" },
    { label: "الملغية", value: stats?.cancelled ?? 0, icon: CalendarX, color: "text-red-500", bg: "bg-red-50" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <div key={c.label} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
            <div className={`h-10 w-10 rounded-lg ${c.bg} flex items-center justify-center shrink-0`}>
              <Icon className={`h-5 w-5 ${c.color}`} />
            </div>
            <div>
              <p className="text-2xl font-bold">{c.value}</p>
              <p className="text-xs text-muted-foreground">{c.label}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Appointments() {
  const workspaceId = getWorkspaceId();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showNew, setShowNew] = useState(false);
  const [editRow, setEditRow] = useState<AppointmentRow | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: rows = [], refetch, isLoading } = trpc.appointments.list.useQuery(
    { workspaceId },
    { enabled: !!workspaceId, refetchInterval: 30_000 }
  );

  const statusMutation = trpc.appointments.updateStatus.useMutation({
    onSuccess: () => { toast.success("تم تحديث الحالة"); refetch(); },
    onError: (e) => toast.error(`خطأ: ${e.message}`),
  });

  const deleteMutation = trpc.appointments.delete.useMutation({
    onSuccess: () => { toast.success("تم حذف الموعد"); refetch(); setDeleteId(null); },
    onError: (e) => toast.error(`خطأ: ${e.message}`),
  });

  const filtered = useMemo(() => {
    let list = rows as AppointmentRow[];
    if (filterStatus !== "all") list = list.filter(r => r.appointment.status === filterStatus);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        r.patient.phone.includes(q) ||
        (r.patient.name?.toLowerCase().includes(q)) ||
        (r.appointment.doctor?.toLowerCase().includes(q))
      );
    }
    return list;
  }, [rows, filterStatus, search]);

  if (!workspaceId) {
    return (
      <div className="flex flex-col items-center justify-center h-60 text-muted-foreground gap-2">
        <Calendar className="h-10 w-10 opacity-30" />
        <p>يرجى تحديد workspace من قائمة العملاء</p>
      </div>
    );
  }

  return (
    <div className="space-y-0" dir="rtl">
      {/* Stats */}
      <StatsCards workspaceId={workspaceId} />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="بحث بالاسم، الهاتف، الطبيب..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pr-9"
          />
        </div>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36">
            <Filter className="h-4 w-4 ml-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">جميع الحالات</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="outline" size="icon" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>

        <Button onClick={() => setShowNew(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          موعد جديد
        </Button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="grid gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 rounded-xl bg-muted/40 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-52 text-muted-foreground gap-3">
          <Calendar className="h-12 w-12 opacity-20" />
          <p className="text-sm">لا توجد مواعيد {filterStatus !== "all" ? "بهذه الحالة" : ""}</p>
          <Button variant="outline" size="sm" onClick={() => setShowNew(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            أضف أول موعد
          </Button>
        </div>
      ) : (
        <div className="grid gap-3">
          <AnimatePresence>
            {filtered.map(row => (
              <AppointmentCard
                key={row.appointment.id}
                row={row}
                onStatusChange={(id, status) => statusMutation.mutate({ appointmentId: id, status })}
                onEdit={setEditRow}
                onDelete={setDeleteId}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Dialogs */}
      <NewAppointmentDialog
        workspaceId={workspaceId}
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={() => refetch()}
      />

      {editRow && (
        <EditAppointmentDialog
          row={editRow}
          open={!!editRow}
          onClose={() => setEditRow(null)}
          onUpdated={() => refetch()}
        />
      )}

      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الموعد؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف الموعد نهائياً ولن تُرسَل تذكيرات له.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate({ appointmentId: deleteId })}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
