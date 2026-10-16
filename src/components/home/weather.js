const CITY_KEY = 'family-dashboard.weather-city.v1';
const CACHE_KEY = 'family-dashboard.weather-cache.v1';
const CACHE_MS = 30 * 60 * 1000;

export const CITIES = [
  { id: 'beijing',   name: '北京', lat: 39.9042, lon: 116.4074 },
  { id: 'shanghai',  name: '上海', lat: 31.2304, lon: 121.4737 },
  { id: 'guangzhou', name: '广州', lat: 23.1291, lon: 113.2644 },
  { id: 'shenzhen',  name: '深圳', lat: 22.5431, lon: 114.0579 },
  { id: 'hangzhou',  name: '杭州', lat: 30.2741, lon: 120.1551 },
  { id: 'chengdu',   name: '成都', lat: 30.5728, lon: 104.0668 },
  { id: 'wuhan',     name: '武汉', lat: 30.5928, lon: 114.3055 },
  { id: 'xian',      name: '西安', lat: 34.3416, lon: 108.9398 },
  { id: 'nanjing',   name: '南京', lat: 32.0603, lon: 118.7969 },
  { id: 'chongqing', name: '重庆', lat: 29.5630, lon: 106.5516 },
];

/** WMO weather interpretation codes → emoji + Chinese label. */
const WMO = [
  [[0], '☀️', '晴'],
  [[1], '🌤️', '晴间多云'],
  [[2], '⛅', '多云'],
  [[3], '☁️', '阴'],
  [[45, 48], '🌫️', '雾'],
  [[51, 53, 55, 56, 57], '🌦️', '毛毛雨'],
  [[61, 63, 80, 81], '🌧️', '雨'],
  [[65, 82], '⛈️', '大雨'],
  [[66, 67], '🌨️', '冻雨'],
  [[71, 73, 75, 77, 85, 86], '❄️', '雪'],
  [[95, 96, 99], '⛈️', '雷阵雨'],
];

export function describeWeather(code) {
  const hit = WMO.find(([codes]) => codes.includes(code));
  return hit ? { emoji: hit[1], label: hit[2] } : { emoji: '🌡️', label: '未知' };
}

export function loadCityId() {
  try {
    return window.localStorage.getItem(CITY_KEY) || CITIES[0].id;
  } catch {
    return CITIES[0].id;
  }
}

export function saveCityId(id) {
  try {
    window.localStorage.setItem(CITY_KEY, id);
  } catch {
    /* ignore */
  }
}

const readCache = (key) => {
  try {
    const c = JSON.parse(window.sessionStorage.getItem(CACHE_KEY) || 'null');
    return c && c.key === key && Date.now() - c.at < CACHE_MS ? c.data : null;
  } catch {
    return null;
  }
};
const writeCache = (key, data) => {
  try {
    window.sessionStorage.setItem(CACHE_KEY, JSON.stringify({ key, at: Date.now(), data }));
  } catch {
    /* ignore */
  }
};

/** Fetches current weather + today's range from Open-Meteo (free, no API key). */
export async function fetchWeather({ lat, lon }, signal) {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const cached = readCache(key);
  if (cached) return cached;
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'auto',
    forecast_days: '1',
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const cur = json.current || {};
  const daily = json.daily || {};
  const data = {
    temp: Math.round(cur.temperature_2m),
    feels: Math.round(cur.apparent_temperature),
    humidity: cur.relative_humidity_2m,
    wind: Math.round(cur.wind_speed_10m),
    code: cur.weather_code,
    max: Math.round(daily.temperature_2m_max?.[0]),
    min: Math.round(daily.temperature_2m_min?.[0]),
    rain: daily.precipitation_probability_max?.[0],
  };
  writeCache(key, data);
  return data;
}

/** A short, family-oriented tip derived from the weather. */
export function weatherTip(w) {
  if (!w) return '';
  if (w.rain >= 50) return '出门记得带伞 ☂️';
  if (w.max >= 32) return '天气炎热，注意防暑补水 💧';
  if (w.min <= 0) return '天冷注意保暖，老人孩子多添衣 🧣';
  if (w.max - w.min >= 10) return '昼夜温差大，注意增减衣物 🧥';
  return '天气不错，适合全家出门走走 🚶';
}
