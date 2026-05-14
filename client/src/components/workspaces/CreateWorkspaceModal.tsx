import { useState } from "react";
import { trpc } from "../../lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertCircle, Loader2 } from "lucide-react";

export function CreateWorkspaceModal({
  open,
  onClose,
  onSuccess,
  businessTypes,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  businessTypes: Record<string, { label: string; Icon: React.ElementType }>;
}) {
  const [form, setForm] = useState({
    name: "",
    slug: "",
    business_type: "clinic",
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
      business_type: form.business_type as any,
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
              {(Object.entries(businessTypes)).map(
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
