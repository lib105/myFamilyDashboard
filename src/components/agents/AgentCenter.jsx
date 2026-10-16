import { useState } from 'react';
import { useGraph } from '../../ontology/index.js';
import { CLASSES, RELATIONS } from '../../ontology/schema.js';
import { getAgents, getCapabilities } from '../../ontology/queries.js';

const KIND_LABEL = { builtin: ['内置', 'badge-secondary'], mock: ['模拟数据', 'badge-warning'], llm: ['AI 提示词', 'badge-purple'] };

function AgentsTab() {
  const graph = useGraph();
  const caps = getCapabilities(graph);
  return (
    <>
      <div className="alert alert-info" style={{ display: 'block' }}>
        💡 能力可以直接在首页对话中扩展，例如：
        <code>添加能力 名称:社区团购查询 关键词:团购,拼团 回复:今晚8点截单</code>；
        配置 AI Key 后还可以用 <code>提示词:请以营养师身份点评{'{input}'}，家庭情况：{'{family}'}</code> 创建 AI 能力，
        加上 <code>Agent:营养师</code> 还会自动创建新的 Agent。
      </div>
      <div className="agent-grid">
        {getAgents(graph).map(agent => {
          const own = caps.filter(c => graph.objects(c.id, 'providedBy').includes(agent.id));
          return (
            <div key={agent.id} className="card">
              <div className="card-header">
                <span className="card-title">{agent.emoji} {agent.label}</span>
                {agent.layer === 'user' && <span className="badge badge-purple">对话创建</span>}
              </div>
              <p className="text-sm text-muted mb-md">{agent.description}</p>
              {own.length === 0 && <div className="text-sm text-muted">暂无能力</div>}
              <div className="flex-col gap-sm">
                {own.map(c => {
                  const [kindLabel, kindClass] = KIND_LABEL[c.kind] || KIND_LABEL.builtin;
                  return (
                    <div key={c.id} className={`capability-row${c.enabled === false ? ' disabled' : ''}`}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="flex items-center gap-sm">
                          <span className="font-bold text-sm">{c.label}</span>
                          <span className={`badge ${kindClass}`}>{kindLabel}</span>
                        </div>
                        <div className="text-xs text-muted">{c.description}</div>
                        <div className="chip-row" style={{ marginTop: 4 }}>
                          {(c.keywords || []).map(k => <span key={k} className="mini-chip">{k}</span>)}
                        </div>
                      </div>
                      <div className="flex-col gap-sm" style={{ alignItems: 'flex-end' }}>
                        <label className="switch">
                          <input
                            type="checkbox"
                            checked={c.enabled !== false}
                            disabled={c.id === 'manage_capabilities'}
                            onChange={e => graph.updateEntity(c.id, { enabled: e.target.checked })}
                          />
                          <span>{c.enabled === false ? '已禁用' : '已启用'}</span>
                        </label>
                        {c.layer === 'user' && (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => window.confirm(`删除能力「${c.label}」？`) && graph.removeEntity(c.id)}
                          >🗑️ 删除</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function OntologyTab() {
  const graph = useGraph();
  const count = (type, layer) => graph.findEntities(type, e => !layer || e.layer === layer).length;
  const triples = graph.query();
  const userTriples = triples.filter(t => t.layer === 'user');
  const label = (id) => {
    const e = graph.getEntity(id);
    return e ? (e.label || e.name || e.title || e.item || e.id) : id;
  };
  return (
    <div className="grid-2">
      <div className="card">
        <div className="card-header"><span className="card-title">🧱 本体类（Class）</span></div>
        <table className="data-table">
          <thead><tr><th>类</th><th>说明</th><th>实例</th><th>对话新增</th></tr></thead>
          <tbody>
            {Object.entries(CLASSES).map(([k, v]) => (
              <tr key={k}>
                <td><b>{v.label}</b><div className="text-xs text-muted">{k}</div></td>
                <td className="text-xs">{v.description}</td>
                <td>{count(k)}</td>
                <td>{count(k, 'user')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <div className="card-header"><span className="card-title">🔗 本体关系（Relation）</span></div>
        <table className="data-table">
          <thead><tr><th>关系</th><th>定义域 → 值域</th><th>三元组</th></tr></thead>
          <tbody>
            {Object.entries(RELATIONS).map(([k, v]) => (
              <tr key={k}>
                <td><b>{v.label}</b><div className="text-xs text-muted">{k}</div></td>
                <td className="text-xs">{v.domain} → {v.range}</td>
                <td>{triples.filter(t => t.p === k).length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card" style={{ gridColumn: '1 / -1' }}>
        <div className="card-header">
          <span className="card-title">🧠 对话产生的知识（用户层三元组）</span>
          <span className="badge badge-gray">{userTriples.length} 条</span>
        </div>
        <div className="triple-list">
          {userTriples.length === 0 && <div className="text-muted text-sm">暂无</div>}
          {userTriples.map((t, i) => (
            <div key={i} className="triple">
              <span className="mini-chip">{label(t.s)}</span>
              <span className="text-xs text-muted">—{RELATIONS[t.p]?.label || t.p}→</span>
              <span className="mini-chip good">{typeof t.o === 'string' ? label(t.o) : `${t.o.key}：${t.o.value}`}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AgentCenter() {
  const [tab, setTab] = useState('agents');
  return (
    <div>
      <div className="page-header">
        <h1>🧠 Agent 能力中心</h1>
        <span className="text-sm text-muted">Agent、能力、家人与食材都是本体知识图谱中的实体</span>
      </div>
      <div className="page-body">
        <div className="tabs">
          <button className={`tab-btn${tab === 'agents' ? ' active' : ''}`} onClick={() => setTab('agents')}>🤖 Agent 与能力</button>
          <button className={`tab-btn${tab === 'ontology' ? ' active' : ''}`} onClick={() => setTab('ontology')}>🕸️ 本体模型</button>
        </div>
        {tab === 'agents' ? <AgentsTab /> : <OntologyTab />}
      </div>
    </div>
  );
}
