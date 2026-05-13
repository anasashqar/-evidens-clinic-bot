import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import BotSettings from "./pages/BotSettings";
import Dashboard from "./pages/Dashboard";
import Workspaces from "./pages/Workspaces";
import Simulator from "./pages/Simulator";

function Router() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path={"/"} component={Dashboard} />
        <Route path={"/dashboard"} component={Dashboard} />
        <Route path={"/workspaces"} component={Workspaces} />
        <Route path={"/simulator"} component={Simulator} />
        <Route path={"/workspace/:workspaceId/settings"} component={BotSettings} />
        <Route path={"/404"} component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;