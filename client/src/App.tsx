import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { AnimatePresence } from "framer-motion";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import BotSettings from "./pages/BotSettings";
import BotDashboard from "./pages/Dashboard";
import Workspaces from "./pages/Workspaces";
import Simulator from "./pages/Simulator";
import Appointments from "./pages/Appointments";

function Router() {
  const [location] = useLocation();
  
  return (
    <DashboardLayout>
      <AnimatePresence mode="wait">
        <Switch location={location} key={location}>
          <Route path={"/"} component={Workspaces} />
          <Route path={"/workspaces"} component={Workspaces} />
          <Route path={"/workspace/:workspaceId/dashboard"} component={BotDashboard} />
          <Route path={"/workspace/:workspaceId/settings"} component={BotSettings} />
          <Route path={"/workspace/:workspaceId/appointments"} component={Appointments} />
          <Route path={"/simulator"} component={Simulator} />
          <Route path={"/404"} component={NotFound} />
          <Route component={NotFound} />
        </Switch>
      </AnimatePresence>
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