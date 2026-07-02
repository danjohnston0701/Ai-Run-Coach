import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { BarChart3, ChevronRight, ArrowLeft } from "lucide-react";

function getAuthToken(): string | null {
  try {
    const stored = localStorage.getItem("userProfile");
    const parsed = stored ? JSON.parse(stored) : null;
    return parsed?.token ?? null;
  } catch { return null; }
}

function isAdminUser(): boolean {
  try {
    const stored = localStorage.getItem("userProfile");
    const parsed = stored ? JSON.parse(stored) : null;
    return !!(parsed?.isAdmin || parsed?.user?.isAdmin);
  } catch { return false; }
}

export default function AdminHub() {
  const [, setLocation] = useLocation();
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) { setLocation("/login"); return; }
    fetch("/api/admin/verify", {
      headers: { "Authorization": `Bearer ${token}` },
    }).then(r => {
      if (r.status === 403 || !r.ok) { setLocation("/"); return; }
      setVerified(true);
    }).catch(() => setLocation("/"));
  }, [setLocation]);

  if (!verified) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <button
          onClick={() => setLocation("/")}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition-colors"
          data-testid="button-back-home"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back to Home</span>
        </button>

        <h1 className="text-3xl font-display font-bold text-primary uppercase tracking-wider mb-2">
          Admin
        </h1>
        <p className="text-muted-foreground mb-8">Manage and monitor your app</p>

        <div className="grid gap-4">
          <button
            onClick={() => setLocation("/admin/costs")}
            className="flex items-center gap-4 p-5 rounded-xl border border-border bg-card hover:bg-muted/30 transition-colors text-left group"
            data-testid="tile-cost-analysis"
          >
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <BarChart3 className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground">Cost Analysis</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Track OpenAI, GraphHopper and infrastructure spend per user
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
          </button>
        </div>
      </div>
    </div>
  );
}
