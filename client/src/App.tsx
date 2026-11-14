import { lazy, Suspense, useEffect, type ComponentType } from "react";
import { Redirect, Route, Switch, useLocation, useParams } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster as SonnerToaster } from "sonner";
import { queryClient } from "./lib/queryClient";
import { AuthProvider, useAuth } from "./lib/auth";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "@/components/app/AppShell";
import { Loading } from "@/components/app/kit";
import NotFound from "@/pages/not-found";

// Public pages
const Landing = lazy(() => import("@/pages/marketing/Landing"));
const Login = lazy(() => import("@/pages/marketing/Login"));
const ForgotPassword = lazy(() => import("@/pages/ForgotPassword"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const PrivacyPolicy = lazy(() => import("@/pages/PrivacyPolicy"));
const TermsOfUse = lazy(() => import("@/pages/TermsOfUse"));
const Support = lazy(() => import("@/pages/Support"));
const ObserveLive = lazy(() => import("@/pages/ObserveLive"));
const RunVideoShare = lazy(() => import("@/pages/RunVideoShare"));
const AdminHub = lazy(() => import("@/pages/AdminHub"));
const AdminAIConfig = lazy(() => import("@/pages/AdminAIConfig"));
const AdminCostDashboard = lazy(() => import("@/pages/AdminCostDashboard"));

// Signed-in app
const Dashboard = lazy(() => import("@/pages/app/Dashboard"));
const Runs = lazy(() => import("@/pages/app/Runs"));
const RunDetail = lazy(() => import("@/pages/app/RunDetail"));
const Training = lazy(() => import("@/pages/app/Training"));
const PlanDetail = lazy(() => import("@/pages/app/PlanDetail"));
const NewPlan = lazy(() => import("@/pages/app/NewPlan"));
const Goals = lazy(() => import("@/pages/app/Goals"));
const MyData = lazy(() => import("@/pages/app/MyData"));
const GroupRuns = lazy(() => import("@/pages/app/GroupRuns"));
const GroupRunDetail = lazy(() => import("@/pages/app/GroupRunDetail"));
const Friends = lazy(() => import("@/pages/app/Friends"));
const RoutesPage = lazy(() => import("@/pages/app/Routes"));
const Notifications = lazy(() => import("@/pages/app/Notifications"));
const Settings = lazy(() => import("@/pages/app/Settings"));

function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location]);
  return null;
}

const PageFallback = () => <div className="min-h-screen bg-root" />;

/** Signed-in route: redirects to /login (and back afterwards) without a session. */
function Private({ component: C }: { component: ComponentType<any> }) {
  const { session } = useAuth();
  const [location] = useLocation();
  if (!session) return <Redirect to={`/login?next=${encodeURIComponent(location)}`} />;
  return (
    <AppShell>
      <Suspense fallback={<Loading />}>
        <C />
      </Suspense>
    </AppShell>
  );
}

function Home() {
  const { session } = useAuth();
  if (session) return <Redirect to="/dashboard" />;
  return <Landing />;
}

function LegacyRunRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Redirect to={`/runs/${id}`} />;
}

function Router() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Switch>
        {/* Public */}
        <Route path="/" component={Home} />
        <Route path="/features" component={Landing} />
        <Route path="/login" component={Login} />
        <Route path="/forgot-password" component={ForgotPassword} />
        <Route path="/reset-password" component={ResetPassword} />
        <Route path="/privacy" component={PrivacyPolicy} />
        <Route path="/terms" component={TermsOfUse} />
        <Route path="/support" component={Support} />
        <Route path="/observe/:code" component={ObserveLive} />
        <Route path="/run-video/:id" component={RunVideoShare} />
        <Route path="/admin" component={AdminHub} />
        <Route path="/admin/ai-config" component={AdminAIConfig} />
        <Route path="/admin/costs" component={AdminCostDashboard} />

        {/* Signed in */}
        <Route path="/dashboard">{() => <Private component={Dashboard} />}</Route>
        <Route path="/runs">{() => <Private component={Runs} />}</Route>
        <Route path="/runs/:id">{() => <Private component={RunDetail} />}</Route>
        <Route path="/training">{() => <Private component={Training} />}</Route>
        <Route path="/training/new">{() => <Private component={NewPlan} />}</Route>
        <Route path="/training/:planId">{() => <Private component={PlanDetail} />}</Route>
        <Route path="/goals">{() => <Private component={Goals} />}</Route>
        <Route path="/my-data">{() => <Private component={MyData} />}</Route>
        <Route path="/group-runs">{() => <Private component={GroupRuns} />}</Route>
        <Route path="/group-runs/:id">{() => <Private component={GroupRunDetail} />}</Route>
        <Route path="/friends">{() => <Private component={Friends} />}</Route>
        <Route path="/routes">{() => <Private component={RoutesPage} />}</Route>
        <Route path="/notifications">{() => <Private component={Notifications} />}</Route>
        <Route path="/settings">{() => <Private component={Settings} />}</Route>

        {/* Old MVP URLs (bookmarks, emails, the apps' links) */}
        <Route path="/history">{() => <Redirect to="/runs" />}</Route>
        <Route path="/history/:id" component={LegacyRunRedirect} />
        <Route path="/profile">{() => <Redirect to="/settings" />}</Route>
        <Route path="/setup">{() => <Redirect to="/settings" />}</Route>
        <Route path="/notifications/manage">{() => <Redirect to="/settings?tab=notifications" />}</Route>
        <Route path="/events">{() => <Redirect to="/routes" />}</Route>
        <Route path="/run">{() => <Redirect to="/dashboard" />}</Route>

        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <ScrollToTop />
          <Toaster />
          <SonnerToaster position="top-center" theme="dark" richColors />
          <Router />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
