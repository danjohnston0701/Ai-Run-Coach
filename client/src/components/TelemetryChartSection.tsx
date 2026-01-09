import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  Cell,
} from "recharts";

export interface TelemetryDataPoint {
  distance: number;
  pace?: number;
  heartRate?: number;
  elevation?: number;
  cadence?: number;
  timestamp?: number;
}

export type ChartMetric = 'elevation' | 'pace' | 'heartRate' | 'cadence';
export type ChartDomain = 'distance' | 'time';

interface MetricConfig {
  key: keyof TelemetryDataPoint;
  label: string;
  unit: string;
  color: string;
  fillColor: string;
  gradientId: string;
  invertY?: boolean;
  formatValue: (value: number) => string;
  formatTick: (value: number) => string;
}

const METRIC_CONFIGS: Record<ChartMetric, MetricConfig> = {
  elevation: {
    key: 'elevation',
    label: 'Elevation',
    unit: 'm',
    color: '#22c55e',
    fillColor: '#22c55e',
    gradientId: 'colorElevation',
    formatValue: (v) => `${Math.round(v)} m`,
    formatTick: (v) => Math.round(v).toString(),
  },
  pace: {
    key: 'pace',
    label: 'Pace',
    unit: '/km',
    color: '#38bdf8',
    fillColor: '#38bdf8',
    gradientId: 'colorPace',
    invertY: true,
    formatValue: (v) => {
      const mins = Math.floor(v / 60);
      const secs = Math.round(v % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}/km`;
    },
    formatTick: (v) => {
      const mins = Math.floor(v / 60);
      const secs = Math.round(v % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    },
  },
  heartRate: {
    key: 'heartRate',
    label: 'Heart Rate',
    unit: 'bpm',
    color: '#ef4444',
    fillColor: '#ef4444',
    gradientId: 'colorHR',
    formatValue: (v) => `${Math.round(v)} bpm`,
    formatTick: (v) => Math.round(v).toString(),
  },
  cadence: {
    key: 'cadence',
    label: 'Cadence',
    unit: 'spm',
    color: '#facc15',
    fillColor: '#facc15',
    gradientId: 'colorCadence',
    formatValue: (v) => `${Math.round(v)} spm`,
    formatTick: (v) => Math.round(v).toString(),
  },
};

function getCadenceColor(cadence: number): string {
  if (cadence >= 180) return '#22c55e';
  if (cadence >= 170) return '#84cc16';
  if (cadence >= 160) return '#facc15';
  if (cadence >= 150) return '#f97316';
  return '#ef4444';
}

interface TelemetryChartSectionProps {
  metric: ChartMetric;
  icon: React.ReactNode;
  dataPoints: TelemetryDataPoint[];
  stats?: {
    min?: number;
    max?: number;
    avg?: number;
  };
  defaultOpen?: boolean;
  totalDistance: number;
  totalDuration: number;
}

export function TelemetryChartSection({
  metric,
  icon,
  dataPoints,
  stats,
  defaultOpen = false,
  totalDistance,
  totalDuration,
}: TelemetryChartSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [domain, setDomain] = useState<ChartDomain>('distance');
  
  const config = METRIC_CONFIGS[metric];
  
  const hasData = useMemo(() => {
    return dataPoints.some(p => p[config.key] !== undefined && p[config.key] !== null);
  }, [dataPoints, config.key]);
  
  const chartData = useMemo(() => {
    if (!hasData) return [];
    
    return dataPoints
      .filter(p => p[config.key] !== undefined && p[config.key] !== null)
      .map(p => ({
        x: domain === 'distance' ? p.distance : (p.timestamp !== undefined ? p.timestamp / 60 : p.distance),
        value: p[config.key] as number,
        distance: p.distance,
        timestamp: p.timestamp,
      }));
  }, [dataPoints, domain, config.key, hasData]);
  
  const xAxisConfig = useMemo(() => {
    if (domain === 'distance') {
      return {
        label: 'Distance (km)',
        ticks: Array.from({ length: Math.ceil(totalDistance) + 1 }, (_, i) => i),
        formatter: (val: number) => Math.round(val).toString(),
        domain: [0, Math.ceil(totalDistance)] as [number, number],
      };
    } else {
      const totalMinutes = totalDuration / 60;
      const tickInterval = totalMinutes <= 10 ? 1 : totalMinutes <= 30 ? 5 : 10;
      const ticks = Array.from({ length: Math.ceil(totalMinutes / tickInterval) + 1 }, (_, i) => i * tickInterval);
      return {
        label: 'Time (min)',
        ticks,
        formatter: (val: number) => {
          const mins = Math.floor(val);
          return `${mins}`;
        },
        domain: [0, Math.ceil(totalMinutes)] as [number, number],
      };
    }
  }, [domain, totalDistance, totalDuration]);
  
  const yDomain = useMemo(() => {
    if (chartData.length === 0) return [0, 100] as [number, number];
    const values = chartData.map(d => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = (max - min) * 0.1 || 10;
    
    if (config.invertY) {
      return [max + padding, min - padding] as [number, number];
    }
    return [min - padding, max + padding] as [number, number];
  }, [chartData, config.invertY]);

  if (!hasData) {
    return null;
  }
  
  const showScatter = metric === 'cadence';

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <div 
          className="flex items-center justify-between p-4 bg-card/30 border border-white/5 rounded-lg cursor-pointer hover:bg-card/40 transition-colors"
          data-testid={`chart-section-${metric}`}
        >
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg`} style={{ backgroundColor: `${config.color}20` }}>
              {icon}
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wide">{config.label}</h3>
              {stats && (
                <div className="flex gap-3 text-xs text-muted-foreground">
                  {stats.avg !== undefined && (
                    <span>Avg: <span className="font-medium text-primary">{config.formatValue(stats.avg)}</span></span>
                  )}
                  {stats.min !== undefined && metric !== 'pace' && (
                    <span>Min: {config.formatValue(stats.min)}</span>
                  )}
                  {stats.max !== undefined && (
                    <span>{metric === 'pace' ? 'Best' : 'Max'}: {config.formatValue(stats.max)}</span>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isOpen ? (
              <ChevronUp className="w-5 h-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
        </div>
      </CollapsibleTrigger>
      
      <CollapsibleContent>
        <Card className="mt-2 bg-card/30 border-white/5 p-4 overflow-hidden">
          <div className="flex justify-center gap-2 mb-4">
            <Button
              variant={domain === 'time' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDomain('time')}
              className="text-xs px-4"
              data-testid={`toggle-time-${metric}`}
            >
              Time
            </Button>
            <Button
              variant={domain === 'distance' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDomain('distance')}
              className="text-xs px-4"
              data-testid={`toggle-distance-${metric}`}
            >
              Distance
            </Button>
          </div>
          
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              {showScatter ? (
                <ScatterChart margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff08" />
                  <XAxis 
                    dataKey="x"
                    type="number"
                    stroke="#ffffff40" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false}
                    domain={xAxisConfig.domain}
                    ticks={xAxisConfig.ticks}
                    tickFormatter={xAxisConfig.formatter}
                  />
                  <YAxis 
                    dataKey="value"
                    type="number"
                    stroke="#ffffff40" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false}
                    domain={yDomain}
                    tickFormatter={config.formatTick}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#09090b', border: '1px solid #ffffff10', borderRadius: '12px', fontSize: '12px' }}
                    labelStyle={{ color: '#64748b', marginBottom: '4px' }}
                    formatter={(value: number) => [config.formatValue(value), config.label]}
                    labelFormatter={(label: number) => domain === 'distance' ? `${label.toFixed(1)} km` : `${Math.floor(label)}:${Math.round((label % 1) * 60).toString().padStart(2, '0')}`}
                  />
                  <Scatter data={chartData} fill={config.color}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={getCadenceColor(entry.value)} />
                    ))}
                  </Scatter>
                </ScatterChart>
              ) : (
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id={config.gradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={config.fillColor} stopOpacity={0.4}/>
                      <stop offset="95%" stopColor={config.fillColor} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff08" />
                  <XAxis 
                    dataKey="x" 
                    stroke="#ffffff40" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false}
                    type="number"
                    domain={xAxisConfig.domain}
                    ticks={xAxisConfig.ticks}
                    tickFormatter={xAxisConfig.formatter}
                  />
                  <YAxis 
                    stroke="#ffffff40" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false}
                    domain={yDomain}
                    tickFormatter={config.formatTick}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#09090b', border: '1px solid #ffffff10', borderRadius: '12px', fontSize: '12px' }}
                    labelStyle={{ color: '#64748b', marginBottom: '4px' }}
                    formatter={(value: number) => [config.formatValue(value), config.label]}
                    labelFormatter={(label: number) => domain === 'distance' ? `${label.toFixed(1)} km` : `${Math.floor(label)}:${Math.round((label % 1) * 60).toString().padStart(2, '0')}`}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="value" 
                    stroke={config.color} 
                    fillOpacity={1} 
                    fill={`url(#${config.gradientId})`} 
                    strokeWidth={2}
                  />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>
          
          <div className="flex justify-center mt-2">
            <span className="text-xs text-muted-foreground">{xAxisConfig.label}</span>
          </div>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  );
}
