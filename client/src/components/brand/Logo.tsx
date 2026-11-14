import { cn } from "@/lib/utils";

/** App icon + wordmark ("Ai Run Coach", as the apps spell it). */
export function Logo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <img src="/marketing/app-icon.png" alt="" width={compact ? 28 : 34} height={compact ? 28 : 34} className="rounded-[9px] shadow-[0_0_24px_-4px_rgba(0,212,255,0.6)]" />
      <span className={cn("font-bold tracking-tight text-ink", compact ? "text-[15px]" : "text-[17px]")}>
        Ai Run <span className="text-gradient">Coach</span>
      </span>
    </span>
  );
}

export const APP_STORE_URL = "https://apps.apple.com/nz/app/ai-run-coach/id6762181649";
export const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=live.airuncoach.airuncoach";
export const GARMIN_STORE_URL = "https://apps.garmin.com/en-NZ/apps/91452a05-d077-4707-a9a3-0e98277f6017";
