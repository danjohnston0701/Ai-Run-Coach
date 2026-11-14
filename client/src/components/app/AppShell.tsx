import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  CalendarRange,
  ChartNoAxesCombined,
  Footprints,
  LayoutDashboard,
  LogOut,
  Map,
  Menu,
  Settings,
  Target,
  Users,
  UsersRound,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/queryClient";
import type { Notification } from "@/lib/types";
import { Avatar } from "./kit";
import { Logo } from "@/components/brand/Logo";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/runs", label: "Runs", icon: Footprints },
  { href: "/training", label: "Training", icon: CalendarRange },
  { href: "/my-data", label: "My Data", icon: ChartNoAxesCombined },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/group-runs", label: "Group Runs", icon: UsersRound },
  { href: "/friends", label: "Friends", icon: Users },
  { href: "/routes", label: "Routes", icon: Map },
];

export function useNotifications() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ["/api/notifications", userId],
    queryFn: () => api<Notification[]>("GET", "/api/notifications"),
    enabled: !!userId,
    refetchInterval: 120_000,
  });
}

function NavItem({ href, label, icon: Icon, active, onClick, badge }: any) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
        active ? "bg-brand/10 text-brand" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
      )}
    >
      <Icon className={cn("h-[18px] w-[18px]", active ? "text-brand" : "text-ink-3 group-hover:text-ink-2")} />
      <span className="flex-1">{label}</span>
      {badge ? (
        <span className="rounded-full bg-orange px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">{badge > 99 ? "99+" : badge}</span>
      ) : null}
    </Link>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const [location] = useLocation();
  const { user, signOut } = useAuth();
  const notifications = useNotifications();
  const unread = (notifications.data ?? []).filter((n) => !n.read).length;
  const isActive = (href: string) => location === href || location.startsWith(href + "/");

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-6 pt-6">
        <Link href="/dashboard" onClick={onNavigate}>
          <Logo />
        </Link>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
        {NAV.map((item) => (
          <NavItem key={item.href} {...item} active={isActive(item.href)} onClick={onNavigate} />
        ))}
        <div className="my-3 h-px bg-line/70" />
        <NavItem href="/notifications" label="Notifications" icon={Bell} active={isActive("/notifications")} onClick={onNavigate} badge={unread} />
        <NavItem href="/settings" label="Profile & settings" icon={Settings} active={isActive("/settings")} onClick={onNavigate} />
      </nav>
      <div className="border-t border-line/70 p-3">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <Avatar name={user?.name} pic={user?.profilePic} size={36} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-ink">{user?.name ?? " "}</div>
            <div className="truncate text-xs text-ink-3">{user?.email ?? ""}</div>
          </div>
          <button
            onClick={signOut}
            className="rounded-lg p-2 text-ink-3 hover:bg-surface-2 hover:text-ink"
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();
  const notifications = useNotifications();
  const unread = (notifications.data ?? []).filter((n) => !n.read).length;

  useEffect(() => setOpen(false), [location]);

  return (
    <div className="min-h-screen bg-root">
      {/* Ambient brand glow */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/3 h-[480px] w-[720px] rounded-full bg-brand/[0.06] blur-[120px]" />
        <div className="absolute -bottom-40 right-0 h-[420px] w-[600px] rounded-full bg-brand-green/[0.04] blur-[120px]" />
      </div>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-line/70 bg-surface/80 backdrop-blur-xl lg:block">
        <SidebarContent />
      </aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line/70 bg-root/85 px-4 backdrop-blur-xl lg:hidden">
        <button onClick={() => setOpen(true)} className="-ml-2 rounded-lg p-2 text-ink-2 hover:text-ink" aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </button>
        <Link href="/dashboard">
          <Logo compact />
        </Link>
        <Link href="/notifications" className="relative -mr-2 rounded-lg p-2 text-ink-2 hover:text-ink" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {unread > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-orange" />}
        </Link>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-line bg-surface shadow-2xl">
            <button onClick={() => setOpen(false)} className="absolute right-3 top-5 rounded-lg p-2 text-ink-3 hover:text-ink" aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
            <SidebarContent onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      <main className="relative lg:pl-64">
        <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 sm:px-6 sm:pt-8 lg:px-10 lg:pt-10">{children}</div>
      </main>
    </div>
  );
}
