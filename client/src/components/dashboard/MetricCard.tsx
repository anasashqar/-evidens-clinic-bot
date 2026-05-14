import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { motion } from "framer-motion";

export function MetricCard({
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
    <Card className="transition-all duration-300 hover:shadow-md hover:border-primary/20 group">
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
          {label}
        </CardTitle>
        <div className="h-9 w-9 rounded-xl bg-primary/5 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
          <Icon className="h-4.5 w-4.5 text-primary" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold tracking-tight">
          {loading ? (
            <div className="h-8 w-16 bg-muted animate-pulse rounded-md" />
          ) : (
            <motion.span
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              key={value}
            >
              {value ?? 0}
            </motion.span>
          )}
        </div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1.5">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}
