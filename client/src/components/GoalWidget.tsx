import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Target, Plus, Calendar, Trophy, TrendingUp, Heart, Timer, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import type { Goal } from "@shared/schema";
import { GoalFormDialog } from "./GoalFormDialog";

interface GoalWidgetProps {
  userId: string;
}

const goalTypeIcons: Record<string, any> = {
  event: Calendar,
  distance_time: Timer,
  health_wellbeing: Heart,
  consistency: TrendingUp,
};

const goalTypeLabels: Record<string, string> = {
  event: "Event",
  distance_time: "Time Target",
  health_wellbeing: "Health",
  consistency: "Consistency",
};

const goalTypeColors: Record<string, string> = {
  event: "text-purple-400",
  distance_time: "text-blue-400",
  health_wellbeing: "text-green-400",
  consistency: "text-orange-400",
};

function formatDaysRemaining(targetDate: string | Date | null): string {
  if (!targetDate) return "";
  const target = new Date(targetDate);
  const now = new Date();
  const diffTime = target.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) return "Overdue";
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "1 day left";
  if (diffDays < 7) return `${diffDays} days left`;
  if (diffDays < 30) return `${Math.ceil(diffDays / 7)} weeks left`;
  return `${Math.ceil(diffDays / 30)} months left`;
}

export function GoalWidget({ userId }: GoalWidgetProps) {
  const [, setLocation] = useLocation();
  const [showGoalForm, setShowGoalForm] = useState(false);

  const { data: primaryGoal, isLoading, refetch } = useQuery<Goal | null>({
    queryKey: ["primaryGoal", userId],
    queryFn: async () => {
      const res = await fetch(`/api/goals/user/${userId}/primary`);
      if (!res.ok) throw new Error("Failed to fetch primary goal");
      return res.json();
    },
    enabled: !!userId,
  });

  const handleGoalCreated = () => {
    refetch();
    setShowGoalForm(false);
  };

  if (isLoading) {
    return (
      <Card className="bg-card/30 border-primary/20 mb-6" data-testid="goal-widget-loading">
        <CardContent className="p-4">
          <div className="animate-pulse flex items-center gap-3">
            <div className="w-10 h-10 bg-muted rounded-lg"></div>
            <div className="flex-1">
              <div className="h-4 bg-muted rounded w-24 mb-2"></div>
              <div className="h-3 bg-muted rounded w-32"></div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        {primaryGoal ? (
          <Card 
            className="bg-gradient-to-br from-card/50 to-primary/5 border-primary/30 cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => setLocation("/goals")}
            data-testid="goal-widget"
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg bg-primary/20 ${goalTypeColors[primaryGoal.type]}`}>
                    {(() => {
                      const Icon = goalTypeIcons[primaryGoal.type] || Target;
                      return <Icon className="w-5 h-5" />;
                    })()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium uppercase tracking-wide ${goalTypeColors[primaryGoal.type]}`}>
                        {goalTypeLabels[primaryGoal.type] || "Goal"}
                      </span>
                      {primaryGoal.targetDate && (
                        <span className="text-xs text-muted-foreground">
                          • {formatDaysRemaining(primaryGoal.targetDate)}
                        </span>
                      )}
                    </div>
                    <h3 className="font-display font-bold text-white text-sm mt-0.5">
                      {primaryGoal.title}
                    </h3>
                    {primaryGoal.distanceTarget && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {primaryGoal.distanceTarget}
                        {primaryGoal.timeTargetSeconds && (
                          <span> • Target: {Math.floor(primaryGoal.timeTargetSeconds / 3600)}:{String(Math.floor((primaryGoal.timeTargetSeconds % 3600) / 60)).padStart(2, '0')}:{String(primaryGoal.timeTargetSeconds % 60).padStart(2, '0')}</span>
                        )}
                      </p>
                    )}
                    {primaryGoal.healthTarget && (
                      <p className="text-xs text-muted-foreground mt-0.5">{primaryGoal.healthTarget}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {primaryGoal.progressPercent !== null && primaryGoal.progressPercent > 0 && (
                    <div className="flex items-center gap-1">
                      <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${primaryGoal.progressPercent}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">{primaryGoal.progressPercent}%</span>
                    </div>
                  )}
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card 
            className="bg-card/30 border-dashed border-muted-foreground/30 cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => setShowGoalForm(true)}
            data-testid="goal-widget-empty"
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-muted/50">
                    <Trophy className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <h3 className="font-display font-medium text-muted-foreground text-sm">
                      No active goal
                    </h3>
                    <p className="text-xs text-muted-foreground/70">
                      Set a goal to track your progress
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 hover:bg-primary/20"
                  data-testid="button-add-goal"
                >
                  <Plus className="w-4 h-4 text-primary" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </motion.div>

      <GoalFormDialog 
        open={showGoalForm}
        onClose={() => setShowGoalForm(false)}
        onSuccess={handleGoalCreated}
        userId={userId}
      />
    </>
  );
}
