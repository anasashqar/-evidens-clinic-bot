import { Badge } from "@/components/ui/badge";

export const STATUS_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline", colorClass?: string }
> = {
  active:      { label: "نشطة",     variant: "default", colorClass: "bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 dark:text-blue-400" },
  handoff:     { label: "تحويل",    variant: "outline", colorClass: "border-orange-200 text-orange-700 bg-orange-50 dark:border-orange-900/50 dark:text-orange-400 dark:bg-orange-950/50" },
  closed:      { label: "مغلقة",    variant: "secondary", colorClass: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  pending:     { label: "بانتظار",  variant: "outline", colorClass: "border-yellow-200 text-yellow-700 bg-yellow-50 dark:border-yellow-900/50 dark:text-yellow-400 dark:bg-yellow-950/50" },
  in_progress: { label: "جارية",    variant: "default", colorClass: "bg-primary/10 text-primary hover:bg-primary/20" },
  completed:   { label: "مكتملة",   variant: "secondary", colorClass: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_CONFIG[status] ?? { label: status, variant: "secondary" as const };
  return (
    <Badge variant={s.variant} className={`font-medium ${s.colorClass || ""}`}>
      {s.label}
    </Badge>
  );
}
