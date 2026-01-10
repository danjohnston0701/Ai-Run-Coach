import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Calendar, Timer, Heart, TrendingUp, Loader } from "lucide-react";
import { toast } from "sonner";
import type { Goal } from "@shared/schema";

interface GoalFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  userId: string;
  editGoal?: Goal;
}

const goalTypes = [
  { value: "event", label: "Event", description: "Race or competition", icon: Calendar },
  { value: "distance_time", label: "Distance/Time", description: "Personal record target", icon: Timer },
  { value: "health_wellbeing", label: "Health & Wellbeing", description: "Fitness or weight goals", icon: Heart },
  { value: "consistency", label: "Consistency", description: "Run frequency target", icon: TrendingUp },
];

const distancePresets = ["5K", "10K", "Half Marathon", "Marathon", "Ultra Marathon"];
const healthPresets = ["Improve fitness", "Improve endurance", "Lose weight", "Build strength", "Better recovery"];

export function GoalFormDialog({ open, onClose, onSuccess, userId, editGoal }: GoalFormDialogProps) {
  const [loading, setLoading] = useState(false);
  const [goalType, setGoalType] = useState(editGoal?.type || "event");
  const [title, setTitle] = useState(editGoal?.title || "");
  const [description, setDescription] = useState(editGoal?.description || "");
  const [targetDate, setTargetDate] = useState(
    editGoal?.targetDate ? new Date(editGoal.targetDate).toISOString().split('T')[0] : ""
  );
  const [distanceTarget, setDistanceTarget] = useState(editGoal?.distanceTarget || "");
  const [timeTargetHours, setTimeTargetHours] = useState(
    editGoal?.timeTargetSeconds ? Math.floor(editGoal.timeTargetSeconds / 3600).toString() : ""
  );
  const [timeTargetMinutes, setTimeTargetMinutes] = useState(
    editGoal?.timeTargetSeconds ? Math.floor((editGoal.timeTargetSeconds % 3600) / 60).toString() : ""
  );
  const [timeTargetSeconds, setTimeTargetSeconds] = useState(
    editGoal?.timeTargetSeconds ? (editGoal.timeTargetSeconds % 60).toString() : ""
  );
  const [healthTarget, setHealthTarget] = useState(editGoal?.healthTarget || "");
  const [targetWeightKg, setTargetWeightKg] = useState(editGoal?.targetWeightKg?.toString() || "");
  const [startingWeightKg, setStartingWeightKg] = useState(editGoal?.startingWeightKg?.toString() || "");
  const [weeklyRunTarget, setWeeklyRunTarget] = useState(editGoal?.weeklyRunTarget?.toString() || "");
  const [eventName, setEventName] = useState(editGoal?.eventName || "");
  const [eventLocation, setEventLocation] = useState(editGoal?.eventLocation || "");
  const [notes, setNotes] = useState(editGoal?.notes || "");

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error("Please enter a goal title");
      return;
    }

    setLoading(true);
    try {
      const timeTargetSecondsTotal = 
        (parseInt(timeTargetHours) || 0) * 3600 + 
        (parseInt(timeTargetMinutes) || 0) * 60 + 
        (parseInt(timeTargetSeconds) || 0);

      const goalData = {
        userId,
        type: goalType,
        title: title.trim(),
        description: description.trim() || null,
        targetDate: targetDate ? new Date(targetDate).toISOString() : null,
        distanceTarget: distanceTarget.trim() || null,
        timeTargetSeconds: timeTargetSecondsTotal > 0 ? timeTargetSecondsTotal : null,
        healthTarget: healthTarget.trim() || null,
        targetWeightKg: targetWeightKg ? parseFloat(targetWeightKg) : null,
        startingWeightKg: startingWeightKg ? parseFloat(startingWeightKg) : null,
        weeklyRunTarget: weeklyRunTarget ? parseInt(weeklyRunTarget) : null,
        eventName: eventName.trim() || null,
        eventLocation: eventLocation.trim() || null,
        notes: notes.trim() || null,
        priority: 1,
      };

      const url = editGoal ? `/api/goals/${editGoal.id}` : "/api/goals";
      const method = editGoal ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(goalData),
      });

      if (!res.ok) {
        throw new Error("Failed to save goal");
      }

      toast.success(editGoal ? "Goal updated!" : "Goal created!");
      onSuccess();
    } catch (error) {
      console.error("Goal save error:", error);
      toast.error("Failed to save goal");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setGoalType("event");
    setTitle("");
    setDescription("");
    setTargetDate("");
    setDistanceTarget("");
    setTimeTargetHours("");
    setTimeTargetMinutes("");
    setTimeTargetSeconds("");
    setHealthTarget("");
    setTargetWeightKg("");
    setStartingWeightKg("");
    setWeeklyRunTarget("");
    setEventName("");
    setEventLocation("");
    setNotes("");
  };

  const handleClose = () => {
    if (!editGoal) resetForm();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            {editGoal ? "Edit Goal" : "Set a New Goal"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-4">
          <div className="space-y-3">
            <Label className="text-sm font-medium">Goal Type</Label>
            <RadioGroup value={goalType} onValueChange={setGoalType} className="grid grid-cols-2 gap-2">
              {goalTypes.map((type) => {
                const Icon = type.icon;
                return (
                  <Label
                    key={type.value}
                    htmlFor={`type-${type.value}`}
                    className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                      goalType === type.value 
                        ? "border-primary bg-primary/10" 
                        : "border-muted hover:border-muted-foreground/50"
                    }`}
                  >
                    <RadioGroupItem value={type.value} id={`type-${type.value}`} className="sr-only" />
                    <Icon className={`w-4 h-4 ${goalType === type.value ? "text-primary" : "text-muted-foreground"}`} />
                    <div>
                      <p className={`text-sm font-medium ${goalType === type.value ? "text-primary" : ""}`}>{type.label}</p>
                      <p className="text-xs text-muted-foreground">{type.description}</p>
                    </div>
                  </Label>
                );
              })}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Goal Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Run my first marathon"
              data-testid="input-goal-title"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="targetDate">Target Date (optional)</Label>
            <Input
              id="targetDate"
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              data-testid="input-goal-date"
            />
          </div>

          {goalType === "event" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="eventName">Event Name</Label>
                <Input
                  id="eventName"
                  value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                  placeholder="e.g., London Marathon 2025"
                  data-testid="input-event-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="eventLocation">Event Location</Label>
                <Input
                  id="eventLocation"
                  value={eventLocation}
                  onChange={(e) => setEventLocation(e.target.value)}
                  placeholder="e.g., London, UK"
                  data-testid="input-event-location"
                />
              </div>
            </>
          )}

          {(goalType === "event" || goalType === "distance_time") && (
            <>
              <div className="space-y-2">
                <Label>Distance Target</Label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {distancePresets.map((preset) => (
                    <Button
                      key={preset}
                      variant={distanceTarget === preset ? "default" : "outline"}
                      size="sm"
                      onClick={() => setDistanceTarget(preset)}
                      className="h-7 text-xs"
                      data-testid={`button-distance-${preset.toLowerCase().replace(/\s/g, '-')}`}
                    >
                      {preset}
                    </Button>
                  ))}
                </div>
                <Input
                  value={distanceTarget}
                  onChange={(e) => setDistanceTarget(e.target.value)}
                  placeholder="Or enter custom distance..."
                  data-testid="input-distance-target"
                />
              </div>

              <div className="space-y-2">
                <Label>Time Target (optional)</Label>
                <div className="flex gap-2 items-center">
                  <Input
                    type="number"
                    min="0"
                    value={timeTargetHours}
                    onChange={(e) => setTimeTargetHours(e.target.value)}
                    placeholder="HH"
                    className="w-16 text-center"
                    data-testid="input-time-hours"
                  />
                  <span className="text-muted-foreground">:</span>
                  <Input
                    type="number"
                    min="0"
                    max="59"
                    value={timeTargetMinutes}
                    onChange={(e) => setTimeTargetMinutes(e.target.value)}
                    placeholder="MM"
                    className="w-16 text-center"
                    data-testid="input-time-minutes"
                  />
                  <span className="text-muted-foreground">:</span>
                  <Input
                    type="number"
                    min="0"
                    max="59"
                    value={timeTargetSeconds}
                    onChange={(e) => setTimeTargetSeconds(e.target.value)}
                    placeholder="SS"
                    className="w-16 text-center"
                    data-testid="input-time-seconds"
                  />
                </div>
              </div>
            </>
          )}

          {goalType === "health_wellbeing" && (
            <>
              <div className="space-y-2">
                <Label>Health Target</Label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {healthPresets.map((preset) => (
                    <Button
                      key={preset}
                      variant={healthTarget === preset ? "default" : "outline"}
                      size="sm"
                      onClick={() => setHealthTarget(preset)}
                      className="h-7 text-xs"
                      data-testid={`button-health-${preset.toLowerCase().replace(/\s/g, '-')}`}
                    >
                      {preset}
                    </Button>
                  ))}
                </div>
                <Input
                  value={healthTarget}
                  onChange={(e) => setHealthTarget(e.target.value)}
                  placeholder="Or enter custom health goal..."
                  data-testid="input-health-target"
                />
              </div>

              {healthTarget.toLowerCase().includes("weight") && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="startingWeight">Starting Weight (kg)</Label>
                    <Input
                      id="startingWeight"
                      type="number"
                      step="0.1"
                      value={startingWeightKg}
                      onChange={(e) => setStartingWeightKg(e.target.value)}
                      placeholder="e.g., 80"
                      data-testid="input-starting-weight"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="targetWeight">Target Weight (kg)</Label>
                    <Input
                      id="targetWeight"
                      type="number"
                      step="0.1"
                      value={targetWeightKg}
                      onChange={(e) => setTargetWeightKg(e.target.value)}
                      placeholder="e.g., 75"
                      data-testid="input-target-weight"
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {goalType === "consistency" && (
            <div className="space-y-2">
              <Label htmlFor="weeklyTarget">Weekly Run Target</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="weeklyTarget"
                  type="number"
                  min="1"
                  max="14"
                  value={weeklyRunTarget}
                  onChange={(e) => setWeeklyRunTarget(e.target.value)}
                  placeholder="e.g., 3"
                  className="w-20"
                  data-testid="input-weekly-target"
                />
                <span className="text-muted-foreground text-sm">runs per week</span>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add any details about your goal..."
              rows={2}
              data-testid="input-goal-description"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Training notes, motivation, etc..."
              rows={2}
              data-testid="input-goal-notes"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} data-testid="button-cancel-goal">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading} data-testid="button-save-goal">
            {loading ? (
              <>
                <Loader className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : editGoal ? (
              "Update Goal"
            ) : (
              "Create Goal"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
