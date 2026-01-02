import { useState, useEffect } from "react";
import { Cloud, Sun, CloudRain, Wind, Droplets, ThermometerSun, AlertTriangle, Loader2, Clock } from "lucide-react";
import { motion } from "framer-motion";

interface WeatherCondition {
  temperature: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  windDirection: string;
  condition: string;
  conditionIcon: string;
  uvIndex: number;
  precipitationProbability: number;
}

interface WeatherData {
  current: WeatherCondition;
  description: string;
  runningConditions: {
    good: boolean;
    reason?: string;
  };
}

interface WeatherWidgetProps {
  lat: number;
  lng: number;
  compact?: boolean;
  className?: string;
  onClick?: () => void;
}

function getWeatherIcon(condition: string) {
  const lowerCondition = condition.toLowerCase();
  if (lowerCondition.includes('rain') || lowerCondition.includes('shower')) {
    return <CloudRain className="w-6 h-6 text-blue-400" />;
  }
  if (lowerCondition.includes('cloud') || lowerCondition.includes('overcast')) {
    return <Cloud className="w-6 h-6 text-gray-400" />;
  }
  if (lowerCondition.includes('sun') || lowerCondition.includes('clear')) {
    return <Sun className="w-6 h-6 text-yellow-400" />;
  }
  return <Cloud className="w-6 h-6 text-gray-400" />;
}

function getCurrentTimeOfDay(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Morning";
  if (hour >= 12 && hour < 17) return "Afternoon";
  if (hour >= 17 && hour < 21) return "Evening";
  return "Night";
}

function formatCurrentTime(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function WeatherWidget({ lat, lng, compact = false, className = "", onClick }: WeatherWidgetProps) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(formatCurrentTime());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(formatCurrentTime());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    async function fetchWeather() {
      if (!lat || !lng) return;
      
      setLoading(true);
      setError(null);
      
      try {
        const response = await fetch(`/api/weather/current?lat=${lat}&lng=${lng}`);
        if (!response.ok) {
          throw new Error('Weather unavailable');
        }
        const data = await response.json();
        setWeather(data);
      } catch (err) {
        setError('Unable to load weather');
        console.error('Weather fetch error:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchWeather();
  }, [lat, lng]);

  if (loading) {
    return (
      <div className={`flex items-center justify-center p-4 ${className}`}>
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !weather) {
    return null;
  }

  if (compact) {
    return (
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`flex items-center gap-2 bg-black/30 backdrop-blur-sm rounded-full px-3 py-1.5 ${onClick ? 'cursor-pointer hover:bg-black/40 transition-colors' : ''} ${className}`}
        data-testid="weather-widget-compact"
        onClick={onClick}
      >
        <Clock className="w-4 h-4 text-gray-400" />
        <span className="text-white font-medium">{currentTime}</span>
        <span className="text-gray-400">•</span>
        {getWeatherIcon(weather.current.condition)}
        <span className="text-white font-medium">{Math.round(weather.current.temperature)}°</span>
        <span className="text-gray-300 text-sm hidden sm:inline">{weather.current.condition}</span>
      </motion.div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-gradient-to-br from-gray-900/90 to-gray-800/90 backdrop-blur-md rounded-2xl p-4 border border-gray-700/50 ${className}`}
      data-testid="weather-widget"
    >
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-700/30">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-blue-400" />
          <span className="text-white font-medium">{currentTime}</span>
        </div>
        <span className="text-gray-400 text-sm">{getCurrentTimeOfDay()}</span>
      </div>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/20 rounded-xl">
            {getWeatherIcon(weather.current.condition)}
          </div>
          <div>
            <div className="text-2xl font-bold text-white">
              {Math.round(weather.current.temperature)}°C
            </div>
            <div className="text-sm text-gray-400">
              Feels like {Math.round(weather.current.feelsLike)}°
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-white font-medium">{weather.current.condition}</div>
          {weather.runningConditions.reason && (
            <div className={`text-xs mt-1 ${weather.runningConditions.good ? 'text-green-400' : 'text-amber-400'}`}>
              {weather.runningConditions.reason}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 pt-3 border-t border-gray-700/50">
        <div className="text-center">
          <Wind className="w-4 h-4 mx-auto text-gray-400 mb-1" />
          <div className="text-xs text-gray-400">Wind</div>
          <div className="text-sm text-white font-medium">
            {Math.round(weather.current.windSpeed)} km/h
          </div>
        </div>
        <div className="text-center">
          <Droplets className="w-4 h-4 mx-auto text-blue-400 mb-1" />
          <div className="text-xs text-gray-400">Humidity</div>
          <div className="text-sm text-white font-medium">
            {weather.current.humidity}%
          </div>
        </div>
        <div className="text-center">
          <CloudRain className="w-4 h-4 mx-auto text-blue-300 mb-1" />
          <div className="text-xs text-gray-400">Rain</div>
          <div className="text-sm text-white font-medium">
            {weather.current.precipitationProbability}%
          </div>
        </div>
        <div className="text-center">
          <ThermometerSun className="w-4 h-4 mx-auto text-orange-400 mb-1" />
          <div className="text-xs text-gray-400">UV</div>
          <div className="text-sm text-white font-medium">
            {weather.current.uvIndex}
          </div>
        </div>
      </div>

      {!weather.runningConditions.good && (
        <div className="mt-3 flex items-center gap-2 text-amber-400 text-sm bg-amber-500/10 rounded-lg p-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{weather.runningConditions.reason}</span>
        </div>
      )}
    </motion.div>
  );
}

export function WeatherBadge({ weather }: { weather: WeatherCondition }) {
  return (
    <div 
      className="flex items-center gap-2 bg-gray-800/80 rounded-lg px-3 py-2"
      data-testid="weather-badge"
    >
      {getWeatherIcon(weather.condition)}
      <div>
        <div className="text-white font-medium text-sm">
          {Math.round(weather.temperature)}°C • {weather.condition}
        </div>
        <div className="text-xs text-gray-400">
          Wind {Math.round(weather.windSpeed)} km/h • {weather.humidity}% humidity
        </div>
      </div>
    </div>
  );
}

export function InlineWeather({ weather }: { weather: WeatherCondition }) {
  return (
    <span className="inline-flex items-center gap-1 text-gray-300" data-testid="inline-weather">
      {getWeatherIcon(weather.condition)}
      <span>{Math.round(weather.temperature)}°C</span>
      <span className="text-gray-500">•</span>
      <span>{weather.condition}</span>
    </span>
  );
}
