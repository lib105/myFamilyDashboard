import { Link } from 'react-router-dom';
import tripsData from '../../data/trips.json';
import tasksData from '../../data/tasks.json';
import shoppingData from '../../data/shopping.json';
import dealsData from '../../data/deals.json';
import membersData from '../../data/members.json';

const SUMMARY_CARDS = [
  {
    emoji: '✈️',
    bgColor: 'linear-gradient(135deg, #4A90D9, #5BA3E8)',
    path: '/trips',
    getCount: () => tripsData.filter(t => t.status === 'planning').length,
    label: '行程计划中',
    bgEmoji: '🗺️',
  },
  {
    emoji: '✅',
    bgColor: 'linear-gradient(135deg, #27AE60, #2ECC71)',
    path: '/tasks',
    getCount: () => tasksData.filter(t => !t.completed).length,
    label: '待完成任务',
    bgEmoji: '📋',
  },
  {
    emoji: '🛒',
    bgColor: 'linear-gradient(135deg, #9B59B6, #AF7AC5)',
    path: '/shopping',
    getCount: () => shoppingData.filter(s => s.needed).length,
    label: '购物清单',
    bgEmoji: '🛍️',
  },
  {
    emoji: '🏷️',
    bgColor: 'linear-gradient(135deg, #E74C3C, #EC7063)',
    path: '/deals',
    getCount: () => dealsData.filter(d => d.status === 'active').length,
    label: '今日促销',
    bgEmoji: '💰',
  },
  {
    emoji: '⚠️',
    bgColor: 'linear-gradient(135deg, #F39C12, #F5B041)',
    path: '/shopping',
    getCount: () => shoppingData.filter(s => s.quantity < s.lowStockThreshold).length,
    label: '库存不足',
    bgEmoji: '📦',
  },
  {
    emoji: '💫',
    bgColor: 'linear-gradient(135deg, #E91E8C, #F06292)',
    path: '/trips',
    getCount: () => tripsData.reduce((sum, t) => sum + (t.wishes?.filter(w => w.status === 'pending').length || 0), 0),
    label: '孩子旅行愿望',
    bgEmoji: '🌟',
  },
];

function WelcomeBanner() {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';

  return (
    <div style={{
      background: 'linear-gradient(135deg, #FF6B35 0%, #FF8E53 50%, #FFD700 100%)',
      borderRadius: 'var(--radius-xl)',
      padding: '32px 40px',
      color: '#fff',
      marginBottom: 'var(--spacing-xl)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      boxShadow: '0 8px 32px rgba(255,107,53,0.3)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ fontSize: 13, opacity: 0.9, fontWeight: 600, marginBottom: 4 }}>
          {new Date().toLocaleDateString('zh-CN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 900, margin: '4px 0' }}>
          {greeting}，我们的家！ 🏡
        </h1>
        <p style={{ opacity: 0.9, fontSize: 15 }}>
          今天一起完成任务，计划下次旅行，收获美好时光～
        </p>
        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
          {membersData.map(m => (
            <div key={m.id} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 32 }}>{m.avatar}</div>
              <div style={{ fontSize: 11, opacity: 0.9 }}>{m.name}</div>
              {m.role === 'child' && (
                <div style={{
                  background: 'rgba(255,255,255,0.25)',
                  borderRadius: 10,
                  padding: '1px 6px',
                  fontSize: 10,
                  fontWeight: 700,
                  marginTop: 2,
                }}>⭐ {m.points}</div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div style={{ fontSize: 120, opacity: 0.12, position: 'absolute', right: 20, top: -10 }}>🏡</div>
    </div>
  );
}

function UpcomingTrips() {
  const planningTrips = tripsData.filter(t => t.status === 'planning' || t.status === 'wishlist').slice(0, 3);

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">✈️ 近期旅行计划</span>
        <Link to="/trips" className="btn btn-ghost btn-sm">查看全部 →</Link>
      </div>
      {planningTrips.length === 0 ? (
        <div className="empty-state" style={{ padding: 'var(--spacing-lg)' }}>
          <span style={{ fontSize: 40 }}>🗺️</span>
          <p>还没有旅行计划，快去添加吧！</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
          {planningTrips.map(trip => (
            <Link
              key={trip.id}
              to={`/trips/${trip.id}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--spacing-md)',
                padding: 'var(--spacing-sm)',
                borderRadius: 'var(--radius-md)',
                background: '#FFF9F0',
                textDecoration: 'none',
                color: 'var(--color-text)',
                transition: 'background 0.2s',
              }}
              onMouseOver={e => e.currentTarget.style.background = '#FFE5D9'}
              onMouseOut={e => e.currentTarget.style.background = '#FFF9F0'}
            >
              <span style={{ fontSize: 32 }}>{trip.coverEmoji}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{trip.title}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-light)' }}>
                  📅 {trip.plannedMonth} · 💰 ¥{trip.budget?.toLocaleString()}
                </div>
              </div>
              <span className={`status-chip status-${trip.status}`}>
                {trip.status === 'planning' ? '规划中' : trip.status === 'wishlist' ? '心愿单' : '想法'}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function PendingTasks() {
  const pending = tasksData.filter(t => !t.completed).slice(0, 5);

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">✅ 待完成任务</span>
        <Link to="/tasks" className="btn btn-ghost btn-sm">查看全部 →</Link>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {pending.map(task => (
          <div key={task.id} className="check-item">
            <span style={{ fontSize: 20 }}>{task.emoji}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{task.title}</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-light)' }}>{task.dueTime}</div>
            </div>
            <span className="points-badge">⭐ +{task.points}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LowStockAlerts() {
  const lowStock = shoppingData.filter(s => s.quantity < s.lowStockThreshold);

  if (lowStock.length === 0) return null;

  return (
    <div className="alert alert-warning" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>⚠️ 库存不足提醒</div>
      {lowStock.map(item => (
        <div key={item.id} style={{ fontSize: 13 }}>
          {item.emoji} {item.name}：仅剩 {item.quantity} {item.unit}（建议备货 {item.lowStockThreshold}+ {item.unit}）
        </div>
      ))}
    </div>
  );
}

function LatestDeals() {
  const active = dealsData.filter(d => d.status === 'active').slice(0, 3);

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">🏷️ 最新促销</span>
        <Link to="/deals" className="btn btn-ghost btn-sm">查看全部 →</Link>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
        {active.map(deal => (
          <div key={deal.id} style={{
            display: 'flex',
            gap: 'var(--spacing-sm)',
            padding: 'var(--spacing-sm)',
            background: '#FFF9F0',
            borderRadius: 'var(--radius-md)',
            alignItems: 'flex-start',
          }}>
            <span style={{ fontSize: 24 }}>
              {deal.category === 'flights' ? '✈️' : deal.category === 'hotels' ? '🏨' : deal.category === 'shopping' ? '🛍️' : '🧳'}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{deal.title}</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-light)' }}>来源：{deal.source}</div>
            </div>
            {deal.price && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: 'var(--color-danger)', fontWeight: 800, fontSize: 15 }}>¥{deal.price}</div>
                {deal.discount && <div style={{ fontSize: 10, background: '#FADBD8', color: '#E74C3C', borderRadius: 8, padding: '1px 6px' }}>{deal.discount}</div>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function KidsWishes() {
  const allWishes = tripsData.flatMap(t =>
    t.wishes.filter(w => w.status === 'pending').map(w => ({
      ...w,
      tripTitle: t.title,
      tripEmoji: t.coverEmoji,
    }))
  );

  if (allWishes.length === 0) return null;

  return (
    <div className="card" style={{ border: '2px solid #FFD700', background: 'linear-gradient(135deg, #FFFDE7, #FFF9C4)' }}>
      <div className="card-header">
        <span className="card-title">💫 孩子的旅行愿望</span>
        <Link to="/trips" className="btn btn-ghost btn-sm">去看看 →</Link>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
        {allWishes.slice(0, 4).map(wish => {
          const member = membersData.find(m => m.id === wish.memberId);
          return (
            <div key={wish.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
              <span style={{ fontSize: 24 }}>{member?.avatar || '👶'}</span>
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{member?.name}：</span>
                <span style={{ fontSize: 13 }}>{wish.content}</span>
              </div>
              <span style={{ fontSize: 18 }}>{wish.tripEmoji}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Dashboard() {
  return (
    <div>
      <div className="page-body">
        <WelcomeBanner />
        <LowStockAlerts />

        {/* Summary cards */}
        <div className="summary-grid" style={{ marginBottom: 'var(--spacing-xl)' }}>
          {SUMMARY_CARDS.map((card, i) => (
            <Link key={i} to={card.path} className="summary-card" style={{ background: card.bgColor }}>
              <span className="card-emoji">{card.emoji}</span>
              <span className="card-count">{card.getCount()}</span>
              <span className="card-label">{card.label}</span>
              <span className="card-bg-emoji">{card.bgEmoji}</span>
            </Link>
          ))}
        </div>

        {/* Main content grid */}
        <div className="grid-2" style={{ marginBottom: 'var(--spacing-lg)' }}>
          <UpcomingTrips />
          <PendingTasks />
        </div>
        <div className="grid-2">
          <LatestDeals />
          <KidsWishes />
        </div>
      </div>
    </div>
  );
}
