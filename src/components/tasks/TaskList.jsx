import { useState } from 'react';
import tasksData from '../../data/tasks.json';
import membersData from '../../data/members.json';

const REPEAT_LABELS = {
  daily:   { label: '每日', badge: 'badge-primary',   emoji: '🔁' },
  weekly:  { label: '每周', badge: 'badge-secondary', emoji: '📅' },
  monthly: { label: '每月', badge: 'badge-purple',    emoji: '🗓️' },
};

const CATEGORY_COLORS = {
  '清洁': '#4A90D9',
  '家务': '#27AE60',
  '厨房': '#E67E22',
  '学习': '#9B59B6',
};

export default function TaskList() {
  const [tasks, setTasks] = useState(tasksData);
  const [activeTab, setActiveTab] = useState('all');

  const memberPoints = membersData.reduce((acc, m) => {
    acc[m.id] = m.points +
      tasks
        .filter(t => t.completed && t.assignedTo.includes(m.id))
        .reduce((sum, t) => sum + t.points, 0);
    return acc;
  }, {});

  function toggleTask(taskId) {
    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, completed: !t.completed } : t
    ));
  }

  const filterMap = {
    all:     tasks,
    daily:   tasks.filter(t => t.repeatType === 'daily'),
    weekly:  tasks.filter(t => t.repeatType === 'weekly'),
    monthly: tasks.filter(t => t.repeatType === 'monthly'),
  };

  const filtered = filterMap[activeTab] || tasks;
  const pending = filtered.filter(t => !t.completed);
  const done = filtered.filter(t => t.completed);

  const getMember = id => membersData.find(m => m.id === id);

  const TABS = [
    { key: 'all',     label: '全部',   count: tasks.length },
    { key: 'daily',   label: '每日',   count: tasks.filter(t => t.repeatType === 'daily').length },
    { key: 'weekly',  label: '每周',   count: tasks.filter(t => t.repeatType === 'weekly').length },
    { key: 'monthly', label: '每月',   count: tasks.filter(t => t.repeatType === 'monthly').length },
  ];

  return (
    <div>
      <div className="page-header">
        <h1>✅ 家庭任务</h1>
        <div style={{ display: 'flex', gap: 'var(--spacing-sm)', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--color-text-light)' }}>
            今日完成：
            <strong style={{ color: 'var(--color-success)' }}>
              {tasks.filter(t => t.completed).length}/{tasks.length}
            </strong>
          </span>
        </div>
      </div>

      <div className="page-body">
        <div className="grid-2" style={{ marginBottom: 'var(--spacing-xl)' }}>
          {/* Points leaderboard */}
          <div className="card" style={{ background: 'linear-gradient(135deg, #FFF9C4, #FFFDE7)', border: '2px solid #FFD700' }}>
            <div className="card-title" style={{ marginBottom: 'var(--spacing-md)' }}>
              🏆 积分榜
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
              {membersData
                .filter(m => m.role === 'child')
                .sort((a, b) => (memberPoints[b.id] || 0) - (memberPoints[a.id] || 0))
                .map((member, index) => {
                  const pts = memberPoints[member.id] || 0;
                  const maxPts = Math.max(...membersData.filter(m => m.role === 'child').map(m => memberPoints[m.id] || 1));
                  return (
                    <div key={member.id} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--spacing-md)',
                      padding: 'var(--spacing-sm)',
                      background: '#fff',
                      borderRadius: 'var(--radius-md)',
                    }}>
                      <div style={{ fontSize: 24, minWidth: 32, textAlign: 'center' }}>
                        {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                      </div>
                      <div style={{ fontSize: 28 }}>{member.avatar}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{member.name}</div>
                        <div className="progress-bar">
                          <div
                            className="progress-fill"
                            style={{
                              width: `${(pts / maxPts) * 100}%`,
                              background: `linear-gradient(90deg, ${member.color}, ${member.color}99)`,
                            }}
                          />
                        </div>
                      </div>
                      <div className="points-badge">⭐ {pts}</div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Progress summary */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 'var(--spacing-md)' }}>
              📊 任务进度
            </div>
            {['daily', 'weekly', 'monthly'].map(type => {
              const typeTasks = tasks.filter(t => t.repeatType === type);
              const doneTasks = typeTasks.filter(t => t.completed);
              const pct = typeTasks.length > 0 ? Math.round((doneTasks.length / typeTasks.length) * 100) : 0;
              const r = REPEAT_LABELS[type];
              return (
                <div key={type} style={{ marginBottom: 'var(--spacing-md)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                    <span>{r.emoji} {r.label}任务</span>
                    <span style={{ fontWeight: 700 }}>{doneTasks.length}/{typeTasks.length} · {pct}%</span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{
                        width: `${pct}%`,
                        background: pct === 100 ? 'var(--color-success)' : 'var(--color-secondary)',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Task list */}
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
                borderRadius: 12,
                padding: '1px 7px',
                fontSize: 11,
                fontWeight: 700,
              }}>{tab.count}</span>
            </button>
          ))}
        </div>

        {/* Pending tasks */}
        {pending.length > 0 && (
          <div className="card" style={{ marginBottom: 'var(--spacing-md)' }}>
            <div className="card-header">
              <span className="card-title">📋 待完成（{pending.length}）</span>
            </div>
            {pending.map(task => (
              <TaskItem key={task.id} task={task} onToggle={toggleTask} getMember={getMember} />
            ))}
          </div>
        )}

        {/* Done tasks */}
        {done.length > 0 && (
          <div className="card" style={{ opacity: 0.8 }}>
            <div className="card-header">
              <span className="card-title" style={{ color: 'var(--color-text-light)' }}>
                ✅ 已完成（{done.length}）
              </span>
            </div>
            {done.map(task => (
              <TaskItem key={task.id} task={task} onToggle={toggleTask} getMember={getMember} done />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TaskItem({ task, onToggle, getMember, done }) {
  const repeat = REPEAT_LABELS[task.repeatType];
  const catColor = CATEGORY_COLORS[task.category] || '#95A5A6';

  return (
    <div
      className={`check-item${done ? ' done' : ''}`}
      style={{ alignItems: 'flex-start', padding: 'var(--spacing-sm) 0' }}
    >
      <input
        type="checkbox"
        checked={task.completed}
        onChange={() => onToggle(task.id)}
        style={{ marginTop: 3 }}
      />
      <span style={{ fontSize: 22, lineHeight: 1, marginTop: 1 }}>{task.emoji}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 15 }}>{task.title}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className={`badge ${repeat?.badge}`}>{repeat?.emoji} {repeat?.label}</span>
          <span style={{
            fontSize: 11,
            padding: '1px 8px',
            borderRadius: 10,
            background: catColor + '22',
            color: catColor,
            fontWeight: 600,
          }}>{task.category}</span>
          <span style={{ fontSize: 12, color: 'var(--color-text-light)' }}>⏰ {task.dueTime}</span>
        </div>
        {task.assignedTo.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            {task.assignedTo.map(mid => {
              const m = getMember(mid);
              return m ? (
                <span key={mid} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 3 }}>
                  {m.avatar} {m.name}
                </span>
              ) : null;
            })}
          </div>
        )}
      </div>
      <div className="points-badge">⭐ +{task.points}</div>
    </div>
  );
}
