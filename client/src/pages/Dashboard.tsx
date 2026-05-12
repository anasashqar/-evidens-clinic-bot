import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { Activity, Calendar, MessageSquare, Users, TestTube2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function Dashboard() {
  // جلب مساحات العمل لاختيار أول مساحة عمل (أو يمكنك إضافة قائمة منسدلة لاحقاً لاختيار العميل)
  const { data: workspaces } = trpc.admin.workspaces.useQuery();
  const currentWorkspaceId = workspaces?.[0]?.workspace?.id || "";

  // تحديث أسماء الروابط وتمرير workspaceId
  const { data: metrics, isLoading: metricsLoading } = trpc.admin.workspaceMetrics.useQuery(
    { workspaceId: currentWorkspaceId },
    { enabled: !!currentWorkspaceId }
  );
  const { data: conversations } = trpc.admin.workspaceConversations.useQuery(
    { workspaceId: currentWorkspaceId },
    { enabled: !!currentWorkspaceId }
  );
  const { data: handoffs, refetch: refetchHandoffs } = trpc.admin.workspaceHandoffs.useQuery(
    { workspaceId: currentWorkspaceId },
    { enabled: !!currentWorkspaceId }
  );
  
  // قم بإيقاف مسار المواعيد حالياً لأنه غير موجود في routers.ts
  const appointments: any[] = []; // const { data: appointments } = trpc.admin.appointments.useQuery();

  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const { data: messages } = trpc.admin.conversationMessages.useQuery(
    { conversationId: selectedConversation! },
    { enabled: !!selectedConversation }
  );

  const updateHandoffMutation = trpc.admin.updateHandoff.useMutation({
    onSuccess: () => {
      refetchHandoffs();
    },
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('pt-BR');
  };

  const formatPhone = (phone: string) => {
    // Format: 5511999999999 -> (11) 99999-9999
    if (phone.length === 13 && phone.startsWith('55')) {
      const ddd = phone.substring(2, 4);
      const firstPart = phone.substring(4, 9);
      const secondPart = phone.substring(9);
      return `(${ddd}) ${firstPart}-${secondPart}`;
    }
    return phone;
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      active: "default",
      handoff: "secondary",
      completed: "outline",
      pending: "secondary",
      confirmed: "default",
      cancelled: "destructive",
    };
    return <Badge variant={variants[status] || "outline"}>{status}</Badge>;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Painel Administrativo</h1>
            <p className="text-gray-600 mt-2">EviDenS Clinic - WhatsApp Bot</p>
          </div>
          <a href="/simulator">
            <Button variant="outline" className="gap-2">
              <TestTube2 className="h-4 w-4" />
              Simulador de Testes
            </Button>
          </a>
        </div>

        {/* Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Conversas Hoje</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {metricsLoading ? "..." : metrics?.totalConversations || 0}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Handoffs Hoje</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {metricsLoading ? "..." : metrics?.totalHandoffs || 0}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Handoffs Pendentes</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {metricsLoading ? "..." : metrics?.pendingHandoffs || 0}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Próximas Consultas</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {metricsLoading ? "..." : 0}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="handoffs" className="space-y-4">
          <TabsList>
            <TabsTrigger value="handoffs">Handoffs</TabsTrigger>
            <TabsTrigger value="conversations">Conversas</TabsTrigger>
            <TabsTrigger value="appointments">Agendamentos</TabsTrigger>
          </TabsList>

          {/* Handoffs Tab */}
          <TabsContent value="handoffs" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Handoffs Recentes</CardTitle>
                <CardDescription>
                  Transferências de atendimento para a equipe humana
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Paciente</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead>Motivo</TableHead>
                      <TableHead>Resumo</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {handoffs?.map((handoff: any) => (
                      <TableRow key={handoff.id}>
                        <TableCell className="font-medium">
                          {handoff.patient_name || "Sem nome"}
                        </TableCell>
                        <TableCell>{formatPhone(handoff.patient_phone)}</TableCell>
                        <TableCell>{handoff.reason}</TableCell>
                        <TableCell className="max-w-xs truncate">
                          {handoff.summary || "-"}
                        </TableCell>
                        <TableCell>{getStatusBadge(handoff.status)}</TableCell>
                        <TableCell>{formatDate(handoff.created_at)}</TableCell>
                        <TableCell>
                          {handoff.status === "pending" && (
                            <Button
                              size="sm"
                              onClick={() =>
                                updateHandoffMutation.mutate({
                                  handoffId: handoff.id,
                                  status: "completed",
                                })
                              }
                            >
                              Concluir
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Conversations Tab */}
          <TabsContent value="conversations" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Conversas Recentes</CardTitle>
                <CardDescription>Histórico de conversas com pacientes</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Paciente</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Etapa Atual</TableHead>
                      <TableHead>Iniciada em</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {conversations?.map((conv: any) => (
                      <TableRow key={conv.id}>
                        <TableCell className="font-medium">
                          {conv.patient_name || "Sem nome"}
                        </TableCell>
                        <TableCell>{formatPhone(conv.patient_phone)}</TableCell>
                        <TableCell>{getStatusBadge(conv.status)}</TableCell>
                        <TableCell>{conv.current_step || "-"}</TableCell>
                        <TableCell>{formatDate(conv.started_at)}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedConversation(conv.id)}
                          >
                            Ver Mensagens
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Appointments Tab */}
          <TabsContent value="appointments" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Agendamentos</CardTitle>
                <CardDescription>Consultas e procedimentos agendados</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Paciente</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead>Médico</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {appointments?.map((appt: any) => (
                      <TableRow key={appt.id}>
                        <TableCell className="font-medium">
                          {appt.patient_name || "Sem nome"}
                        </TableCell>
                        <TableCell>{formatPhone(appt.patient_phone)}</TableCell>
                        <TableCell>{appt.doctor}</TableCell>
                        <TableCell>{appt.appointment_type}</TableCell>
                        <TableCell>{formatDate(appt.appointment_date)}</TableCell>
                        <TableCell>{getStatusBadge(appt.status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Messages Dialog */}
      <Dialog open={!!selectedConversation} onOpenChange={() => setSelectedConversation(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Mensagens da Conversa</DialogTitle>
            <DialogDescription>
              Histórico completo de mensagens trocadas
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {messages?.map((msg: any) => (
              <div
                key={msg.id}
                className={`p-4 rounded-lg ${
                  msg.direction === "outbound"
                    ? "bg-blue-50 ml-8"
                    : "bg-gray-50 mr-8"
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <Badge variant={msg.direction === "outbound" ? "default" : "secondary"}>
                    {msg.direction === "outbound" ? "Bot" : "Paciente"}
                  </Badge>
                  <span className="text-xs text-gray-500">
                    {formatDate(msg.created_at)}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
