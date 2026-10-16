import { useEffect, useState } from 'react';
import { currentMonth } from '../../agents/recommender.js';
import { seasonOfMonth } from '../../ontology/schema.js';
import { CITIES, describeWeather, fetchWeather, loadCityId, saveCityId, weatherTip } from './weather.js';

const GEO_ID = 'geo';

function locate() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('浏览器不支持定位'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => reject(new Error('定位失败')),
      { timeout: 8000, maximumAge: 30 * 60 * 1000 },
    );
  });
}

export default function WeatherBar() {
  const [cityId, setCityId] = useState(loadCityId);
  const [state, setState] = useState({ status: 'loading', data: null, error: '' });
  const season = seasonOfMonth(currentMonth());
  const hour = new Date().getHours();
  const greeting = hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';

  useEffect(() => {
    const ctrl = new AbortController();
    let alive = true;
    (async () => {
      setState(s => ({ ...s, status: 'loading', error: '' }));
      try {
        const coords = cityId === GEO_ID ? await locate() : (CITIES.find(c => c.id === cityId) || CITIES[0]);
        const data = await fetchWeather(coords, ctrl.signal);
        if (alive) setState({ status: 'ok', data, error: '' });
      } catch (e) {
        if (alive && e.name !== 'AbortError') setState({ status: 'error', data: null, error: e.message });
      }
    })();
    return () => { alive = false; ctrl.abort(); };
  }, [cityId]);

  const onCity = (id) => { setCityId(id); saveCityId(id); };
  const w = state.data;
  const desc = w ? describeWeather(w.code) : null;

  return (
    <div className="weather-bar" role="region" aria-label="今日天气">
      <div className="weather-main">
        <span className="weather-emoji" aria-hidden="true">{desc ? desc.emoji : season.emoji}</span>
        {state.status === 'ok' && (
          <>
            <span className="weather-temp">{w.temp}°</span>
            <div className="weather-desc">
              <div className="font-bold">{desc.label} · {w.min}°~{w.max}°</div>
              <div className="text-xs">体感 {w.feels}° · 湿度 {w.humidity}% · 风速 {w.wind} km/h{w.rain != null ? ` · 降水 ${w.rain}%` : ''}</div>
            </div>
          </>
        )}
        {state.status === 'loading' && <span className="text-sm">天气加载中…</span>}
        {state.status === 'error' && <span className="text-sm" title={state.error}>天气暂不可用（{state.error}）</span>}
      </div>
      <div className="weather-tip text-sm">
        {greeting}！{w ? weatherTip(w) : `${season.label}，愿全家安康`}
      </div>
      <div className="weather-meta">
        <span className="text-xs">
          {new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })} · {season.emoji} {season.label}
        </span>
        <select
          className="weather-city"
          value={cityId}
          onChange={e => onCity(e.target.value)}
          aria-label="选择城市"
        >
          {CITIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          <option value={GEO_ID}>📍 当前位置</option>
        </select>
      </div>
    </div>
  );
}
