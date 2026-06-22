import { useParams, Link } from 'react-router-dom';
import { useState } from 'react';
import tripsData from '../../data/trips.json';
import membersData from '../../data/members.json';

const STATUS_LABELS = {
  planning:  '规划中',
  wishlist:  '心愿单',
  idea:      '想法',
  confirmed: '已确认',
};

const WISH_STATUS_MAP = {
  pending:  { label: '待审核', badge: 'badge-warning',   emoji: '⏳' },
  approved: { label: '已采纳', badge: 'badge-success',   emoji: '✅' },
  rejected: { label: '待考虑', badge: 'badge-gray',      emoji: '💭' },
};

export default function TripDetail() {
  const { id } = useParams();
  const [activeTab, setActiveTab] = useState('checklist');
  const [checklist, setChecklist] = useState(() => {
    const trip = tripsData.find(t => t.id === id);
    return trip ? [...trip.checklist] : [];
  });

  const trip = tripsData.find(t => t.id === id);

  if (!trip) {
    return (
      <div>
        <div className="page-header"><h1>✈️ 旅行详情</h1></div>
        <div className="page-body">
          <div className="empty-state">
            <span className="empty-emoji">😕</span>
            <p>找不到该旅行计划</p>
            <Link to="/trips" className="btn btn-primary" style={{ marginTop: 16 }}>返回旅行列表</Link>
          </div>
        </div>
      </div>
    );
  }

  const doneCount = checklist.filter(c => c.done).length;
  const progress = checklist.length > 0 ? Math.round((doneCount / checklist.length) * 100) : 0;

  function toggleCheck(itemId) {
    setChecklist(prev => prev.map(c => c.id === itemId ? { ...c, done: !c.done } : c));
  }

  const getMember = (memberId) => membersData.find(m => m.id === memberId);

  const TABS = [
    { key: 'checklist', label: '📋 备忘清单', count: checklist.length },
    { key: 'members',   label: '👥 成员分工', count: trip.assignments.length },
    { key: 'wishes',    label: '💫 旅行愿望', count: trip.wishes.length },
    { key: 'links',     label: '🔗 预订链接', count: trip.bookingLinks.length },
  ];

  return (
    <div>
      <div className="page-header">
        <h1>
          <Link to="/trips" style={{ fontSize: 18, color: 'var(--color-text-light)', marginRight: 8 }}>✈️ 旅行</Link>
          <span style={{ color: 'var(--color-text-light)' }}>/</span>
          <span style={{ marginLeft: 8 }}>{trip.coverEmoji} {trip.title}</span>
        </h1>
        <span className={`status-chip status-${trip.status}`}>{STATUS_LABELS[trip.status] || trip.status}</span>
      </div>

      <div className="page-body">
        {/* Trip hero */}
        <div style={{
          background: 'linear-gradient(135deg, #4A90D9 0%, #5BA3E8 50%, #74B9FF 100%)',
          borderRadius: 'var(--radius-xl)',
          padding: '32px 40px',
          color: '#fff',
          marginBottom: 'var(--spacing-xl)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacing-xl)',
          boxShadow: '0 8px 32px rgba(74,144,217,0.3)',
        }}>
          <div style={{ fontSize: 80, lineHeight: 1 }}>{trip.coverEmoji}</div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 26, fontWeight: 900, marginBottom: 8 }}>{trip.title}</h2>
            <div style={{ opacity: 0.9, marginBottom: 16, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <span>📍 {trip.destination}</span>
              <span>📅 {trip.plannedMonth}（{trip.season}）</span>
              {trip.budget && <span>💰 预算 ¥{trip.budget.toLocaleString()}</span>}
            </div>
            {trip.notes && (
              <p style={{ fontSize: 14, opacity: 0.85, background: 'rgba(255,255,255,0.15)', padding: '8px 14px', borderRadius: 10 }}>
                📝 {trip.notes}
              </p>
            )}
          </div>

          {/* Checklist progress ring */}
          {checklist.length > 0 && (
            <div style={{ textAlign: 'center', minWidth: 80 }}>
              <div style={{
                width: 72, height: 72,
                borderRadius: '50%',
                background: `conic-gradient(#FFD700 ${progress * 3.6}deg, rgba(255,255,255,0.3) 0deg)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, fontWeight: 900,
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                margin: '0 auto 8px',
              }}>
                {progress}%
              </div>
              <div style={{ fontSize: 12, opacity: 0.9 }}>准备进度</div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="tabs">
          {TABS.map(tab => (
            <button
              key={tab.key}
              className={`tab-btn${activeTab === tab.key ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
              {tab.count > 0 && (
                <span style={{
                  marginLeft: 6,
                  background: activeTab === tab.key ? 'var(--color-primary)' : 'var(--color-border)',
                  color: activeTab === tab.key ? '#fff' : 'var(--color-text-light)',
                  borderRadius: 12,
                  padding: '1px 7px',
                  fontSize: 11,
                  fontWeight: 700,
                }}>{tab.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Tab: Checklist */}
        {activeTab === 'checklist' && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">📋 旅行备忘清单</span>
              <span style={{ fontSize: 13, color: 'var(--color-text-light)' }}>
                {doneCount}/{checklist.length} 已完成
              </span>
            </div>
            <div className="progress-bar" style={{ marginBottom: 'var(--spacing-md)' }}>
              <div
                className="progress-fill"
                style={{
                  width: `${progress}%`,
                  background: progress === 100 ? 'var(--color-success)' : 'linear-gradient(90deg, var(--color-primary), var(--color-accent))',
                }}
              />
            </div>
            {checklist.map(item => {
              const assignee = getMember(item.assignee);
              return (
                <div key={item.id} className={`check-item${item.done ? ' done' : ''}`}>
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={() => toggleCheck(item.id)}
                  />
                  <span className="check-label" style={{ flex: 1, fontSize: 15 }}>{item.item}</span>
                  {assignee && (
                    <span style={{ fontSize: 12, color: 'var(--color-text-light)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      {assignee.avatar} {assignee.name}
                    </span>
                  )}
                </div>
              );
            })}
            {checklist.length === 0 && (
              <div className="empty-state" style={{ padding: 'var(--spacing-lg)' }}>
                <p>📋 暂无备忘事项</p>
              </div>
            )}
          </div>
        )}

        {/* Tab: Member Assignments */}
        {activeTab === 'members' && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">👥 成员分工</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
              {trip.assignments.map((a, i) => {
                const member = getMember(a.memberId);
                return (
                  <div key={i} style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 'var(--spacing-md)',
                    padding: 'var(--spacing-md)',
                    background: '#FFF9F0',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                  }}>
                    <div className="avatar" style={{ background: member?.color + '22' || '#eee', fontSize: 28 }}>
                      {member?.avatar || '👤'}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
                        {member?.name || '未知成员'}
                        <span style={{
                          marginLeft: 8,
                          fontSize: 11,
                          background: member?.role === 'parent' ? '#D6EAF8' : '#FFE5D9',
                          color: member?.role === 'parent' ? '#1A5276' : '#784212',
                          padding: '1px 8px',
                          borderRadius: 10,
                        }}>
                          {member?.role === 'parent' ? '家长' : '孩子'}
                        </span>
                      </div>
                      <div style={{ fontSize: 14, color: 'var(--color-text-light)' }}>🎯 {a.task}</div>
                    </div>
                  </div>
                );
              })}
              {trip.assignments.length === 0 && (
                <div className="empty-state" style={{ padding: 'var(--spacing-lg)' }}>
                  <p>👥 暂无成员分工安排</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab: Wishes */}
        {activeTab === 'wishes' && (
          <div className="card" style={{ background: 'linear-gradient(135deg, #FFFDE7, #FFFFFF)' }}>
            <div className="card-header">
              <span className="card-title">💫 孩子的旅行愿望</span>
              <Link to="/trips/wishes" className="btn btn-outline btn-sm">提交愿望</Link>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
              {trip.wishes.map(wish => {
                const member = getMember(wish.memberId);
                const statusInfo = WISH_STATUS_MAP[wish.status] || WISH_STATUS_MAP.pending;
                return (
                  <div key={wish.id} style={{
                    display: 'flex',
                    gap: 'var(--spacing-md)',
                    padding: 'var(--spacing-md)',
                    background: '#FFFFFF',
                    borderRadius: 'var(--radius-md)',
                    border: '2px solid #FFD700',
                  }}>
                    <div style={{ fontSize: 32 }}>{member?.avatar || '👶'}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{member?.name}</div>
                      <div style={{ fontSize: 15 }}>"{wish.content}"</div>
                    </div>
                    <span className={`badge ${statusInfo.badge}`}>
                      {statusInfo.emoji} {statusInfo.label}
                    </span>
                  </div>
                );
              })}
              {trip.wishes.length === 0 && (
                <div className="empty-state" style={{ padding: 'var(--spacing-lg)' }}>
                  <span style={{ fontSize: 40 }}>💫</span>
                  <p>孩子还没有提交愿望，快去添加！</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab: Booking Links */}
        {activeTab === 'links' && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">🔗 预订链接</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
              {trip.bookingLinks.map((link, i) => (
                <a
                  key={i}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--spacing-md)',
                    padding: 'var(--spacing-md)',
                    background: '#F0F8FF',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-secondary)',
                    textDecoration: 'none',
                    color: 'var(--color-text)',
                    transition: 'all 0.2s',
                  }}
                  onMouseOver={e => { e.currentTarget.style.background = '#D6EAF8'; }}
                  onMouseOut={e => { e.currentTarget.style.background = '#F0F8FF'; }}
                >
                  <span style={{ fontSize: 28 }}>{link.icon}</span>
                  <span style={{ fontWeight: 600 }}>{link.label}</span>
                  <span style={{ marginLeft: 'auto', color: 'var(--color-secondary)', fontSize: 13 }}>
                    {link.url} ↗
                  </span>
                </a>
              ))}
              {trip.bookingLinks.length === 0 && (
                <div className="empty-state" style={{ padding: 'var(--spacing-lg)' }}>
                  <p>🔗 暂无预订链接</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
