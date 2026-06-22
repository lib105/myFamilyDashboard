import { NavLink, Outlet, useNavigate } from 'react-router-dom';

const NAV_ITEMS = [
  { path: '/',         emoji: '🏠', label: '首页',   end: true },
  { path: '/trips',    emoji: '✈️', label: '旅行' },
  { path: '/tasks',    emoji: '✅', label: '任务' },
  { path: '/shopping', emoji: '🛒', label: '购物' },
  { path: '/deals',    emoji: '🏷️', label: '促销' },
  { path: '/agency-upload', emoji: '📤', label: '商家投稿' },
  { path: '/login',    emoji: '👤', label: '登录' },
];

export default function AppLayout() {
  const navigate = useNavigate();

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-brand" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
          <span className="brand-emoji">🏡</span>
          <div className="brand-title">家庭仪表盘</div>
          <div className="brand-subtitle">Family Dashboard</div>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              <span className="nav-emoji">{item.emoji}</span>
              <span className="nav-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div>© 2024 我们的家</div>
          <div style={{ marginTop: 4, fontSize: 11, opacity: 0.7 }}>MVP v1.0</div>
        </div>
      </aside>

      {/* Main content */}
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
