import { useState } from 'react';
import { Link } from 'react-router-dom';
import tripsData from '../../data/trips.json';
import membersData from '../../data/members.json';

const INITIAL_WISHES = tripsData.flatMap(trip =>
  trip.wishes.map(w => ({
    ...w,
    tripId: trip.id,
    tripTitle: trip.title,
    tripEmoji: trip.coverEmoji,
  }))
);

const WISH_STATUS_LABELS = {
  pending:  { label: '待审核', badge: 'badge-warning',   emoji: '⏳' },
  approved: { label: '已采纳', badge: 'badge-success',   emoji: '✅' },
  rejected: { label: '待考虑', badge: 'badge-gray',      emoji: '💭' },
};

export default function TripWishes() {
  const [wishes, setWishes] = useState(INITIAL_WISHES);
  const [newWish, setNewWish] = useState('');
  const [selectedMember, setSelectedMember] = useState('m3');
  const [selectedTrip, setSelectedTrip] = useState(tripsData[0]?.id || '');
  const [submitted, setSubmitted] = useState(false);

  const children = membersData.filter(m => m.role === 'child');

  function handleSubmit(e) {
    e.preventDefault();
    if (!newWish.trim()) return;
    const trip = tripsData.find(t => t.id === selectedTrip);
    const wish = {
      id: `w_${Date.now()}`,
      memberId: selectedMember,
      content: newWish.trim(),
      status: 'pending',
      tripId: selectedTrip,
      tripTitle: trip?.title || '',
      tripEmoji: trip?.coverEmoji || '✈️',
    };
    setWishes(prev => [wish, ...prev]);
    setNewWish('');
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 3000);
  }

  const pendingWishes = wishes.filter(w => w.status === 'pending');
  const approvedWishes = wishes.filter(w => w.status === 'approved');

  return (
    <div>
      <div className="page-header">
        <h1>
          <Link to="/trips" style={{ color: 'var(--color-text-light)', fontSize: 18 }}>✈️ 旅行</Link>
          <span style={{ margin: '0 8px', color: 'var(--color-text-light)' }}>/</span>
          💫 孩子旅行愿望
        </h1>
      </div>

      <div className="page-body">
        <div className="grid-2">
          {/* Submit form */}
          <div>
            <div className="card" style={{ background: 'linear-gradient(135deg, #FFF9C4, #FFFDE7)', border: '2px solid #FFD700' }}>
              <div className="card-title" style={{ fontSize: 18, marginBottom: 'var(--spacing-md)' }}>
                🌟 提交旅行愿望
              </div>
              <p style={{ fontSize: 14, color: 'var(--color-text-light)', marginBottom: 'var(--spacing-md)' }}>
                小朋友们，告诉爸爸妈妈你最想去哪里、想做什么！
              </p>

              {submitted && (
                <div className="alert alert-success" style={{ marginBottom: 'var(--spacing-md)' }}>
                  🎉 愿望已提交！爸爸妈妈会认真考虑的～
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label className="form-label">我是谁</label>
                  <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
                    {children.map(child => (
                      <button
                        key={child.id}
                        type="button"
                        onClick={() => setSelectedMember(child.id)}
                        style={{
                          padding: '8px 16px',
                          borderRadius: 'var(--radius-lg)',
                          border: '2px solid',
                          borderColor: selectedMember === child.id ? child.color : 'var(--color-border)',
                          background: selectedMember === child.id ? child.color + '22' : 'transparent',
                          cursor: 'pointer',
                          fontSize: 14,
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        {child.avatar} {child.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">想去哪个旅行</label>
                  <select
                    className="form-control"
                    value={selectedTrip}
                    onChange={e => setSelectedTrip(e.target.value)}
                  >
                    {tripsData.map(trip => (
                      <option key={trip.id} value={trip.id}>
                        {trip.coverEmoji} {trip.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">我的愿望 ✨</label>
                  <textarea
                    className="form-control"
                    placeholder="我想去看……我想吃……我想玩……"
                    value={newWish}
                    onChange={e => setNewWish(e.target.value)}
                    rows={3}
                  />
                </div>

                <button type="submit" className="btn btn-primary w-full btn-lg" disabled={!newWish.trim()}>
                  🌟 提交我的愿望！
                </button>
              </form>
            </div>

            {/* Stats */}
            <div style={{ display: 'flex', gap: 'var(--spacing-md)', marginTop: 'var(--spacing-md)' }}>
              <div className="card" style={{ flex: 1, textAlign: 'center', padding: 'var(--spacing-md)' }}>
                <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--color-warning)' }}>
                  {pendingWishes.length}
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-light)' }}>⏳ 待审核</div>
              </div>
              <div className="card" style={{ flex: 1, textAlign: 'center', padding: 'var(--spacing-md)' }}>
                <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--color-success)' }}>
                  {approvedWishes.length}
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-light)' }}>✅ 已采纳</div>
              </div>
              <div className="card" style={{ flex: 1, textAlign: 'center', padding: 'var(--spacing-md)' }}>
                <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--color-primary)' }}>
                  {wishes.length}
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-light)' }}>💫 全部愿望</div>
              </div>
            </div>
          </div>

          {/* Wish list */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 'var(--spacing-md)' }}>
              💫 所有愿望清单
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)', maxHeight: 600, overflowY: 'auto' }}>
              {wishes.map(wish => {
                const member = membersData.find(m => m.id === wish.memberId);
                const statusInfo = WISH_STATUS_LABELS[wish.status] || WISH_STATUS_LABELS.pending;
                return (
                  <div key={wish.id} style={{
                    display: 'flex',
                    gap: 'var(--spacing-sm)',
                    padding: 'var(--spacing-md)',
                    background: wish.status === 'approved' ? '#D5F5E3' : wish.status === 'rejected' ? '#F2F3F4' : '#FFFDE7',
                    borderRadius: 'var(--radius-md)',
                    border: `2px solid ${wish.status === 'approved' ? '#27AE60' : wish.status === 'rejected' ? '#ddd' : '#FFD700'}`,
                  }}>
                    <div style={{ fontSize: 28 }}>{member?.avatar || '👶'}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>{member?.name}</span>
                        <span style={{ fontSize: 12, color: 'var(--color-text-light)' }}>
                          → {wish.tripEmoji} {wish.tripTitle}
                        </span>
                      </div>
                      <div style={{ fontSize: 14 }}>"{wish.content}"</div>
                    </div>
                    <span className={`badge ${statusInfo.badge}`} style={{ alignSelf: 'flex-start', whiteSpace: 'nowrap' }}>
                      {statusInfo.emoji} {statusInfo.label}
                    </span>
                  </div>
                );
              })}
              {wishes.length === 0 && (
                <div className="empty-state">
                  <span className="empty-emoji">💫</span>
                  <p>还没有愿望，快去提交吧！</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
