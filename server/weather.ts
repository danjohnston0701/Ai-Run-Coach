const GOOGLE_WEATHER_API_BASE = 'https://weather.googleapis.com/v1';

export interface WeatherCondition {
  temperature: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  windDirection: string;
  condition: string;
  conditionIcon: string;
  uvIndex: number;
  precipitationProbability: number;
  visibility?: number;
  pressure?: number;
}

export interface WeatherForecast {
  date: string;
  high: number;
  low: number;
  condition: string;
  conditionIcon: string;
  precipitationProbability: number;
}

export interface WeatherData {
  current: WeatherCondition;
  hourlyForecast?: WeatherCondition[];
  dailyForecast?: WeatherForecast[];
  alerts?: WeatherAlert[];
  fetchedAt: string;
  location?: {
    lat: number;
    lng: number;
  };
}

export interface WeatherAlert {
  title: string;
  severity: string;
  description: string;
  startTime: string;
  endTime: string;
}

function getCardinalDirection(degrees: number): string {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(degrees / 22.5) % 16;
  return directions[index];
}

export async function getCurrentWeather(lat: number, lng: number): Promise<WeatherCondition | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error('GOOGLE_MAPS_API_KEY not configured');
    return null;
  }

  try {
    const url = `${GOOGLE_WEATHER_API_BASE}/currentConditions:lookup?key=${apiKey}&location.latitude=${lat}&location.longitude=${lng}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Weather API error:', response.status, errorText);
      return null;
    }

    const data = await response.json();
    
    return {
      temperature: data.temperature?.degrees ?? 0,
      feelsLike: data.feelsLikeTemperature?.degrees ?? data.temperature?.degrees ?? 0,
      humidity: data.relativeHumidity ?? 0,
      windSpeed: data.wind?.speed?.value ?? 0,
      windDirection: data.wind?.direction?.cardinal ?? getCardinalDirection(data.wind?.direction?.degrees ?? 0),
      condition: data.weatherCondition?.description?.text ?? 'Unknown',
      conditionIcon: data.weatherCondition?.iconBaseUri ?? '',
      uvIndex: data.uvIndex ?? 0,
      precipitationProbability: data.precipitation?.probability?.percent ?? 0,
      visibility: data.visibility?.distance ?? undefined,
      pressure: data.airPressure?.meanSeaLevelMillibars ?? undefined,
    };
  } catch (error) {
    console.error('Failed to fetch current weather:', error);
    return null;
  }
}

export async function getHourlyForecast(lat: number, lng: number, hours: number = 24): Promise<WeatherCondition[]> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error('GOOGLE_MAPS_API_KEY not configured');
    return [];
  }

  try {
    const url = `${GOOGLE_WEATHER_API_BASE}/forecast/hours:lookup?key=${apiKey}&location.latitude=${lat}&location.longitude=${lng}&hours=${hours}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error('Weather forecast API error:', response.status);
      return [];
    }

    const data = await response.json();
    
    return (data.forecastHours || []).map((hour: any) => ({
      temperature: hour.temperature?.degrees ?? 0,
      feelsLike: hour.feelsLikeTemperature?.degrees ?? hour.temperature?.degrees ?? 0,
      humidity: hour.relativeHumidity ?? 0,
      windSpeed: hour.wind?.speed?.value ?? 0,
      windDirection: hour.wind?.direction?.cardinal ?? getCardinalDirection(hour.wind?.direction?.degrees ?? 0),
      condition: hour.weatherCondition?.description?.text ?? 'Unknown',
      conditionIcon: hour.weatherCondition?.iconBaseUri ?? '',
      uvIndex: hour.uvIndex ?? 0,
      precipitationProbability: hour.precipitation?.probability?.percent ?? 0,
    }));
  } catch (error) {
    console.error('Failed to fetch hourly forecast:', error);
    return [];
  }
}

export async function getDailyForecast(lat: number, lng: number, days: number = 5): Promise<WeatherForecast[]> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error('GOOGLE_MAPS_API_KEY not configured');
    return [];
  }

  try {
    const url = `${GOOGLE_WEATHER_API_BASE}/forecast/days:lookup?key=${apiKey}&location.latitude=${lat}&location.longitude=${lng}&days=${days}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error('Daily forecast API error:', response.status);
      return [];
    }

    const data = await response.json();
    
    return (data.forecastDays || []).map((day: any) => ({
      date: day.displayDate?.year + '-' + String(day.displayDate?.month).padStart(2, '0') + '-' + String(day.displayDate?.day).padStart(2, '0'),
      high: day.daytimeForecast?.temperature?.degrees ?? day.temperature?.max?.degrees ?? 0,
      low: day.nighttimeForecast?.temperature?.degrees ?? day.temperature?.min?.degrees ?? 0,
      condition: day.daytimeForecast?.weatherCondition?.description?.text ?? 'Unknown',
      conditionIcon: day.daytimeForecast?.weatherCondition?.iconBaseUri ?? '',
      precipitationProbability: day.daytimeForecast?.precipitation?.probability?.percent ?? 0,
    }));
  } catch (error) {
    console.error('Failed to fetch daily forecast:', error);
    return [];
  }
}

export async function getWeatherAlerts(lat: number, lng: number): Promise<WeatherAlert[]> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return [];
  }

  try {
    const url = `${GOOGLE_WEATHER_API_BASE}/publicAlerts:lookup?key=${apiKey}&location.latitude=${lat}&location.longitude=${lng}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    
    return (data.alerts || []).map((alert: any) => ({
      title: alert.headline ?? 'Weather Alert',
      severity: alert.severity ?? 'unknown',
      description: alert.description ?? '',
      startTime: alert.effective ?? '',
      endTime: alert.expires ?? '',
    }));
  } catch (error) {
    console.error('Failed to fetch weather alerts:', error);
    return [];
  }
}

export async function getFullWeatherData(lat: number, lng: number): Promise<WeatherData | null> {
  const current = await getCurrentWeather(lat, lng);
  
  if (!current) {
    return null;
  }

  const [hourlyForecast, dailyForecast, alerts] = await Promise.all([
    getHourlyForecast(lat, lng, 12),
    getDailyForecast(lat, lng, 5),
    getWeatherAlerts(lat, lng),
  ]);

  return {
    current,
    hourlyForecast,
    dailyForecast,
    alerts,
    fetchedAt: new Date().toISOString(),
    location: { lat, lng },
  };
}

export function getWeatherDescription(condition: WeatherCondition): string {
  const parts = [];
  parts.push(`${Math.round(condition.temperature)}°C`);
  parts.push(condition.condition);
  
  if (condition.windSpeed > 20) {
    parts.push(`windy (${Math.round(condition.windSpeed)} km/h)`);
  }
  
  if (condition.precipitationProbability > 30) {
    parts.push(`${condition.precipitationProbability}% chance of rain`);
  }
  
  return parts.join(', ');
}

export function isGoodRunningWeather(condition: WeatherCondition): { good: boolean; reason?: string } {
  if (condition.temperature < 0) {
    return { good: false, reason: 'Very cold conditions' };
  }
  if (condition.temperature > 35) {
    return { good: false, reason: 'Very hot conditions' };
  }
  if (condition.precipitationProbability > 70) {
    return { good: false, reason: 'High chance of rain' };
  }
  if (condition.windSpeed > 40) {
    return { good: false, reason: 'Very windy conditions' };
  }
  if (condition.uvIndex > 10) {
    return { good: false, reason: 'Extreme UV levels' };
  }
  
  if (condition.temperature >= 10 && condition.temperature <= 20 && condition.precipitationProbability < 30) {
    return { good: true, reason: 'Great running weather!' };
  }
  
  return { good: true };
}
