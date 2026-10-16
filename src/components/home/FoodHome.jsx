import { useEffect, useState } from 'react';
import { useGraph } from '../../ontology/index.js';
import { getMembers } from '../../ontology/queries.js';
import { currentMonth } from '../../agents/recommender.js';
import { seasonOfMonth } from '../../ontology/schema.js';
import FamilyProfiles from './FamilyProfiles.jsx';
import ChatPanel from './ChatPanel.jsx';
import ViewCard from './ViewCard.jsx';
import { DEFAULT_VIEWS, loadViews, saveViews, mergeViews, stampViews } from './homeViews.js';

function HomeBanner() {
  const graph = useGraph();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';
  const season = seasonOfMonth(currentMonth());
  const members = getMembers(graph);
  return (
    <div className="home-banner">
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ fontSize: 13, opacity: 0.9, fontWeight: 600 }}>
          {new Date().toLocaleDateString('zh-CN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} · {season.emoji} {season.label}
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 900, margin: '4px 0' }}>{greeting}，今天全家吃点什么？🥗</h1>
        <p style={{ opacity: 0.92, fontSize: 14 }}>
          根据 {members.length} 位家人的健康档案，优先推荐{season.label}时令食材与简单食谱
        </p>
      </div>
      <div className="banner-bg-emoji">{season.emoji}</div>
    </div>
  );
}

export default function FoodHome() {
  const [views, setViews] = useState(loadViews);
  const [freshIds, setFreshIds] = useState([]);
  const [profileFresh, setProfileFresh] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => saveViews(views), [views]);

  useEffect(() => {
    if (!freshIds.length && !profileFresh) return undefined;
    const t = setTimeout(() => { setFreshIds([]); setProfileFresh(false); }, 2500);
    return () => clearTimeout(t);
  }, [freshIds, profileFresh]);

  const onViews = (incoming) => {
    const profile = incoming.some(v => v.type === 'profile');
    const others = incoming.filter(v => v.type !== 'profile');
    if (profile) setProfileFresh(true);
    if (!others.length) return;
    const stamped = stampViews(others);
    setViews(prev => mergeViews(prev, stamped));
    setFreshIds(stamped.map(v => v.id));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="page-body">
      <HomeBanner />
      <div className="home-grid">
        <div className="home-main">
          <FamilyProfiles fresh={profileFresh} onAsk={name => setDraft(`${name}：`)} />
          {views.map(v => (
            <ViewCard
              key={v.id}
              view={v}
              fresh={freshIds.includes(v.id)}
              onClose={() => setViews(prev => prev.filter(x => x.id !== v.id))}
            />
          ))}
          {views.length === 0 && (
            <div className="card empty-state">
              <span style={{ fontSize: 40 }}>🪄</span>
              <p>首页内容由 AI 根据对话动态生成</p>
              <button className="btn btn-outline btn-sm" onClick={() => setViews(DEFAULT_VIEWS)}>恢复默认推荐</button>
            </div>
          )}
        </div>
        <aside className="home-side">
          <ChatPanel draft={draft} setDraft={setDraft} onViews={onViews} />
        </aside>
      </div>
    </div>
  );
}
