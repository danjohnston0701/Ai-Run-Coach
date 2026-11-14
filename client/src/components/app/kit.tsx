import { type ReactNode } from "react";
import { Link } from "wouter";
import { AlertTriangle, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
  back,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className="mb-6 sm:mb-8">
      {back && (
        <Link href={back.href} className="mb-3 inline-flex items-center gap-1 text-sm text-ink-3 hover:text-brand">
          <ChevronRight className="h-4 w-4 rotate-180" /> {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-ink-2 sm:text-base">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function Panel({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("panel", className)} {...rest}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-3", className)}>
      <h2 className="text-base font-semibold text-ink sm:text-lg">{children}</h2>
      {action}
    </div>
  );
}

const TONES = {
  cyan: "from-brand/15 to-brand/5 border-brand/25",
  green: "from-brand-green/15 to-brand-green/5 border-brand-green/25",
  orange: "from-orange/15 to-orange/5 border-orange/25",
  violet: "from-violet/20 to-violet/5 border-violet/30",
  amber: "from-amber/15 to-amber/5 border-amber/25",
  red: "from-danger/15 to-danger/5 border-danger/25",
  plain: "from-surface-2 to-surface-2 border-line",
} as const;
export type Tone = keyof typeof TONES;

/** Tinted stat tile — the run summary's Distance / Duration / Pace / Cadence tiles. */
export function StatTile({
  label,
  value,
  unit,
  tone = "plain",
  hint,
  icon,
  className,
  size = "md",
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  tone?: Tone;
  hint?: ReactNode;
  icon?: ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <div className={cn("rounded-2xl border bg-gradient-to-br p-4", TONES[tone], className)}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-ink-2">
        {icon}
        {label}
      </div>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span
          className={cn(
            "num font-bold text-ink",
            size === "lg" ? "text-[clamp(1.5rem,2.4vw,2.25rem)]" : size === "sm" ? "text-lg" : "text-2xl sm:text-[28px]",
          )}
        >
          {value}
        </span>
        {unit && <span className="text-sm text-ink-2">{unit}</span>}
      </div>
      {hint && <div className="mt-1 text-xs text-ink-3">{hint}</div>}
    </div>
  );
}

/** Small label/value row used in data lists. */
export function KV({ label, value, className }: { label: ReactNode; value: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-4 py-2.5 text-sm", className)}>
      <span className="text-ink-2">{label}</span>
      <span className="num text-right font-medium text-ink">{value}</span>
    </div>
  );
}

export function Pill({ children, tone = "plain", className }: { children: ReactNode; tone?: Tone; className?: string }) {
  const map: Record<Tone, string> = {
    cyan: "text-brand border-brand/40 bg-brand/10",
    green: "text-brand-green border-brand-green/40 bg-brand-green/10",
    orange: "text-orange border-orange/40 bg-orange/10",
    violet: "text-violet border-violet/40 bg-violet/10",
    amber: "text-amber border-amber/40 bg-amber/10",
    red: "text-danger border-danger/40 bg-danger/10",
    plain: "text-ink-2 border-line bg-surface-2",
  };
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide", map[tone], className)}>
      {children}
    </span>
  );
}

export function Loading({ label = "Loading…", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex items-center justify-center gap-2 py-16 text-sm text-ink-3", className)}>
      <Loader2 className="h-4 w-4 animate-spin text-brand" /> {label}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-surface-2/80", className)} />;
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : "Something went wrong.";
  return (
    <Panel className="panel-pad flex flex-col items-start gap-3 border-danger/30">
      <div className="flex items-center gap-2 font-semibold text-danger">
        <AlertTriangle className="h-4 w-4" /> Couldn’t load this
      </div>
      <p className="text-sm text-ink-2">{msg}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </Panel>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <Panel className={cn("flex flex-col items-center px-6 py-12 text-center", className)}>
      {icon && <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-brand/10 text-brand">{icon}</div>}
      <div className="text-base font-semibold text-ink">{title}</div>
      {children && <div className="mt-1.5 max-w-md text-sm text-ink-2">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </Panel>
  );
}

export function Avatar({ name, pic, size = 40, className }: { name?: string | null; pic?: string | null; size?: number; className?: string }) {
  const initials = (name ?? "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  const src = pic ? (pic.startsWith("data:") || pic.startsWith("http") || pic.startsWith("/") && pic.length < 300 ? pic : `data:image/jpeg;base64,${pic}`) : null;
  return (
    <div
      className={cn("relative shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-brand/40 to-brand-green/30 ring-1 ring-white/10", className)}
      style={{ width: size, height: size }}
    >
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="grid h-full w-full place-items-center font-semibold text-ink" style={{ fontSize: size * 0.38 }}>
          {initials || "?"}
        </div>
      )}
    </div>
  );
}

/** Underlined tab bar, like the Run Insights tabs in the apps. */
export function TabBar<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { id: T; label: ReactNode; hidden?: boolean }[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0", className)}>
      <div role="tablist" className="flex min-w-max gap-1 border-b border-line">
        {tabs
          .filter((t) => !t.hidden)
          .map((t) => {
            const active = t.id === value;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                onClick={() => onChange(t.id)}
                className={cn(
                  "relative px-3.5 pb-3 pt-1 text-sm font-medium transition-colors",
                  active ? "text-brand" : "text-ink-3 hover:text-ink",
                )}
              >
                {t.label}
                {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand" />}
              </button>
            );
          })}
      </div>
    </div>
  );
}

/** Segmented control (period pickers etc.). */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex rounded-xl border border-line bg-surface p-1", className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
            o.value === value ? "bg-brand text-root" : "text-ink-2 hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ProgressBar({ value, className, tone = "cyan" }: { value: number; className?: string; tone?: "cyan" | "green" | "orange" }) {
  const v = Math.max(0, Math.min(100, value || 0));
  const color = tone === "green" ? "bg-brand-green" : tone === "orange" ? "bg-orange" : "bg-gradient-to-r from-brand to-brand-green";
  return (
    <div className={cn("h-2 overflow-hidden rounded-full bg-surface-3/60", className)}>
      <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${v}%` }} />
    </div>
  );
}

export function Field({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-3">{hint}</span>}
    </label>
  );
}

export const selectClass =
  "h-11 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm text-ink focus:border-brand/70 focus:outline-none focus:ring-2 focus:ring-brand/25";
