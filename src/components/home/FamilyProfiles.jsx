import { useGraph } from '../../ontology/index.js';
import { getFamilyProfiles, removeMember } from '../../ontology/queries.js';

export default function FamilyProfiles({ fresh, onAsk }) {
  const graph = useGraph();
  const profiles = getFamilyProfiles(graph);

  const remove = (memberId, p, o) => graph.removeTriple(memberId, p, o);

  return (
    <div className={`card view-card profile-panel${fresh ? ' fresh' : ''}`} style={{ borderTop: '4px solid #E91E8C' }}>
      <div className="card-header profile-panel-header">
        <span className="card-title">👨‍👩‍👧‍👦 家庭档案</span>
        <span className="badge badge-gray" title="健康档案 Agent">🩺 {profiles.length}</span>
      </div>
      {profiles.length === 0 ? (
        <div className="empty-state profile-list" style={{ padding: 'var(--spacing-md)' }}>
          <span style={{ fontSize: 28 }}>📝</span>
          <p className="text-sm">还没有家庭成员档案，在右侧对话框告诉我吧～</p>
        </div>
      ) : (
        <div className="profile-list">
          {profiles.map(({ member, conditions, allergens, attributes }) => (
            <div key={member.id} className="member-card compact">
              <div className="flex items-center gap-sm">
                <span style={{ fontSize: 22 }}>{member.avatar}</span>
                <div style={{ flex: 1 }}>
                  <div className="font-bold">{member.name}</div>
                  <div className="text-xs text-muted">{member.age ? `${member.age} 岁` : '年龄未填写'}</div>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  title="删除成员"
                  aria-label={`删除成员${member.name}`}
                  onClick={() => window.confirm(`确定删除「${member.name}」的全部档案吗？`) && removeMember(graph, member.id)}
                >🗑️</button>
              </div>
              <div className="chip-row">
                {conditions.map(c => (
                  <span key={c.id} className="mini-chip warn" title={c.advice || c.label}>
                    {c.emoji || '🩺'} {c.label}
                    <button className="chip-x" aria-label={`移除${c.label}`} onClick={() => remove(member.id, 'hasCondition', c.id)}>×</button>
                  </span>
                ))}
                {allergens.map(a => (
                  <span key={a.id} className="mini-chip danger">
                    🚫 {a.label}过敏
                    <button className="chip-x" aria-label={`移除${a.label}过敏`} onClick={() => remove(member.id, 'allergicTo', a.id)}>×</button>
                  </span>
                ))}
                {attributes.map(a => (
                  <span key={`${a.key}-${a.value}`} className="mini-chip">
                    {a.key}：{a.value}
                    <button className="chip-x" aria-label={`移除${a.key}`} onClick={() => remove(member.id, 'hasAttribute', a)}>×</button>
                  </span>
                ))}
                {!conditions.length && !allergens.length && !attributes.length && (
                  <button className="mini-chip link" onClick={() => onAsk?.(`${member.name}`)}>＋ 补充档案</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="text-xs text-muted profile-hint" title="例如：“奶奶72岁，血糖偏高，对花生过敏，最近睡眠不好”">
        💬 在对话中随时补充，属性不限
      </div>
    </div>
  );
}
