/**
 * Simulator.tsx — محاكي المحادثات
 * ملاحظة: داخل DashboardLayout — لا حاجة لـ header منفصل
 */

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Loader2, MessageSquare, Send, RefreshCw, Zap } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { PageTransition } from "../components/PageTransition";

interface SimulatedMessage {
  id: string;
  direction: "inbound" | "outbound";
  content: string;
  timestamp: Date;
}

const QUICK_MESSAGES = [
  { label: "بدء المحادثة", text: "مرحبا" },
  { label: "مريض جديد", text: "1" },
  { label: "مريض قديم", text: "2" },
  { label: "طلب موعد", text: "أريد حجز موعد" },
  { label: "استفسار", text: "ما هي أوقات العمل؟" },
];

export default function Simulator() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [currentMessage, setCurrentMessage] = useState("");
  const [messages, setMessages] = useState<SimulatedMessage[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: workspaces } = trpc.admin.workspaces.useQuery();
  const currentWorkspaceId = workspaces?.[0]?.workspace?.id || "";

  const simulateMessageMutation = trpc.admin.simulateMessage.useMutation();

  const { data: serverMessages } = trpc.admin.getSimulatorMessages.useQuery(
    { workspaceId: currentWorkspaceId, phone: phoneNumber },
    { enabled: isSimulating && !!phoneNumber && !!currentWorkspaceId, refetchInterval: 1000 }
  );

  useEffect(() => {
    if (serverMessages && serverMessages.length > 0) {
      setMessages(
        serverMessages.map((m: any) => ({
          id: m.id,
          direction: m.direction,
          content: m.content,
          timestamp: new Date(m.timestamp),
        }))
      );
    }
  }, [serverMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const generateRandomPhone = () => {
    const area = Math.floor(Math.random() * 9) + 501;
    const number = Math.floor(Math.random() * 9000000) + 1000000;
    setPhoneNumber(`972${area}${number}`);
  };

  const startNewSimulation = () => {
    if (!phoneNumber) generateRandomPhone();
    setMessages([]);
    setIsSimulating(true);
  };

  const sendMessage = async (text?: string) => {
    const msg = text || currentMessage;
    if (!msg.trim() || !phoneNumber) return;

    const userMessage: SimulatedMessage = {
      id: `user-${Date.now()}`,
      direction: "inbound",
      content: msg,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    if (!text) setCurrentMessage("");

    await simulateMessageMutation.mutateAsync({
      workspaceId: currentWorkspaceId,
      phone: phoneNumber,
      message: msg,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatPhone = (phone: string) => {
    if (phone.startsWith("972") && phone.length >= 12) {
      return `+${phone.slice(0, 3)} ${phone.slice(3, 5)}-${phone.slice(5)}`;
    }
    return phone;
  };

  return (
    <PageTransition className="space-y-6" dir="rtl">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">محاكي المحادثات</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          اختبر البوت بدون الحاجة لـ WhatsApp حقيقي
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* لوحة التحكم */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">إعداد المحاكاة</CardTitle>
              <CardDescription>حدد رقم الهاتف وابدأ</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  رقم الهاتف
                </label>
                <div className="flex gap-2">
                  <Input
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="972501234567"
                    disabled={isSimulating}
                    className="font-mono text-sm"
                    dir="ltr"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={generateRandomPhone}
                    disabled={isSimulating}
                    title="توليد رقم عشوائي"
                    className="shrink-0"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
                {phoneNumber && (
                  <p className="text-xs text-muted-foreground mt-1 font-mono" dir="ltr">
                    {formatPhone(phoneNumber)}
                  </p>
                )}
              </div>

              {!isSimulating ? (
                <Button onClick={startNewSimulation} className="w-full">
                  <MessageSquare className="h-4 w-4 ml-2" />
                  بدء محادثة جديدة
                </Button>
              ) : (
                <Button
                  variant="destructive"
                  onClick={() => {
                    setIsSimulating(false);
                    setMessages([]);
                  }}
                  className="w-full"
                >
                  إنهاء المحاكاة
                </Button>
              )}
            </CardContent>
          </Card>

          {/* اختصارات */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                رسائل سريعة
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {QUICK_MESSAGES.map((qm) => (
                <button
                  key={qm.text}
                  onClick={() => sendMessage(qm.text)}
                  disabled={!isSimulating || simulateMessageMutation.isPending}
                  className="w-full flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm text-right transition-colors hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span>{qm.label}</span>
                  <span className="text-xs text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
                    {qm.text}
                  </span>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* منطقة الدردشة */}
        <Card className="lg:col-span-2 flex flex-col overflow-hidden" style={{ height: "600px" }}>
          {/* هيدر الدردشة */}
          <CardHeader className="border-b pb-3 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-green-500 flex items-center justify-center text-white shrink-0">
                  <MessageSquare className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-sm">
                    {isSimulating ? formatPhone(phoneNumber) : "المحاكي"}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {isSimulating ? "محادثة جارية" : "ابدأ محادثة للتجربة"}
                  </CardDescription>
                </div>
              </div>
              {isSimulating && (
                <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                  نشط
                </Badge>
              )}
            </div>
          </CardHeader>

          {/* الرسائل */}
          <div className="flex-1 overflow-y-auto bg-[#efeae2] p-4 space-y-2">
            {!isSimulating ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center text-muted-foreground">
                  <MessageSquare className="h-14 w-14 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">ابدأ محادثة جديدة من اليسار</p>
                </div>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm text-muted-foreground">أرسل رسالة للبدء...</p>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${
                    msg.direction === "inbound" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                      msg.direction === "inbound"
                        ? "rounded-tr-sm bg-[#d9fdd3] text-gray-800"
                        : "rounded-tl-sm bg-white text-gray-800"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[10px] font-medium text-gray-500">
                        {msg.direction === "inbound" ? "أنت" : "البوت"}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    <p className="mt-1 text-left text-[10px] text-gray-400 flex items-center gap-1 justify-end">
                      {msg.timestamp.toLocaleTimeString("ar-SA", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {msg.direction === "inbound" && (
                        <span className="text-blue-400">✓✓</span>
                      )}
                    </p>
                  </div>
                </div>
              ))
            )}

            {simulateMessageMutation.isPending && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-tl-sm bg-white px-4 py-3 shadow-sm">
                  <div className="flex gap-1 items-center">
                    <span
                      className="h-2 w-2 rounded-full bg-gray-400 animate-bounce"
                      style={{ animationDelay: "0ms" }}
                    />
                    <span
                      className="h-2 w-2 rounded-full bg-gray-400 animate-bounce"
                      style={{ animationDelay: "150ms" }}
                    />
                    <span
                      className="h-2 w-2 rounded-full bg-gray-400 animate-bounce"
                      style={{ animationDelay: "300ms" }}
                    />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* حقل الإدخال */}
          <div className="border-t bg-background px-3 py-2.5 flex gap-2 items-end shrink-0">
            <Input
              value={currentMessage}
              onChange={(e) => setCurrentMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isSimulating ? "اكتب رسالتك..." : "ابدأ محادثة أولاً"}
              disabled={!isSimulating || simulateMessageMutation.isPending}
              className="flex-1"
            />
            <Button
              onClick={() => sendMessage()}
              disabled={!currentMessage.trim() || !isSimulating || simulateMessageMutation.isPending}
              size="icon"
              className="shrink-0"
            >
              {simulateMessageMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </Card>
      </div>
    </PageTransition>
  );
}