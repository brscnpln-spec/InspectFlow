import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Loader2 } from "lucide-react";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import InspectionsPage from "@/pages/inspections";
import InspectionFormPage from "@/pages/inspection-form";
import InspectionDetailPage from "@/pages/inspection-detail";
import EmergencyPage from "@/pages/emergency";
import TeamPage from "@/pages/team";
import AnalyticsPage from "@/pages/analytics";
import MemberInspectionsPage from "@/pages/member-inspections";
import NpsSurveyPage from "@/pages/nps-survey";

function AdminRouter() {
  return (
    <Switch>
      <Route path="/" component={DashboardPage} />
      <Route path="/inspections" component={InspectionsPage} />
      <Route path="/inspections/new" component={InspectionFormPage} />
      <Route path="/inspections/:id" component={InspectionDetailPage} />
      <Route path="/emergency" component={EmergencyPage} />
      <Route path="/team" component={TeamPage} />
      <Route path="/analytics" component={AnalyticsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function MemberRouter() {
  return (
    <Switch>
      <Route path="/" component={MemberInspectionsPage} />
      <Route path="/inspections/:id" component={InspectionDetailPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedLayout() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center gap-2 p-3 border-b bg-background sticky top-0 z-50">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="flex-1" />
            <span className="text-xs text-muted-foreground hidden sm:block">
              {user?.email}
            </span>
          </header>
          <main className="flex-1 overflow-hidden">
            {isAdmin ? <AdminRouter /> : <MemberRouter />}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function AppContent() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#ffb800]" />
      </div>
    );
  }

  return (
    <Switch>
      <Route path="/survey/:token" component={NpsSurveyPage} />
      <Route>
        {user ? <AuthenticatedLayout /> : <LoginPage />}
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
