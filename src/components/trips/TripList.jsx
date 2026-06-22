import { Link } from 'react-router-dom';
import { useState } from 'react';
import tripsData from '../../data/trips.json';

const STATUS_MAP = {
  planning:  { label: '规划中',   chip: 'status-planning',  emoji: '📋' },
  wishlist:  { label: '心愿单',   chip: 'status-wishlist',  emoji: '💫' },
  idea:      { label: '想法',     chip: 'status-idea',      emoji: '💡' },
  confirmed: { label: '已确认',   chip: 'status-confirmed', emoji: '✅' },
};

const FILTERS = ['全部', '规划中', '心愿单', '想法'];

export default function TripList() {
  const [filter, setFilter] = useState('全部');

  const filtered = tripsData.filter(t => {
    if (filter === '全部') return true;
    const statusLabel = STATUS_MAP[t.status]?.label;
    return statusLabel === filter;
  });

  const totalBudget = tripsData
    .filter(t => t.status === 'planning' || t.status === 'confirmed')
    .reduce((sum, t) => sum + (t.budget || 0), 0);

  return (
    <div>
      <div className="page-header">
        <h1>✈️ 旅行计划</h1>
        <div style={{ display: 'flex', gap: 'var(--spacing-sm)', alignItems: 'center' }}>
          <Link to="/trips/wishes" className="btn btn-outline btn-sm">💫 孩子愿望</Link>
          <span style={{ fontSize: 13, color: 'var(--color-text-light)' }}>
            规划预算合计：
            <strong style={{ color: 'var(--color-primary)' }}>¥{totalBudget.toLocaleString()}</strong>
          </span>
        </div>
      </div>

      <div className="page-body">
        {/* Filter tabs */}
        <div className="tabs">
          {FILTERS.map(f => (
            <button
              key={f}
              className={`tab-btn${filter === f ? ' active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f}
              <span style={{
                marginLeft: 6,
                background: filter === f ? 'var(--color-primary)' : 'var(--color-border)',
                color: filter === f ? '#fff' : 'var(--color-text-light)',
                borderRadius: 12,
                padding: '1px 7px',
                fontSize: 11,
                fontWeight: 700,
              }}>
                {f === '全部' ? tripsData.length : tripsData.filter(t => STATUS_MAP[t.status]?.label === f).length}
              </span>
            </button>
          ))}
        </div>

        {/* Trip cards grid */}
        {filtered.length === 0 ? (
          <div className="empty-state">
            <span className="empty-emoji">🗺️</span>
            <p>还没有{filter !== '全部' ? filter : ''}旅行计划</p>
          </div>
        ) : (
          <div className="grid-3">
            {filtered.map(trip => (
              <TripCard key={trip.id} trip={trip} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TripCard({ trip }) {
  const status = STATUS_MAP[trip.status] || STATUS_MAP.idea;
  const doneCount = trip.checklist.filter(c => c.done).length;
  const progress = trip.checklist.length > 0
    ? Math.round((doneCount / trip.checklist.length) * 100)
    : 0;

  const pendingWishes = trip.wishes.filter(w => w.status === 'pending').length;

  return (
    <Link to={`/trips/${trip.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="card" style={{ cursor: 'pointer', height: '100%' }}>
        {/* Cover */}
        <div style={{
          fontSize: 64,
          textAlign: 'center',
          padding: '20px 0',
          background: 'linear-gradient(135deg, #FFF9F0, #FFE5D9)',
          borderRadius: 'var(--radius-md)',
          marginBottom: 'var(--spacing-md)',
          lineHeight: 1,
        }}>
          {trip.coverEmoji}
        </div>

        {/* Info */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--spacing-sm)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, flex: 1, lineHeight: 1.3 }}>{trip.title}</h3>
          <span className={`status-chip ${status.chip}`} style={{ marginLeft: 8, whiteSpace: 'nowrap' }}>
            {status.emoji} {status.label}
          </span>
        </div>

        <div style={{ fontSize: 13, color: 'var(--color-text-light)', marginBottom: 'var(--spacing-sm)' }}>
          📍 {trip.destination} &nbsp;·&nbsp; 📅 {trip.plannedMonth}
        </div>

        {trip.budget && (
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-primary)', marginBottom: 'var(--spacing-sm)' }}>
            💰 预算 ¥{trip.budget.toLocaleString()}
          </div>
        )}

        {/* Checklist progress */}
        {trip.checklist.length > 0 && (
          <div style={{ marginBottom: 'var(--spacing-sm)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
              <span>准备进度</span>
              <span>{doneCount}/{trip.checklist.length}</span>
            </div>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{
                  width: `${progress}%`,
                  background: progress === 100
                    ? 'var(--color-success)'
                    : 'linear-gradient(90deg, var(--color-primary), var(--color-accent))',
                }}
              />
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', gap: 'var(--spacing-sm)', flexWrap: 'wrap', marginTop: 'var(--spacing-sm)' }}>
          {trip.bookingLinks.slice(0, 2).map((link, i) => (
            <a
              key={i}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="badge badge-secondary"
              onClick={e => e.stopPropagation()}
            >
              {link.icon} {link.label}
            </a>
          ))}
          {pendingWishes > 0 && (
            <span className="badge badge-warning">💫 {pendingWishes}个愿望</span>
          )}
        </div>
      </div>
    </Link>
  );
}
