import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Thermometer, Droplets, Wind, Sun, Cloud, CloudRain, TrendingUp, TrendingDown, BarChart3, Loader2, Clock } from "lucide-react";
import { motion } from "framer-motion";

interface WeatherImpactData {
  hasEnoughData: boolean;
  message?: string;
  runsAnalyzed: number;
  overallAvgPace?: number;
  temperatureAnalysis?: Array<{
    range: string;
    label: string;
    avgPace: number | null;
    runCount: number;
    paceVsAvg: number | null;
  }>;
  humidityAnalysis?: Array<{
    range: string;
    label: string;
    avgPace: number | null;
    runCount: number;
    paceVsAvg: number | null;
  }>;
  windAnalysis?: Array<{
    range: string;
    label: string;
    avgPace: number | null;
    runCount: number;
    paceVsAvg: number | null;
  }>;
  conditionAnalysis?: Array<{
    condition: string;
    avgPace: number;
    runCount: number;
    paceVsAvg: number;
  }>;
  timeOfDayAnalysis?: Array<{
    range: string;
    label: string;
    avgPace: number | null;
    runCount: number;
    paceVsAvg: number | null;
  }>;
  insights?: {
    bestCondition: { label: string; type: string; improvement: string | null } | null;
    worstCondition: { label: string; type: string; slowdown: string | null } | null;
  };
}

function formatPace(secondsPerKm: number): string {
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = Math.round(secondsPerKm % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function PaceBar({ paceVsAvg, label, runCount }: { paceVsAvg: number | null; label: string; runCount: number }) {
  if (paceVsAvg === null) return null;
  
  const isFaster = paceVsAvg < 0;
  const absValue = Math.abs(paceVsAvg);
  const barWidth = Math.min(absValue * 5, 100);
  
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-muted-foreground">{runCount} runs</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-6 bg-white/5 rounded-lg overflow-hidden relative">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-px h-full bg-white/20" />
          </div>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${barWidth}%` }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className={`h-full ${isFaster ? 'bg-green-500/60 ml-auto mr-[50%]' : 'bg-red-500/60 ml-[50%]'}`}
            style={{ 
              marginLeft: isFaster ? 'auto' : '50%',
              marginRight: isFaster ? '50%' : 'auto',
            }}
          />
        </div>
        <span className={`text-xs font-medium text-right ${isFaster ? 'text-green-400' : 'text-red-400'}`}>
          {absValue.toFixed(1)}% {isFaster ? 'faster' : 'slower'}
        </span>
      </div>
    </div>
  );
}

function ConditionIcon({ condition }: { condition: string }) {
  const lowerCondition = condition.toLowerCase();
  if (lowerCondition.includes('rain')) return <CloudRain className="w-4 h-4 text-blue-400" />;
  if (lowerCondition.includes('cloud')) return <Cloud className="w-4 h-4 text-gray-400" />;
  return <Sun className="w-4 h-4 text-yellow-400" />;
}

export default function WeatherImpactAnalysis({ userId }: { userId: string }) {
  const { data, isLoading, error } = useQuery<WeatherImpactData>({
    queryKey: ['weather-impact', userId],
    queryFn: async () => {
      const response = await fetch(`/api/users/${userId}/weather-impact`);
      if (!response.ok) throw new Error('Failed to fetch weather impact data');
      return response.json();
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 5,
  });

  if (isLoading) {
    return (
      <Card className="bg-gradient-to-br from-blue-900/30 to-purple-900/30 border-blue-500/20 backdrop-blur-sm">
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
          <span className="ml-2 text-muted-foreground">Analyzing weather impact...</span>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="bg-gradient-to-br from-gray-900/30 to-gray-800/30 border-white/10 backdrop-blur-sm">
        <CardContent className="p-6 text-center text-muted-foreground">
          Unable to load weather impact analysis
        </CardContent>
      </Card>
    );
  }

  if (!data.hasEnoughData) {
    return (
      <Card className="bg-gradient-to-br from-blue-900/30 to-purple-900/30 border-blue-500/20 backdrop-blur-sm">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <BarChart3 className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest">Weather Impact</div>
              <div className="text-lg font-display font-bold text-white">Not Enough Data</div>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {data.message || "Complete more runs with weather data to see how conditions affect your performance."}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Runs analyzed: {data.runsAnalyzed} (need at least 3)
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="weather-impact-analysis">
      <Card className="bg-gradient-to-br from-blue-900/30 to-purple-900/30 border-blue-500/20 backdrop-blur-sm">
        <CardContent className="p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <BarChart3 className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest">Weather Impact Analysis</div>
              <div className="text-lg font-display font-bold text-white">
                Based on {data.runsAnalyzed} runs
              </div>
            </div>
          </div>

          {data.insights && (data.insights.bestCondition || data.insights.worstCondition) && (
            <div className="grid grid-cols-2 gap-3 mb-4">
              {data.insights.bestCondition && (
                <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-xl">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="w-4 h-4 text-green-400" />
                    <span className="text-[10px] text-green-400 uppercase tracking-wider">Best Condition</span>
                  </div>
                  <div className="text-sm font-medium text-white">{data.insights.bestCondition.label}</div>
                  {data.insights.bestCondition.improvement && (
                    <div className="text-xs text-green-400 mt-1">
                      {data.insights.bestCondition.improvement}% faster
                    </div>
                  )}
                </div>
              )}
              {data.insights.worstCondition && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingDown className="w-4 h-4 text-red-400" />
                    <span className="text-[10px] text-red-400 uppercase tracking-wider">Toughest Condition</span>
                  </div>
                  <div className="text-sm font-medium text-white">{data.insights.worstCondition.label}</div>
                  {data.insights.worstCondition.slowdown && (
                    <div className="text-xs text-red-400 mt-1">
                      {data.insights.worstCondition.slowdown}% slower
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {data.overallAvgPace && (
            <div className="text-center py-2 border-t border-white/10">
              <span className="text-xs text-muted-foreground">Overall Average Pace: </span>
              <span className="text-sm font-bold text-white">{formatPace(data.overallAvgPace)} /km</span>
            </div>
          )}
        </CardContent>
      </Card>

      {data.temperatureAnalysis && data.temperatureAnalysis.length > 0 && (
        <Card className="bg-gradient-to-br from-orange-900/20 to-gray-900/30 border-orange-500/20 backdrop-blur-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Thermometer className="w-4 h-4 text-orange-400" />
              <span className="text-sm font-bold text-white uppercase tracking-wider">Temperature</span>
            </div>
            <div className="space-y-3">
              {data.temperatureAnalysis.map((temp) => (
                <PaceBar key={temp.range} paceVsAvg={temp.paceVsAvg} label={temp.label} runCount={temp.runCount} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {data.humidityAnalysis && data.humidityAnalysis.length > 0 && (
        <Card className="bg-gradient-to-br from-cyan-900/20 to-gray-900/30 border-cyan-500/20 backdrop-blur-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Droplets className="w-4 h-4 text-cyan-400" />
              <span className="text-sm font-bold text-white uppercase tracking-wider">Humidity</span>
            </div>
            <div className="space-y-3">
              {data.humidityAnalysis.map((humid) => (
                <PaceBar key={humid.range} paceVsAvg={humid.paceVsAvg} label={humid.label} runCount={humid.runCount} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {data.windAnalysis && data.windAnalysis.length > 0 && (
        <Card className="bg-gradient-to-br from-gray-800/30 to-gray-900/30 border-gray-500/20 backdrop-blur-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Wind className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-bold text-white uppercase tracking-wider">Wind</span>
            </div>
            <div className="space-y-3">
              {data.windAnalysis.map((wind) => (
                <PaceBar key={wind.range} paceVsAvg={wind.paceVsAvg} label={wind.label} runCount={wind.runCount} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {data.conditionAnalysis && data.conditionAnalysis.length > 0 && (
        <Card className="bg-gradient-to-br from-yellow-900/20 to-gray-900/30 border-yellow-500/20 backdrop-blur-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Sun className="w-4 h-4 text-yellow-400" />
              <span className="text-sm font-bold text-white uppercase tracking-wider">Conditions</span>
            </div>
            <div className="space-y-3">
              {data.conditionAnalysis.map((cond) => (
                <div key={cond.condition} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ConditionIcon condition={cond.condition} />
                    <span className="text-sm text-muted-foreground">{cond.condition}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{cond.runCount} runs</span>
                    <span className={`text-sm font-medium ${cond.paceVsAvg < 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {Math.abs(cond.paceVsAvg).toFixed(1)}% {cond.paceVsAvg < 0 ? 'faster' : 'slower'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {data.timeOfDayAnalysis && data.timeOfDayAnalysis.length > 0 && (
        <Card className="bg-gradient-to-br from-purple-900/20 to-gray-900/30 border-purple-500/20 backdrop-blur-sm" data-testid="card-time-of-day">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-bold text-white uppercase tracking-wider">Time of Day</span>
            </div>
            <div className="space-y-3">
              {data.timeOfDayAnalysis.map((time) => (
                <div key={time.range} data-testid={`row-time-of-day-${time.range}`}>
                  <PaceBar paceVsAvg={time.paceVsAvg} label={time.label} runCount={time.runCount} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
