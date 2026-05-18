import { useState } from "react";
import { trpc } from "../../lib/trpc";
import { useLocation } from "wouter";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Settings, CheckCircle2, AlertCircle, CalendarDays } from "lucide-react";

export function WorkspaceCard({ row, onRefresh, typeInfo }: { row: any; onRefresh: () => void; typeInfo: any }) {
  const [, setLocation] = useLocation();
  const { workspace, botSettings, zapiConfig } = row;
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
      className={`relative overflow-hidden transition-all duration-300 hover:shadow-lg hover:border-primary/20 group ${
        !workspace.is_active ? "opacity-60 grayscale-[0.3]" : ""
      }`}
    >
      {/* Status bar */}
      <div
        className={`h-1 w-full transition-all duration-500 ${
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
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
              zapiConfig
                ? "border-green-200/50 bg-green-500/10 text-green-700 dark:text-green-400"
                : "border-red-200/50 bg-red-500/10 text-red-700 dark:text-red-400"
            }`}
          >
            {zapiConfig ? (
              <CheckCircle2 className="h-3 w-3 shrink-0" />
            ) : (
              <AlertCircle className="h-3 w-3 shrink-0" />
            )}
            <span className="truncate font-medium">
              {zapiConfig ? zapiConfig.instance_id?.slice(0, 10) + "…" : "غير متصل بالرقم"}
            </span>
          </div>
          <div
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
              isConfigured
                ? "border-green-200/50 bg-green-500/10 text-green-700 dark:text-green-400"
                : "border-amber-200/50 bg-amber-500/10 text-amber-700 dark:text-amber-400"
            }`}
          >
            {isConfigured ? (
              <CheckCircle2 className="h-3 w-3 shrink-0" />
            ) : (
              <AlertCircle className="h-3 w-3 shrink-0" />
            )}
            <span className="font-medium">
              {isConfigured ? "جاهز للعمل" : botSettings ? "يحتاج توجيهات" : "يحتاج إعداد"}
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
        <div className="space-y-2">
          <Button
            size="sm"
            className="w-full h-8 text-xs"
            onClick={() => setLocation(`/workspace/${workspace.id}/dashboard`)}
          >
            <LayoutDashboard className="h-3.5 w-3.5 ml-1.5" />
            لوحة التحكم
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
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
              onClick={() => setLocation(`/workspace/${workspace.id}/appointments`)}
            >
              <CalendarDays className="h-3.5 w-3.5 ml-1.5" />
              المواعيد
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
