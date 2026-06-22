import { useState } from 'react';
import shoppingData from '../../data/shopping.json';
import membersData from '../../data/members.json';

const CATEGORIES = ['全部', '食品', '日用品', '健康', '孩子用品'];

const CATEGORY_COLORS = {
  '食品':   { color: '#27AE60', bg: '#D5F5E3', emoji: '🥦' },
  '日用品': { color: '#4A90D9', bg: '#D6EAF8', emoji: '🏠' },
  '健康':   { color: '#E74C3C', bg: '#FADBD8', emoji: '💊' },
  '孩子用品': { color: '#9B59B6', bg: '#E8DAEF', emoji: '🧸' },
};

export default function ShoppingList() {
  const [items, setItems] = useState(shoppingData);
  const [activeTab, setActiveTab] = useState('shopping');
  const [categoryFilter, setCategoryFilter] = useState('全部');
  const [newItem, setNewItem] = useState('');
  const [newCategory, setNewCategory] = useState('食品');
  const [newEmoji, setNewEmoji] = useState('🛒');

  const toggleNeeded = (id) => {
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, needed: !item.needed } : item
    ));
  };

  const toggleFavorite = (id) => {
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, isFavorite: !item.isFavorite } : item
    ));
  };

  const addItem = (e) => {
    e.preventDefault();
    if (!newItem.trim()) return;
    const item = {
      id: `s_${Date.now()}`,
      name: newItem.trim(),
      emoji: newEmoji,
      category: newCategory,
      quantity: 0,
      unit: '个',
      lowStockThreshold: 1,
      isFavorite: false,
      needed: true,
      addedBy: 'm1',
    };
    setItems(prev => [item, ...prev]);
    setNewItem('');
  };

  const getMember = id => membersData.find(m => m.id === id);

  const lowStockItems = items.filter(i => i.quantity < i.lowStockThreshold);
  const neededItems = items.filter(i => i.needed);
  const favoriteItems = items.filter(i => i.isFavorite);

  const filteredByCategory = (list) =>
    categoryFilter === '全部' ? list : list.filter(i => i.category === categoryFilter);

  const TABS = [
    { key: 'shopping',  label: '🛒 购物清单',  count: neededItems.length },
    { key: 'lowstock',  label: '⚠️ 库存不足',  count: lowStockItems.length },
    { key: 'favorites', label: '⭐ 常买商品',   count: favoriteItems.length },
    { key: 'all',       label: '📦 全部库存',   count: items.length },
  ];

  const displayItems = (() => {
    switch (activeTab) {
      case 'shopping':  return filteredByCategory(neededItems);
      case 'lowstock':  return filteredByCategory(lowStockItems);
      case 'favorites': return filteredByCategory(favoriteItems);
      default:          return filteredByCategory(items);
    }
  })();

  return (
    <div>
      <div className="page-header">
        <h1>🛒 购物清单</h1>
        <div style={{ display: 'flex', gap: 'var(--spacing-sm)', alignItems: 'center' }}>
          {lowStockItems.length > 0 && (
            <span className="badge badge-danger">⚠️ {lowStockItems.length} 项库存不足</span>
          )}
          <span style={{ fontSize: 13, color: 'var(--color-text-light)' }}>
            待购：<strong style={{ color: 'var(--color-primary)' }}>{neededItems.length}</strong> 件
          </span>
        </div>
      </div>

      <div className="page-body">
        {/* Low stock alerts */}
        {lowStockItems.length > 0 && (
          <div className="alert alert-warning" style={{ marginBottom: 'var(--spacing-lg)' }}>
            <div>
              <strong>⚠️ 库存不足提醒：</strong>
              {lowStockItems.map(item => (
                <span key={item.id} style={{ marginLeft: 8 }}>
                  {item.emoji} {item.name}（剩 {item.quantity}{item.unit}）
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="grid-2">
          {/* Main list */}
          <div style={{ gridColumn: 'span 1' }}>
            {/* Tabs */}
            <div className="tabs">
              {TABS.map(tab => (
                <button
                  key={tab.key}
                  className={`tab-btn${activeTab === tab.key ? ' active' : ''}`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                  <span style={{
                    marginLeft: 6,
                    background: activeTab === tab.key ? 'var(--color-primary)' : 'var(--color-border)',
                    color: activeTab === tab.key ? '#fff' : 'var(--color-text-light)',
                    borderRadius: 12, padding: '1px 7px', fontSize: 11, fontWeight: 700,
                  }}>{tab.count}</span>
                </button>
              ))}
            </div>

            {/* Category filter */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 'var(--spacing-md)', flexWrap: 'wrap' }}>
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`badge ${categoryFilter === cat ? 'badge-primary' : 'badge-gray'}`}
                  style={{ cursor: 'pointer', border: 'none', fontSize: 12, padding: '4px 12px' }}
                >
                  {cat !== '全部' && CATEGORY_COLORS[cat]?.emoji + ' '}{cat}
                </button>
              ))}
            </div>

            {/* Items */}
            <div className="card">
              {displayItems.length === 0 ? (
                <div className="empty-state" style={{ padding: 'var(--spacing-lg)' }}>
                  <span style={{ fontSize: 40 }}>✅</span>
                  <p>太好了，没有需要注意的商品！</p>
                </div>
              ) : (
                displayItems.map(item => (
                  <ShoppingItem
                    key={item.id}
                    item={item}
                    getMember={getMember}
                    onToggleNeeded={toggleNeeded}
                    onToggleFavorite={toggleFavorite}
                  />
                ))
              )}
            </div>
          </div>

          {/* Add item form + category summary */}
          <div>
            {/* Add new item */}
            <div className="card" style={{ marginBottom: 'var(--spacing-md)' }}>
              <div className="card-title" style={{ marginBottom: 'var(--spacing-md)' }}>
                ➕ 添加购物项目
              </div>
              <form onSubmit={addItem}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 'var(--spacing-sm)' }}>
                  <input
                    className="form-control"
                    placeholder="商品 Emoji"
                    value={newEmoji}
                    onChange={e => setNewEmoji(e.target.value)}
                    style={{ width: 70, textAlign: 'center', fontSize: 20 }}
                  />
                  <input
                    className="form-control"
                    placeholder="商品名称"
                    value={newItem}
                    onChange={e => setNewItem(e.target.value)}
                    style={{ flex: 1 }}
                  />
                </div>
                <select
                  className="form-control"
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value)}
                  style={{ marginBottom: 'var(--spacing-sm)' }}
                >
                  {CATEGORIES.filter(c => c !== '全部').map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <button type="submit" className="btn btn-primary w-full" disabled={!newItem.trim()}>
                  ➕ 添加到购物清单
                </button>
              </form>
            </div>

            {/* Category stats */}
            <div className="card">
              <div className="card-title" style={{ marginBottom: 'var(--spacing-md)' }}>
                📊 分类统计
              </div>
              {CATEGORIES.filter(c => c !== '全部').map(cat => {
                const catItems = items.filter(i => i.category === cat);
                const catNeeded = catItems.filter(i => i.needed).length;
                const catInfo = CATEGORY_COLORS[cat];
                return (
                  <div key={cat} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--spacing-sm)',
                    padding: 'var(--spacing-sm)',
                    marginBottom: 8,
                    background: catInfo?.bg || '#F2F3F4',
                    borderRadius: 'var(--radius-md)',
                  }}>
                    <span style={{ fontSize: 22 }}>{catInfo?.emoji}</span>
                    <span style={{ flex: 1, fontWeight: 600, fontSize: 13, color: catInfo?.color }}>
                      {cat}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--color-text-light)' }}>
                      共 {catItems.length} 件
                    </span>
                    {catNeeded > 0 && (
                      <span className="badge badge-danger">{catNeeded} 待购</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ShoppingItem({ item, getMember, onToggleNeeded, onToggleFavorite }) {
  const isLow = item.quantity < item.lowStockThreshold;
  const catInfo = CATEGORY_COLORS[item.category];
  const adder = getMember(item.addedBy);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--spacing-sm)',
      padding: 'var(--spacing-sm) 0',
      borderBottom: '1px solid var(--color-border)',
    }}>
      <input
        type="checkbox"
        checked={!item.needed}
        onChange={() => onToggleNeeded(item.id)}
        style={{ width: 18, height: 18, accentColor: 'var(--color-success)' }}
      />
      <span style={{ fontSize: 22, lineHeight: 1 }}>{item.emoji}</span>
      <div style={{ flex: 1 }}>
        <div style={{
          fontWeight: 600,
          fontSize: 14,
          textDecoration: !item.needed ? 'line-through' : 'none',
          color: !item.needed ? 'var(--color-text-muted)' : 'var(--color-text)',
        }}>
          {item.name}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 11,
            padding: '1px 6px',
            borderRadius: 8,
            background: catInfo?.bg || '#F2F3F4',
            color: catInfo?.color || '#888',
            fontWeight: 600,
          }}>{item.category}</span>
          {isLow && (
            <span className="badge badge-danger" style={{ fontSize: 10 }}>
              ⚠️ 仅剩{item.quantity}{item.unit}
            </span>
          )}
          {adder && (
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
              by {adder.avatar} {adder.name}
            </span>
          )}
        </div>
      </div>
      <button
        onClick={() => onToggleFavorite(item.id)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: 18,
          opacity: item.isFavorite ? 1 : 0.3,
          transition: 'opacity 0.2s',
        }}
        title={item.isFavorite ? '取消常买' : '加入常买'}
      >
        ⭐
      </button>
    </div>
  );
}
