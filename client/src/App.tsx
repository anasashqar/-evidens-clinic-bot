import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { AnimatePresence } from "framer-motion";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import BotSettings from "./pages/BotSettings";
import Dashboard from "./pages/Dashboard";
import Workspaces from "./pages/Workspaces";
import Simulator from "./pages/Simulator";

function Router() {
  const [location] = useLocation();
  
  return (
    <DashboardLayout>
      <AnimatePresence mode="wait">
        <Switch location={location} key={location}>
          <Route path={"/"} component={Dashboard} />
          <Route path={"/dashboard"} component={Dashboard} />
          <Route path={"/workspaces"} component={Workspaces} />
          <Route path={"/simulator"} component={Simulator} />
          <Route path={"/workspace/:workspaceId/settings"} component={BotSettings} />
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