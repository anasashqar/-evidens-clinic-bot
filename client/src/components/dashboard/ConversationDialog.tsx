import { motion } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MessageSquare } from "lucide-react";
import { trpc } from "../../lib/trpc";

export function ConversationDialog({
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

        <div className="h-96 overflow-y-auto bg-muted/30 dark:bg-background/50 p-4 space-y-3">
          {isLoading && (
            <p className="text-center text-sm text-muted-foreground py-10 animate-pulse">
              جاري التحميل...
            </p>
          )}
          {messages?.map((msg: any) => (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              key={msg.id}
              className={`flex ${
                msg.direction === "inbound" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-xs rounded-2xl px-4 py-2.5 text-sm shadow-sm border ${
                  msg.direction === "inbound"
                    ? "rounded-tr-sm bg-primary/10 border-primary/20 text-foreground"
                    : "rounded-tl-sm bg-card border-border text-foreground"
                }`}
              >
                <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                <p className="mt-1.5 text-left text-[10px] text-muted-foreground font-mono">
                  {new Date(msg.created_at).toLocaleTimeString("ar-SA", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </motion.div>
          ))}
          {messages?.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground opacity-60 gap-2">
              <MessageSquare className="h-8 w-8" />
              <p className="text-sm">لا توجد رسائل</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
