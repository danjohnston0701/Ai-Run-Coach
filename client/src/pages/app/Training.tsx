import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { CalendarRange, ChevronRight, Plus, Sparkles } from "lucide-react";
import { api } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import type { TrainingPlan } from "@/lib/types";
import { fmtClock, fmtDate, fmtPlanDate, goalTypeLabel, titleCase } from "@/lib/format";
import { EmptyState, ErrorState, PageHeader, Panel, Pill, ProgressBar, Segmented, Skeleton } from "@/components/app/kit";
import { Button } from "@/components/ui/button";

type Status = "active" | "paused" | "completed" | "cancelled";

function PlanCard({ plan }: { plan: TrainingPlan }) {
  const total = plan.totalWorkouts ?? 0;
  const done = plan.completedWorkouts ?? 0;
  return (
    <Link href={`/training/${plan.id}`} className="panel group flex flex-col p-5 transition-colors hover:border-brand/40">
      <div className="flex items-start justify-between gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-brand/25 to-brand-green/15 text-brand">
          <CalendarRange className="h-5 w-5" />
        </div>
        <Pill tone={plan.status === "active" ? "green" : plan.status === "paused" ? "amber" : "plain"}>{plan.status}</Pill>
      </div>
      <div className="mt-4 text-lg font-bold text-ink group-hover:text-brand">
        {goalTypeLabel(plan.goalType)}
        {plan.goalType === "custom" && plan.targetDistance ? ` · ${plan.targetDistance} km` : ""}
      </div>
      <div className="mt-0.5 text-sm text-ink-2">
        {[plan.targetTime ? `Target ${fmtClock(plan.targetTime)}` : null, plan.targetDate ? `Race ${fmtPlanDate(plan.targetDate, { day: "numeric", month: "short", year: "numeric" })}` : null, `${plan.totalWeeks} weeks`]
          .filter(Boolean)
          .join(" · ")}
      </div>
      <ProgressBar className="mt-5" value={total ? (done / total) * 100 : 0} />
      <div className="mt-2 flex items-center justify-between text-xs text-ink-3">
        <span>
          {done}/{total} sessions · {titleCase(plan.experienceLevel)}
        </span>
        <span className="inline-flex items-center gap-0.5">
          Started {fmtDate(plan.createdAt, { day: "numeric", month: "short" })} <ChevronRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </Link>
  );
}

export default function Training() {
  const { userId, user } = useAuth();
  const [status, setStatus] = useState<Status>("active");
  const q = useQuery({
    queryKey: ["plans", userId, status],
    queryFn: () => api<TrainingPlan[]>("GET", `/api/training-plans/${userId}?status=${status}`),
    enabled: !!userId,
  });
  const plans = q.data ?? [];
  const plansAllowed = user?.aiPlansEnabled !== false;

  return (
    <div>
      <PageHeader
        title="Training"
        subtitle="Adaptive AI training plans, built from your real running and adjusted after every session."
        actions={
          plansAllowed ? (
            <Button asChild>
              <Link href="/training/new">
                <Plus /> New plan
              </Link>
            </Button>
          ) : null
        }
      />
      <Segmented<Status>
        className="mb-5"
        value={status}
        onChange={setStatus}
        options={[
          { value: "active", label: "Active" },
          { value: "paused", label: "Paused" },
          { value: "completed", label: "Completed" },
          { value: "cancelled", label: "Ended" },
        ]}
      />
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      ) : plans.length === 0 ? (
        status === "active" ? (
          <EmptyState
            icon={<Sparkles className="h-5 w-5" />}
            title="No active plan"
            action={
              plansAllowed ? (
                <Button asChild>
                  <Link href="/training/new">
                    <Plus /> Build my plan
                  </Link>
                </Button>
              ) : undefined
            }
          >
            Tell your coach what you’re training for. It reads your last 30 days of running, sets a safe starting load and writes a week-by-week plan with the paces and heart-rate zones that fit you.
          </EmptyState>
        ) : (
          <Panel className="panel-pad text-sm text-ink-3">No {status === "cancelled" ? "ended" : status} plans.</Panel>
        )
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {plans.map((p) => (
            <PlanCard key={p.id} plan={p} />
          ))}
        </div>
      )}
    </div>
  );
}
