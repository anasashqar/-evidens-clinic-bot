import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Loader2, MessageSquare, Send, User } from "lucide-react";
import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";

interface SimulatedMessage {
  id: string;
  direction: "inbound" | "outbound";
  content: string;
  timestamp: Date;
}

export default function Simulator() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [currentMessage, setCurrentMessage] = useState("");
  const [messages, setMessages] = useState<SimulatedMessage[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);
  
  const { data: workspaces } = trpc.admin.workspaces.useQuery();
  const currentWorkspaceId = workspaces?.[0]?.workspace?.id || "";

  const simulateMessageMutation = trpc.admin.simulateMessage.useMutation();
  
  // Poll for new messages
  const { data: serverMessages, refetch } = trpc.admin.getSimulatorMessages.useQuery(
    { workspaceId: currentWorkspaceId, phone: phoneNumber },
    { enabled: isSimulating && !!phoneNumber && !!currentWorkspaceId, refetchInterval: 1000 }
  );

  // Sync server messages with local state
  useEffect(() => {
    if (serverMessages && serverMessages.length > 0) {
      setMessages(serverMessages.map((m: any) => ({
        id: m.id,
        direction: m.direction,
        content: m.content,
        timestamp: new Date(m.timestamp),
      })));
    }
  }, [serverMessages]);

  const generateRandomPhone = () => {
    // Generate a random Brazilian phone number
    const ddd = Math.floor(Math.random() * 89) + 11; // 11-99
    const firstPart = Math.floor(Math.random() * 90000) + 10000; // 10000-99999
    const secondPart = Math.floor(Math.random() * 9000) + 1000; // 1000-9999
    const randomPhone = `55${ddd}9${firstPart}${secondPart}`;
    setPhoneNumber(randomPhone);
  };

  const startNewSimulation = () => {
    if (!phoneNumber) {
      generateRandomPhone();
    }
    setMessages([]);
    setIsSimulating(true);
  };

  const sendMessage = async () => {
    if (!currentMessage.trim() || !phoneNumber) return;

    // Add user message to chat
    const userMessage: SimulatedMessage = {
      id: `user-${Date.now()}`,
      direction: "inbound",
      content: currentMessage,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);

    // Clear input
    const messageToSend = currentMessage;
    setCurrentMessage("");

    // Send to bot
    await simulateMessageMutation.mutateAsync({
      workspaceId: currentWorkspaceId, // إضافة المتغير المطلوب
      phone: phoneNumber,
      message: messageToSend,
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatPhone = (phone: string) => {
    if (phone.length === 13 && phone.startsWith("55")) {
      const ddd = phone.substring(2, 4);
      const firstPart = phone.substring(4, 9);
      const secondPart = phone.substring(9);
      return `+55 (${ddd}) ${firstPart}-${secondPart}`;
    }
    return phone;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Simulador de Conversas</h1>
            <p className="text-gray-600 mt-2">
              Teste o bot sem precisar do WhatsApp real
            </p>
          </div>
          <a href="/dashboard">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Voltar ao Dashboard
            </Button>
          </a>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Control Panel */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>Controles</CardTitle>
              <CardDescription>Configure a simulação</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Número de Telefone
                </label>
                <div className="flex gap-2">
                  <Input
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="5511999999999"
                    disabled={isSimulating}
                  />
                  <Button
                    variant="outline"
                    onClick={generateRandomPhone}
                    disabled={isSimulating}
                    title="Gerar número aleatório"
                  >
                    <User className="h-4 w-4" />
                  </Button>
                </div>
                {phoneNumber && (
                  <p className="text-xs text-gray-500 mt-1">
                    {formatPhone(phoneNumber)}
                  </p>
                )}
              </div>

              {!isSimulating ? (
                <Button onClick={startNewSimulation} className="w-full">
                  Iniciar Nova Conversa
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
                  Encerrar Simulação
                </Button>
              )}

              <div className="pt-4 border-t">
                <h3 className="text-sm font-medium mb-2">Atalhos Rápidos</h3>
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => setCurrentMessage("Olá")}
                    disabled={!isSimulating}
                  >
                    Iniciar conversa
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => setCurrentMessage("1")}
                    disabled={!isSimulating}
                  >
                    Primeira vez
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => setCurrentMessage("2")}
                    disabled={!isSimulating}
                  >
                    Já sou paciente
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Chat Area */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Conversa Simulada</CardTitle>
              <CardDescription>
                {isSimulating
                  ? `Conversando como ${formatPhone(phoneNumber)}`
                  : "Inicie uma simulação para começar"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!isSimulating ? (
                <div className="flex items-center justify-center h-96 text-gray-400">
                  <div className="text-center">
                    <MessageSquare className="h-16 w-16 mx-auto mb-4 opacity-50" />
                    <p>Clique em "Iniciar Nova Conversa" para começar</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Messages */}
                  <div className="h-96 overflow-y-auto space-y-3 p-4 bg-gray-50 rounded-lg">
                    {messages.length === 0 ? (
                      <div className="flex items-center justify-center h-full text-gray-400">
                        <p>Envie uma mensagem para começar...</p>
                      </div>
                    ) : (
                      messages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex ${
                            msg.direction === "outbound" ? "justify-start" : "justify-end"
                          }`}
                        >
                          <div
                            className={`max-w-[80%] rounded-lg p-3 ${
                              msg.direction === "outbound"
                                ? "bg-white border border-gray-200"
                                : "bg-blue-500 text-white"
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <Badge
                                variant={
                                  msg.direction === "outbound" ? "secondary" : "default"
                                }
                                className="text-xs"
                              >
                                {msg.direction === "outbound" ? "Bot" : "Você"}
                              </Badge>
                              <span className="text-xs opacity-70">
                                {msg.timestamp.toLocaleTimeString("pt-BR", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                            <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                          </div>
                        </div>
                      ))
                    )}
                    {simulateMessageMutation.isPending && (
                      <div className="flex justify-start">
                        <div className="bg-white border border-gray-200 rounded-lg p-3">
                          <Loader2 className="h-4 w-4 animate-spin" />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Input */}
                  <div className="flex gap-2">
                    <Input
                      value={currentMessage}
                      onChange={(e) => setCurrentMessage(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder="Digite sua mensagem..."
                      disabled={simulateMessageMutation.isPending}
                    />
                    <Button
                      onClick={sendMessage}
                      disabled={
                        !currentMessage.trim() || simulateMessageMutation.isPending
                      }
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
