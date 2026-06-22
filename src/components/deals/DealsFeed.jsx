import { useState } from 'react';
import { Link } from 'react-router-dom';
import dealsData from '../../data/deals.json';
import { extractDealFromMessage, groupDealsByDate, getCategoryInfo } from '../../utils/dealExtractor.js';

const CATEGORY_FILTERS = [
  { key: 'all',      label: '全部',     emoji: '🏷️' },
  { key: 'flights',  label: '机票',     emoji: '✈️' },
  { key: 'hotels',   label: '酒店',     emoji: '🏨' },
  { key: 'packages', label: '旅游套餐', emoji: '🧳' },
  { key: 'shopping', label: '网购优惠', emoji: '🛍️' },
];

export default function DealsFeed() {
  const [deals, setDeals] = useState(dealsData);
  const [activeTab, setActiveTab] = useState('digest');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [rawMessage, setRawMessage] = useState('');
  const [importSource, setImportSource] = useState('旅行社微信群');
  const [importResult, setImportResult] = useState(null);
  const [justImported, setJustImported] = useState(null);

  function toggleBookmark(id) {
    setDeals(prev => prev.map(d => d.id === id ? { ...d, isBookmarked: !d.isBookmarked } : d));
  }

  function handleImport(e) {
    e.preventDefault();
    if (!rawMessage.trim()) return;
    const extracted = extractDealFromMessage(rawMessage, importSource);
    if (extracted) {
      setDeals(prev => [extracted, ...prev]);
      setImportResult(extracted);
      setJustImported(extracted.id);
      setRawMessage('');
      setTimeout(() => { setJustImported(null); setImportResult(null); }, 5000);
    }
  }

  const filtered = categoryFilter === 'all'
    ? deals
    : deals.filter(d => d.category === categoryFilter);

  const activeDeals = filtered.filter(d => d.status === 'active');
  const bookmarked = filtered.filter(d => d.isBookmarked);

  const digestByDate = groupDealsByDate(deals.filter(d => d.status === 'active'));
  const digestDates = Object.keys(digestByDate).sort((a, b) => b.localeCompare(a));

  const TABS = [
    { key: 'digest',     label: '📰 每日汇总',   count: digestDates.length },
    { key: 'active',     label: '🔥 全部促销',   count: activeDeals.length },
    { key: 'bookmarked', label: '⭐ 已收藏',      count: bookmarked.length },
    { key: 'import',     label: '📥 导入消息',   count: null },
  ];

  return (
    <div>
      <div className="page-header">
        <h1>🏷️ 促销信息</h1>
        <div style={{ display: 'flex', gap: 'var(--spacing-sm)', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--color-text-light)' }}>
            活跃促销：<strong style={{ color: 'var(--color-danger)' }}>{deals.filter(d => d.status === 'active').length}</strong> 条
          </span>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => setActiveTab('import')}
          >
            📥 导入消息
          </button>
          <Link className="btn btn-secondary btn-sm" to="/agency-upload">
            📤 商家投稿入口
          </Link>
        </div>
      </div>

      <div className="page-body">
        {/* Category filter chips */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 'var(--spacing-md)', flexWrap: 'wrap' }}>
          {CATEGORY_FILTERS.map(cat => (
            <button
              key={cat.key}
              onClick={() => setCategoryFilter(cat.key)}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--radius-full)',
                border: '2px solid',
                borderColor: categoryFilter === cat.key ? 'var(--color-primary)' : 'var(--color-border)',
                background: categoryFilter === cat.key ? 'var(--color-primary)' : 'transparent',
                color: categoryFilter === cat.key ? '#fff' : 'var(--color-text)',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                transition: 'all 0.2s',
              }}
            >
              {cat.emoji} {cat.label}
            </button>
          ))}
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
              {tab.count !== null && (
                <span style={{
                  marginLeft: 6,
                  background: activeTab === tab.key ? 'var(--color-primary)' : 'var(--color-border)',
                  color: activeTab === tab.key ? '#fff' : 'var(--color-text-light)',
                  borderRadius: 12, padding: '1px 7px', fontSize: 11, fontWeight: 700,
                }}>{tab.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Digest view */}
        {activeTab === 'digest' && (
          <div>
            {digestDates.length === 0 ? (
              <div className="empty-state">
                <span className="empty-emoji">📰</span>
                <p>暂无每日汇总</p>
              </div>
            ) : (
              digestDates.map(date => {
                const dayDeals = digestByDate[date]?.filter(d =>
                  categoryFilter === 'all' || d.category === categoryFilter
                ) || [];
                if (dayDeals.length === 0) return null;
                return (
                  <div key={date} style={{ marginBottom: 'var(--spacing-xl)' }}>
                    <div className="section-title">
                      📅 {date}（{dayDeals.length} 条促销）
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                      {dayDeals.map(deal => (
                        <DealCard key={deal.id} deal={deal} onBookmark={toggleBookmark} highlight={deal.id === justImported} />
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Active deals */}
        {activeTab === 'active' && (
          <div>
            {activeDeals.length === 0 ? (
              <div className="empty-state">
                <span className="empty-emoji">🏷️</span>
                <p>暂无活跃促销信息</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                {activeDeals.map(deal => (
                  <DealCard key={deal.id} deal={deal} onBookmark={toggleBookmark} highlight={deal.id === justImported} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Bookmarked */}
        {activeTab === 'bookmarked' && (
          <div>
            {bookmarked.length === 0 ? (
              <div className="empty-state">
                <span className="empty-emoji">⭐</span>
                <p>还没有收藏的促销，点击促销卡片上的 ⭐ 收藏！</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                {bookmarked.map(deal => (
                  <DealCard key={deal.id} deal={deal} onBookmark={toggleBookmark} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Import panel */}
        {activeTab === 'import' && (
          <ImportPanel
            rawMessage={rawMessage}
            setRawMessage={setRawMessage}
            importSource={importSource}
            setImportSource={setImportSource}
            onImport={handleImport}
            importResult={importResult}
          />
        )}
      </div>
    </div>
  );
}

function DealCard({ deal, onBookmark, highlight }) {
  const [expanded, setExpanded] = useState(false);
  const catInfo = getCategoryInfo(deal.category);

  return (
    <div
      className="deal-card"
      style={{
        borderLeft: `4px solid ${catInfo.color}`,
        background: highlight ? '#FFF9C4' : undefined,
        transition: 'background 0.5s',
      }}
    >
      <div style={{ display: 'flex', gap: 'var(--spacing-md)', alignItems: 'flex-start' }}>
        {/* Category icon */}
        <div style={{
          width: 48, height: 48,
          borderRadius: 'var(--radius-md)',
          background: catInfo.color + '22',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 24, flexShrink: 0,
        }}>
          {catInfo.emoji}
        </div>

        {/* Main content */}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{deal.title}</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-light)', marginBottom: 6 }}>
                📍 来源：{deal.source}
                {deal.validUntil && ` · ⏰ 有效至 ${deal.validUntil}`}
              </div>
            </div>

            {/* Price */}
            {deal.price && (
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div className="deal-price">¥{deal.price.toLocaleString()}</div>
                {deal.originalPrice && (
                  <div className="deal-original-price">原价¥{deal.originalPrice.toLocaleString()}</div>
                )}
                {deal.discount && (
                  <div className="deal-discount-badge">{deal.discount}</div>
                )}
              </div>
            )}
          </div>

          {/* Description */}
          <p style={{ fontSize: 13, color: 'var(--color-text-light)', marginBottom: 8 }}>
            {deal.description}
          </p>

          {/* Tags */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {deal.tags.slice(0, 4).map(tag => (
              <span key={tag} className="badge badge-secondary" style={{ fontSize: 11 }}>#{tag}</span>
            ))}
            <button
              onClick={() => setExpanded(!expanded)}
              style={{ background: 'none', border: 'none', color: 'var(--color-secondary)', fontSize: 12, cursor: 'pointer' }}
            >
              {expanded ? '收起 ▲' : '原文 ▼'}
            </button>
          </div>

          {expanded && deal.rawMessage && (
            <div style={{
              marginTop: 8,
              padding: 'var(--spacing-sm)',
              background: '#F8F9FA',
              borderRadius: 'var(--radius-sm)',
              fontSize: 12,
              color: 'var(--color-text-light)',
              fontStyle: 'italic',
              borderLeft: '3px solid var(--color-border)',
            }}>
              原始消息：{deal.rawMessage}
            </div>
          )}
        </div>

        {/* Bookmark button */}
        <button
          onClick={() => onBookmark(deal.id)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 22, opacity: deal.isBookmarked ? 1 : 0.3,
            transition: 'all 0.2s', flexShrink: 0,
          }}
          title={deal.isBookmarked ? '取消收藏' : '收藏'}
        >
          ⭐
        </button>
      </div>
    </div>
  );
}

function ImportPanel({ rawMessage, setRawMessage, importSource, setImportSource, onImport, importResult }) {
  const DEMO_MESSAGES = [
    '【机票特惠】南方航空 广州→东京成田，往返含税仅需2080元/人！元旦出发，座位有限！今晚12点截止！',
    '希尔顿酒店双11特惠！上海静安希尔顿，标准大床房原价1580元/晚，活动价680元！含早餐，可退改。',
    '京东618大促！戴森吸尘器V12 Detect Slim，原价3990，现在到手1999！今天最后一天！速抢！',
  ];

  return (
    <div className="grid-2">
      <div>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 'var(--spacing-md)' }}>
            📥 从微信导入促销消息
          </div>
          <div className="alert alert-info" style={{ marginBottom: 'var(--spacing-md)', fontSize: 13 }}>
            💡 将微信群里的促销消息粘贴到下方，系统将自动识别并提取关键信息（价格、目的地、分类等）。
            <br/>
            <em>未来版本将支持直接从微信消息导入，目前为 MVP 手动粘贴模式。</em>
          </div>

          <form onSubmit={onImport}>
            <div className="form-group">
              <label className="form-label">消息来源</label>
              <input
                className="form-control"
                placeholder="例如：旅行社微信群、购物优惠群"
                value={importSource}
                onChange={e => setImportSource(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">促销消息内容</label>
              <textarea
                className="form-control"
                rows={6}
                placeholder="把微信群里的促销消息粘贴到这里..."
                value={rawMessage}
                onChange={e => setRawMessage(e.target.value)}
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary w-full btn-lg"
              disabled={!rawMessage.trim()}
            >
              🤖 自动提取促销信息
            </button>
          </form>

          {importResult && (
            <div className="alert alert-success" style={{ marginTop: 'var(--spacing-md)' }}>
              ✅ 已成功提取并添加：<strong>{importResult.title}</strong>
              {importResult.price && ` · 价格：¥${importResult.price}`}
              <br/>
              分类：{getCategoryInfo(importResult.category).emoji} {getCategoryInfo(importResult.category).label}
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 'var(--spacing-md)' }}>
            💡 示例消息（点击填入）
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
            {DEMO_MESSAGES.map((msg, i) => (
              <div
                key={i}
                onClick={() => setRawMessage(msg)}
                style={{
                  padding: 'var(--spacing-md)',
                  background: '#F8F9FA',
                  borderRadius: 'var(--radius-md)',
                  border: '1px dashed var(--color-border)',
                  cursor: 'pointer',
                  fontSize: 13,
                  color: 'var(--color-text-light)',
                  transition: 'all 0.2s',
                }}
                onMouseOver={e => { e.currentTarget.style.background = '#E8F4FD'; e.currentTarget.style.borderColor = 'var(--color-secondary)'; }}
                onMouseOut={e => { e.currentTarget.style.background = '#F8F9FA'; e.currentTarget.style.borderColor = 'var(--color-border)'; }}
              >
                <span style={{ fontWeight: 600, color: 'var(--color-secondary)', marginRight: 8 }}>示例 {i+1}：</span>
                {msg.length > 80 ? msg.slice(0, 80) + '…' : msg}
              </div>
            ))}
          </div>

          <div className="alert alert-info" style={{ marginTop: 'var(--spacing-md)' }}>
            <div>
              <strong>🔮 未来规划</strong>
              <ul style={{ marginTop: 8, paddingLeft: 20, lineHeight: 2 }}>
                <li>📱 微信扫码登录后自动关联群聊</li>
                <li>🤖 AI 自动识别并结构化促销信息</li>
                <li>🔔 价格低于目标时推送微信通知</li>
                <li>📊 历史价格趋势对比</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
