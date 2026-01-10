import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft, Plus, Calendar, Timer, Heart, TrendingUp, Target, 
  MoreVertical, CheckCircle, XCircle, Trash2, Edit, Trophy
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { GoalFormDialog } from "@/components/GoalFormDialog";
import type { Goal } from "@shared/schema";

const goalTypeIcons: Record<string, any> = {
  event: Calendar,
  distance_time: Timer,
  health_wellbeing: Heart,
  consistency: TrendingUp,
};

const goalTypeLabels: Record<string, string> = {
  event: "Event",
  distance_time: "Distance/Time",
  health_wellbeing: "Health & Wellbeing",
  consistency: "Consistency",
};

const goalTypeColors: Record<string, { bg: string; text: string; border: string }> = {
  event: { bg: "bg-purple-500/20", text: "text-purple-400", border: "border-purple-500/30" },
  distance_time: { bg: "bg-blue-500/20", text: "text-blue-400", border: "border-blue-500/30" },
  health_wellbeing: { bg: "bg-green-500/20", text: "text-green-400", border: "border-green-500/30" },
  consistency: { bg: "bg-orange-500/20", text: "text-orange-400", border: "border-orange-500/30" },
};

function formatDaysRemaining(targetDate: string | Date | null): string {
  if (!targetDate) return "";
  const target = new Date(targetDate);
  const now = new Date();
  const diffTime = target.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) return `${Math.abs(diffDays)} days overdue`;
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "1 day left";
  if (diffDays < 7) return `${diffDays} days left`;
  if (diffDays < 30) return `${Math.ceil(diffDays / 7)} weeks left`;
  return `${Math.ceil(diffDays / 30)} months left`;
}

function formatTimeTarget(seconds: number | null): string {
  if (!seconds) return "";
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) {
    return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export default function Goals() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [deletingGoalId, setDeletingGoalId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("active");

  const profile = JSON.parse(localStorage.getItem("userProfile") || "{}");
  const userId = profile?.id;

  const { data: goals = [], isLoading, refetch } = useQuery<Goal[]>({
    queryKey: ["goals", userId],
    queryFn: async () => {
      const res = await fetch(`/api/goals/user/${userId}`);
      if (!res.ok) throw new Error("Failed to fetch goals");
      return res.json();
    },
    enabled: !!userId,
  });

  const activeGoals = goals.filter(g => g.status === "active");
  const completedGoals = goals.filter(g => g.status === "completed");
  const abandonedGoals = goals.filter(g => g.status === "abandoned");

  const completeGoalMutation = useMutation({
    mutationFn: async (goalId: string) => {
      const res = await fetch(`/api/goals/${goalId}/complete`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to complete goal");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Goal completed! Great job!");
      queryClient.invalidateQueries({ queryKey: ["goals"] });
      queryClient.invalidateQueries({ queryKey: ["primaryGoal"] });
    },
    onError: () => {
      toast.error("Failed to complete goal");
    },
  });

  const abandonGoalMutation = useMutation({
    mutationFn: async (goalId: string) => {
      const res = await fetch(`/api/goals/${goalId}/abandon`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to abandon goal");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Goal abandoned");
      queryClient.invalidateQueries({ queryKey: ["goals"] });
      queryClient.invalidateQueries({ queryKey: ["primaryGoal"] });
    },
    onError: () => {
      toast.error("Failed to abandon goal");
    },
  });

  const deleteGoalMutation = useMutation({
    mutationFn: async (goalId: string) => {
      const res = await fetch(`/api/goals/${goalId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete goal");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Goal deleted");
      setDeletingGoalId(null);
      queryClient.invalidateQueries({ queryKey: ["goals"] });
      queryClient.invalidateQueries({ queryKey: ["primaryGoal"] });
    },
    onError: () => {
      toast.error("Failed to delete goal");
    },
  });

  const handleGoalCreated = () => {
    refetch();
    setShowGoalForm(false);
    setEditingGoal(null);
  };

  const GoalCard = ({ goal }: { goal: Goal }) => {
    const colors = goalTypeColors[goal.type] || goalTypeColors.event;
    const Icon = goalTypeIcons[goal.type] || Target;

    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
      >
        <Card className={`bg-card/50 ${colors.border} hover:bg-card/70 transition-colors`}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 flex-1">
                <div className={`p-2 rounded-lg ${colors.bg}`}>
                  <Icon className={`w-5 h-5 ${colors.text}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className={`${colors.text} ${colors.border} text-xs`}>
                      {goalTypeLabels[goal.type]}
                    </Badge>
                    {goal.targetDate && (
                      <span className={`text-xs ${
                        new Date(goal.targetDate) < new Date() ? "text-red-400" : "text-muted-foreground"
                      }`}>
                        {formatDaysRemaining(goal.targetDate)}
                      </span>
                    )}
                    {goal.status === "completed" && (
                      <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                        Completed
                      </Badge>
                    )}
                    {goal.status === "abandoned" && (
                      <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30">
                        Abandoned
                      </Badge>
                    )}
                  </div>
                  <h3 className="font-display font-bold text-white mt-1">{goal.title}</h3>
                  
                  {goal.description && (
                    <p className="text-sm text-muted-foreground mt-1">{goal.description}</p>
                  )}

                  <div className="flex flex-wrap gap-2 mt-2 text-xs text-muted-foreground">
                    {goal.eventName && (
                      <span className="bg-muted/30 px-2 py-0.5 rounded">{goal.eventName}</span>
                    )}
                    {goal.eventLocation && (
                      <span className="bg-muted/30 px-2 py-0.5 rounded">{goal.eventLocation}</span>
                    )}
                    {goal.distanceTarget && (
                      <span className="bg-muted/30 px-2 py-0.5 rounded">{goal.distanceTarget}</span>
                    )}
                    {goal.timeTargetSeconds && (
                      <span className="bg-muted/30 px-2 py-0.5 rounded">
                        Target: {formatTimeTarget(goal.timeTargetSeconds)}
                      </span>
                    )}
                    {goal.healthTarget && (
                      <span className="bg-muted/30 px-2 py-0.5 rounded">{goal.healthTarget}</span>
                    )}
                    {goal.targetWeightKg && (
                      <span className="bg-muted/30 px-2 py-0.5 rounded">
                        Target: {goal.targetWeightKg}kg
                      </span>
                    )}
                    {goal.weeklyRunTarget && (
                      <span className="bg-muted/30 px-2 py-0.5 rounded">
                        {goal.weeklyRunTarget}x per week
                      </span>
                    )}
                  </div>

                  {goal.progressPercent !== null && goal.progressPercent > 0 && (
                    <div className="flex items-center gap-2 mt-3">
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full ${
                            goal.status === "completed" ? "bg-green-500" : "bg-primary"
                          }`}
                          style={{ width: `${goal.progressPercent}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground w-10 text-right">
                        {goal.progressPercent}%
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {goal.status === "active" && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" data-testid={`goal-menu-${goal.id}`}>
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setEditingGoal(goal)}>
                      <Edit className="w-4 h-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => completeGoalMutation.mutate(goal.id)}>
                      <CheckCircle className="w-4 h-4 mr-2 text-green-400" />
                      Mark Complete
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => abandonGoalMutation.mutate(goal.id)}>
                      <XCircle className="w-4 h-4 mr-2 text-yellow-400" />
                      Abandon
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => setDeletingGoalId(goal.id)}
                      className="text-red-400 focus:text-red-400"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {goal.status !== "active" && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-red-400 hover:text-red-300"
                  onClick={() => setDeletingGoalId(goal.id)}
                  data-testid={`delete-goal-${goal.id}`}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <header className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation("/")}
          data-testid="button-back"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-display font-bold text-primary uppercase tracking-wider">
            Goals
          </h1>
          <p className="text-sm text-muted-foreground">Track your running objectives</p>
        </div>
        <Button onClick={() => setShowGoalForm(true)} data-testid="button-new-goal">
          <Plus className="w-4 h-4 mr-2" />
          New Goal
        </Button>
      </header>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="active" className="relative" data-testid="tab-active">
            Active
            {activeGoals.length > 0 && (
              <span className="ml-1.5 text-xs bg-primary/20 text-primary px-1.5 rounded-full">
                {activeGoals.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="completed" data-testid="tab-completed">
            Completed
            {completedGoals.length > 0 && (
              <span className="ml-1.5 text-xs bg-green-500/20 text-green-400 px-1.5 rounded-full">
                {completedGoals.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="abandoned" data-testid="tab-abandoned">
            Abandoned
            {abandonedGoals.length > 0 && (
              <span className="ml-1.5 text-xs bg-gray-500/20 text-gray-400 px-1.5 rounded-full">
                {abandonedGoals.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-3">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <Card key={i} className="bg-card/30">
                  <CardContent className="p-4">
                    <div className="animate-pulse flex gap-3">
                      <div className="w-10 h-10 bg-muted rounded-lg"></div>
                      <div className="flex-1">
                        <div className="h-4 bg-muted rounded w-20 mb-2"></div>
                        <div className="h-5 bg-muted rounded w-32 mb-2"></div>
                        <div className="h-3 bg-muted rounded w-48"></div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : activeGoals.length === 0 ? (
            <Card className="bg-card/30 border-dashed">
              <CardContent className="p-8 text-center">
                <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-display font-bold text-lg mb-2">No active goals</h3>
                <p className="text-muted-foreground text-sm mb-4">
                  Set a goal to track your progress and get personalized coaching
                </p>
                <Button onClick={() => setShowGoalForm(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Your First Goal
                </Button>
              </CardContent>
            </Card>
          ) : (
            <AnimatePresence mode="popLayout">
              {activeGoals.map((goal) => (
                <GoalCard key={goal.id} goal={goal} />
              ))}
            </AnimatePresence>
          )}
        </TabsContent>

        <TabsContent value="completed" className="space-y-3">
          {completedGoals.length === 0 ? (
            <Card className="bg-card/30 border-dashed">
              <CardContent className="p-8 text-center">
                <CheckCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-display font-bold text-lg mb-2">No completed goals yet</h3>
                <p className="text-muted-foreground text-sm">
                  Complete your active goals to see them here
                </p>
              </CardContent>
            </Card>
          ) : (
            <AnimatePresence mode="popLayout">
              {completedGoals.map((goal) => (
                <GoalCard key={goal.id} goal={goal} />
              ))}
            </AnimatePresence>
          )}
        </TabsContent>

        <TabsContent value="abandoned" className="space-y-3">
          {abandonedGoals.length === 0 ? (
            <Card className="bg-card/30 border-dashed">
              <CardContent className="p-8 text-center">
                <XCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-display font-bold text-lg mb-2">No abandoned goals</h3>
                <p className="text-muted-foreground text-sm">
                  Goals you abandon will appear here
                </p>
              </CardContent>
            </Card>
          ) : (
            <AnimatePresence mode="popLayout">
              {abandonedGoals.map((goal) => (
                <GoalCard key={goal.id} goal={goal} />
              ))}
            </AnimatePresence>
          )}
        </TabsContent>
      </Tabs>

      <GoalFormDialog
        open={showGoalForm || !!editingGoal}
        onClose={() => {
          setShowGoalForm(false);
          setEditingGoal(null);
        }}
        onSuccess={handleGoalCreated}
        userId={userId}
        editGoal={editingGoal || undefined}
      />

      <AlertDialog open={!!deletingGoalId} onOpenChange={() => setDeletingGoalId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Goal</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this goal? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingGoalId && deleteGoalMutation.mutate(deletingGoalId)}
              className="bg-red-500 hover:bg-red-600"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
