import { useGraph } from '../../ontology/index.js';
import { getFamilyProfiles, memberNameOf, memberNames } from '../../ontology/queries.js';
import {
  getTrips, tripProgress, toggleTripItem, TRIP_STATUS,
  getTasks, taskAssignees, taskScores, toggleTask, getTaskLogs, REPEAT_LABEL,
  getReminders, reminderMembers, toggleReminder, getHealthRecords,
} from '../../agents/familyAgents.js';

function Progress({ done, total, color }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex items-center gap-sm">
      <div className="progress-bar" style={{ flex: 1 }}>
        <div className="progress-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs text-muted">{done}/{total}</span>
    </div>
  );
}

export function TripsView({ args = {} }) {
  const graph = useGraph();
  const trips = getTrips(graph).filter(t => !args.tripId || t.id === args.tripId);
  if (!trips.length) return <div className="text-muted">暂无旅行计划</div>;
  const single = trips.length === 1;
  return (
    <div className="flex-col gap-md">
      {trips.map(trip => {
        const p = tripProgress(trip);
        const status = TRIP_STATUS[trip.status] || { label: trip.status, className: '' };
        return (
          <div key={trip.id} className="produce-card">
            <div className="produce-head">
              <span className="produce-emoji">{trip.coverEmoji || '🧳'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="font-bold">{trip.title}</div>
                <div className="text-xs text-muted">📍 {trip.destination} · 🗓️ {trip.plannedMonth} · 💰 ¥{Number(trip.budget || 0).toLocaleString()}</div>
              </div>
              <span className={`status-chip ${status.className}`}>{status.label}</span>
            </div>
            <Progress done={p.done} total={p.total} color="var(--color-secondary)" />
            {single && (
              <>
                <div className="group-title mt-sm">🧳 行前清单</div>
                <div className="flex-col">
                  {(trip.checklist || []).map(c => {
                    const who = memberNameOf(graph, c.memberId);
                    return (
                      <label key={c.id} className={`check-item${c.done ? ' done' : ''}`}>
                        <input type="checkbox" checked={Boolean(c.done)} onChange={() => toggleTripItem(graph, trip.id, c.id)} />
                        <span className="check-label text-sm" style={{ flex: 1 }}>{c.item}</span>
                        {who && <span className="mini-chip">{who}</span>}
                      </label>
                    );
                  })}
                </div>
                {(trip.assignments || []).length > 0 && (
                  <div className="chip-row mt-sm">
                    {trip.assignments.map(a => <span key={`${a.memberId}-${a.task}`} className="mini-chip">👤 {memberNameOf(graph, a.memberId) || '家人'}：{a.task}</span>)}
                  </div>
                )}
                {(trip.wishes || []).length > 0 && (
                  <div className="chip-row mt-sm">
                    {trip.wishes.map(w => (
                      <span key={w.id} className={`mini-chip ${w.status === 'approved' ? 'good' : ''}`}>💭 {memberNameOf(graph, w.memberId) || '家人'}：{w.content}</span>
                    ))}
                  </div>
                )}
                {(trip.bookingLinks || []).length > 0 && (
                  <div className="chip-row mt-sm">
                    {trip.bookingLinks.map(l => (
                      <a key={l.url} className="mini-chip link" href={l.url} target="_blank" rel="noopener noreferrer">{l.icon} {l.label}</a>
                    ))}
                  </div>
                )}
                {trip.notes && <div className="text-sm text-muted mt-sm">📝 {trip.notes}</div>}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function TasksView() {
  const graph = useGraph();
  const tasks = getTasks(graph);
  const scores = taskScores(graph);
  const recentLogs = getTaskLogs(graph).slice(0, 5);
  return (
    <div>
      <Progress done={tasks.filter(t => t.completed).length} total={tasks.length} color="var(--color-success)" />
      <div className="flex-col mt-sm">
        {tasks.map(t => (
          <label key={t.id} className={`check-item${t.completed ? ' done' : ''}`}>
            <input type="checkbox" checked={Boolean(t.completed)} onChange={() => toggleTask(graph, t.id)} />
            <span>{t.emoji || '📝'}</span>
            <span className="check-label text-sm" style={{ flex: 1 }}>{t.title}</span>
            <span className="text-xs text-muted">{memberNames(taskAssignees(graph, t))} · {REPEAT_LABEL[t.repeatType] || ''}{t.dueTime ? ` · ${t.dueTime}` : ''}</span>
            <span className="badge badge-warning">+{t.points}</span>
          </label>
        ))}
      </div>
      <div className="chip-row mt-sm">
        {scores.map((s, i) => (
          <span key={s.id} className={`mini-chip ${i === 0 && s.points > 0 ? 'good' : ''}`}>
            {i === 0 && s.points > 0 ? '🏆' : '⭐'} {s.name} {s.points} 分
          </span>
        ))}
      </div>
      {recentLogs.length > 0 && (
        <div className="text-xs text-muted mt-sm">
          📒 最近打卡：{recentLogs.map(log => {
            const task = graph.getEntity(graph.objects(log.id, 'logOfTask')[0]);
            const who = memberNames(graph.objects(log.id, 'completedBy').map(id => graph.getEntity(id)).filter(Boolean));
            return `${who}完成「${task?.title || '任务'}」(+${log.points})`;
          }).join('；')}
        </div>
      )}
    </div>
  );
}

export function HealthView({ args = {} }) {
  const graph = useGraph();
  const profiles = getFamilyProfiles(graph).filter(p => !args.memberIds || args.memberIds.includes(p.member.id));
  if (!profiles.length) return <div className="text-muted">暂无家庭成员档案</div>;
  return (
    <div className="member-grid">
      {profiles.map(({ member, conditions, allergens }) => (
        <div key={member.id} className="member-card">
          <div className="flex items-center gap-sm mb-sm">
            <span style={{ fontSize: 26 }}>{member.avatar}</span>
            <div className="font-bold">{member.name}</div>
          </div>
          {!conditions.length && !allergens.length && <div className="text-xs text-muted">暂无特别健康状况 👍</div>}
          {conditions.map(c => (
            <div key={c.id} className="text-xs mb-sm">
              <b>{c.emoji || '🩺'} {c.label}</b>{c.advice ? `：${c.advice}` : ''}
            </div>
          ))}
          {allergens.length > 0 && (
            <div className="chip-row">
              {allergens.map(a => <span key={a.id} className="mini-chip danger">🚫 {a.label}过敏</span>)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function RemindersView() {
  const graph = useGraph();
  const reminders = getReminders(graph);
  if (!reminders.length) return <div className="text-muted">暂无健康提醒</div>;
  return (
    <div className="flex-col">
      {reminders.map(r => (
        <label key={r.id} className={`check-item${r.done ? ' done' : ''}`}>
          <input type="checkbox" checked={Boolean(r.done)} onChange={() => toggleReminder(graph, r.id)} />
          <span>{r.emoji}</span>
          <span className="check-label text-sm" style={{ flex: 1 }}>{memberNames(reminderMembers(graph, r))}：{r.title}</span>
          <span className="text-xs text-muted">⏰ {r.schedule}</span>
          <span className="badge badge-gray">{r.category}</span>
        </label>
      ))}
    </div>
  );
}

export function HealthRecordsView({ args = {} }) {
  const graph = useGraph();
  const records = getHealthRecords(graph, { memberId: args.memberId, metric: args.metric });
  if (!records.length) {
    return <div className="text-muted text-sm">暂无健康监测记录，可在右侧对话框输入如“记录爸爸今天血压135/85”或“爸爸吃过降压药了”。</div>;
  }
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr><th>成员</th><th>指标</th><th>记录值</th><th>备注</th><th>记录时间</th></tr>
        </thead>
        <tbody>
          {records.map(r => {
            const owners = graph.objects(r.id, 'recordFor').map(id => graph.getEntity(id)).filter(Boolean);
            const time = r.recordedAt ? new Date(r.recordedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
            return (
              <tr key={r.id}>
                <td>{memberNames(owners)}</td>
                <td><span className="badge badge-secondary">{r.metric}</span></td>
                <td className="font-bold">{r.value}{r.unit ? ` ${r.unit}` : ''}</td>
                <td className="text-xs text-muted">{r.note || '—'}</td>
                <td className="text-xs text-muted">{time}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
