import { useRef, useState } from 'react';
import { useGraph } from '../../ontology/index.js';
import { getAgents, findCapabilityByName, newId } from '../../ontology/queries.js';
import {
  MD_FIELDS, KNOWLEDGE_LIMITS, getAgentConfig, defaultAgentPatch, isBuiltinAgent, agentCapabilities,
  createCustomCapability, readKnowledgeFile, fetchUrlKnowledge, parseHttpUrl, knowledgeChars,
  buildAgentPrompt, consultAgent,
} from '../../agents/agentConfig.js';
import { agentDomainContext } from '../../agents/familyAgents.js';
import { isAIConfigured } from '../../agents/llmClient.js';

const MAX_STARTERS = 6;
const MAX_MD_IMPORT_BYTES = 200 * 1024;
const MAX_GLOBAL_KNOWLEDGE_CHARS = 1000000;
const KIND_LABEL = { builtin: ['内置', 'badge-secondary'], mock: ['固定回复', 'badge-warning'], llm: ['AI 提示词', 'badge-purple'] };

const SECTIONS = [
  { key: 'basic', label: '📇 基本信息' },
  ...MD_FIELDS.map(f => ({ key: f.key, label: `📝 ${f.file}` })),
  { key: 'tools', label: '🔧 工具' },
  { key: 'knowledge', label: '📚 知识' },
  { key: 'starters', label: '💡 开场提示' },
];

const BLANK_AGENT = {
  label: '', emoji: '🤖', description: '',
  agentMd: '# 角色\n你是家庭助手中的新 Agent。\n\n# 行为准则\n- ',
  skillMd: '# 技能\n- ',
  contextMd: '',
  starters: [],
  knowledge: [],
  knowledgeOnly: false,
};

const pickConfig = (c) => ({
  label: c.label, emoji: c.emoji, description: c.description, agentMd: c.agentMd, skillMd: c.skillMd,
  contextMd: c.contextMd, starters: c.starters, knowledge: c.knowledge, knowledgeOnly: c.knowledgeOnly,
});

function download(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const formatSize = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

function MdEditor({ field, value, onChange, agentLabel }) {
  const fileRef = useRef(null);
  const [error, setError] = useState('');
  const importFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_MD_IMPORT_BYTES) return setError('文件过大（上限 200 KB）');
    setError('');
    onChange(await file.text());
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-sm" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div className="font-bold">{field.title}</div>
          <div className="text-xs text-muted">{field.hint}</div>
        </div>
        <div className="flex gap-sm">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>📂 导入 .md</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => download(`${agentLabel || 'agent'}-${field.file}`, value)}>⬇️ 导出</button>
          <input ref={fileRef} type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" hidden onChange={importFile} />
        </div>
      </div>
      <textarea
        className="form-control md-editor"
        value={value}
        rows={16}
        spellCheck={false}
        aria-label={field.file}
        onChange={e => onChange(e.target.value)}
        placeholder={`在这里用 Markdown 编写 ${field.file}…`}
      />
      <div className="flex justify-between text-xs text-muted mt-sm">
        <span>支持 Markdown，保存后用于 AI 回答与路由</span>
        <span>{value.length} 字</span>
      </div>
      {error && <div className="alert alert-danger mt-sm">{error}</div>}
    </div>
  );
}

function BasicSection({ draft, update }) {
  return (
    <div>
      <div className="form-row">
        <div className="form-group" style={{ width: 110 }}>
          <label className="form-label" htmlFor="agent-emoji">图标</label>
          <input id="agent-emoji" className="form-control" value={draft.emoji} maxLength={4} onChange={e => update({ emoji: e.target.value })} />
        </div>
        <div className="form-group" style={{ flex: 1 }}>
          <label className="form-label" htmlFor="agent-name">名称 *</label>
          <input id="agent-name" className="form-control" value={draft.label} maxLength={30} placeholder="例如：旅行 Agent" onChange={e => update({ label: e.target.value })} />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="agent-desc">描述</label>
        <textarea id="agent-desc" className="form-control" rows={3} maxLength={300} value={draft.description} placeholder="一句话说明这个 Agent 负责什么" onChange={e => update({ description: e.target.value })} />
      </div>
      <div className="text-xs text-muted">
        配置项参考 Microsoft Copilot Agent：名称/图标/描述、指令（Agent.md）、技能（Skill.md）、上下文（Context.md）、工具、知识（文件与网址）和开场提示。
      </div>
    </div>
  );
}

function ToolsSection({ agentId }) {
  const graph = useGraph();
  const [form, setForm] = useState({ name: '', keywords: '', mode: 'mock', reply: '', prompt: '' });
  const [msg, setMsg] = useState(null);
  if (!agentId) return <div className="alert alert-info">保存 Agent 后即可为它添加工具。</div>;
  const caps = agentCapabilities(graph, agentId);

  const add = (e) => {
    e.preventDefault();
    const label = form.name.trim();
    const keywords = form.keywords.split(/[,，、\s]+/).map(k => k.trim()).filter(Boolean);
    const text = (form.mode === 'llm' ? form.prompt : form.reply).trim();
    if (!label || !keywords.length || !text) return setMsg({ type: 'danger', text: '请填写名称、关键词，以及固定回复或提示词。' });
    if (findCapabilityByName(graph, label)?.label === label) return setMsg({ type: 'danger', text: `工具「${label}」已存在。` });
    createCustomCapability(graph, { label, keywords, agentId, ...(form.mode === 'llm' ? { prompt: text } : { reply: text }) });
    setForm({ name: '', keywords: '', mode: form.mode, reply: '', prompt: '' });
    setMsg({ type: 'success', text: `已添加工具「${label}」，立即生效。` });
  };

  return (
    <div>
      <div className="text-xs text-muted mb-sm">工具即 Agent 可调用的能力（Function Calling 中的 tools）。启用/禁用与新增立即生效，无需点击保存。</div>
      <div className="flex-col gap-sm mb-md">
        {caps.length === 0 && <div className="text-sm text-muted">暂无工具</div>}
        {caps.map(c => {
          const [kindLabel, kindClass] = KIND_LABEL[c.kind] || KIND_LABEL.builtin;
          return (
            <div key={c.id} className={`capability-row${c.enabled === false ? ' disabled' : ''}`}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="flex items-center gap-sm">
                  <span className="font-bold text-sm">{c.label}</span>
                  <span className={`badge ${kindClass}`}>{kindLabel}</span>
                  <code className="text-xs">{c.id}</code>
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
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => window.confirm(`删除工具「${c.label}」？`) && graph.removeEntity(c.id)}>🗑️ 删除</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <form className="card-inset" onSubmit={add}>
        <div className="font-bold mb-sm">＋ 添加工具</div>
        <div className="form-row">
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label" htmlFor="tool-name">名称</label>
            <input id="tool-name" className="form-control" value={form.name} maxLength={30} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="例如：景点门票查询" />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label" htmlFor="tool-keywords">触发关键词（逗号分隔）</label>
            <input id="tool-keywords" className="form-control" value={form.keywords} onChange={e => setForm({ ...form, keywords: e.target.value })} placeholder="门票,票价" />
          </div>
        </div>
        <div className="flex gap-md mb-sm text-sm">
          <label className="switch"><input type="radio" name="tool-mode" checked={form.mode === 'mock'} onChange={() => setForm({ ...form, mode: 'mock' })} /> 固定回复（模拟数据）</label>
          <label className="switch"><input type="radio" name="tool-mode" checked={form.mode === 'llm'} onChange={() => setForm({ ...form, mode: 'llm' })} /> AI 提示词（需配置 AI Key）</label>
        </div>
        {form.mode === 'mock' ? (
          <textarea className="form-control" rows={3} aria-label="固定回复" value={form.reply} onChange={e => setForm({ ...form, reply: e.target.value })} placeholder="触发后返回的内容" />
        ) : (
          <textarea className="form-control" rows={3} aria-label="提示词" value={form.prompt} onChange={e => setForm({ ...form, prompt: e.target.value })} placeholder="提示词模板，可用 {input}（用户问题）和 {family}（家庭档案）；会自动附带本 Agent 的配置" />
        )}
        <div className="flex items-center justify-between mt-sm">
          <span className={`text-xs ${msg?.type === 'danger' ? 'text-danger' : 'text-muted'}`}>{msg?.text}</span>
          <button type="submit" className="btn btn-outline btn-sm">添加工具</button>
        </div>
      </form>
    </div>
  );
}

function KnowledgeSection({ draft, update, otherChars }) {
  const fileRef = useRef(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const used = knowledgeChars(draft.knowledge);

  const addItems = (items) => {
    let total = used;
    let globalTotal = otherChars + used;
    const accepted = [];
    const rejected = [];
    for (const item of items) {
      const size = item.content ? item.content.length : 0;
      if (draft.knowledge.length + accepted.length >= KNOWLEDGE_LIMITS.maxItems) { rejected.push(`${item.name}（超过 ${KNOWLEDGE_LIMITS.maxItems} 项上限）`); continue; }
      if (total + size > KNOWLEDGE_LIMITS.maxTotalChars || globalTotal + size > MAX_GLOBAL_KNOWLEDGE_CHARS) { rejected.push(`${item.name}（知识容量不足）`); continue; }
      total += size;
      globalTotal += size;
      accepted.push(item);
    }
    if (accepted.length) update({ knowledge: [...draft.knowledge, ...accepted] });
    setMsg(rejected.length
      ? { type: 'danger', text: `未添加：${rejected.join('、')}` }
      : { type: 'success', text: `已添加 ${accepted.length} 项知识，保存后生效。` });
  };

  const onFiles = async (fileList) => {
    const files = [...(fileList || [])];
    if (!files.length) return;
    setBusy(true);
    try {
      addItems(await Promise.all(files.map(readKnowledgeFile)));
    } catch (e) {
      setMsg({ type: 'danger', text: `读取文件失败：${e.message}` });
    } finally {
      setBusy(false);
    }
  };

  const addUrl = async (e) => {
    e.preventDefault();
    if (!parseHttpUrl(url)) return setMsg({ type: 'danger', text: '请输入以 http:// 或 https:// 开头的网址' });
    if (draft.knowledge.some(k => k.url === parseHttpUrl(url).href)) return setMsg({ type: 'danger', text: '该网址已添加' });
    setBusy(true);
    try {
      addItems([await fetchUrlKnowledge(url)]);
      setUrl('');
    } catch (err) {
      setMsg({ type: 'danger', text: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div
        className={`drop-zone${dragOver ? ' over' : ''}`}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); onFiles(e.dataTransfer.files); }}
      >
        <div style={{ fontSize: 28 }}>📤</div>
        <div className="text-sm">拖拽文件到这里，或
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()} disabled={busy}>选择文件</button>
        </div>
        <div className="text-xs text-muted">
          可解析：.md .txt .json .csv .html .xml .yaml 等文本格式；其他格式（PDF、Word、图片）仅记录文件信息。
          单项最多 {KNOWLEDGE_LIMITS.maxCharsPerItem.toLocaleString()} 字，最多 {KNOWLEDGE_LIMITS.maxItems} 项。
        </div>
        <input ref={fileRef} type="file" multiple hidden onChange={e => { onFiles(e.target.files); e.target.value = ''; }} />
      </div>

      <form className="flex gap-sm mt-md" onSubmit={addUrl}>
        <input className="form-control" type="url" aria-label="网址" value={url} placeholder="https://example.com/攻略" onChange={e => setUrl(e.target.value)} />
        <button type="submit" className="btn btn-outline" disabled={busy || !url.trim()}>🌐 添加网址</button>
      </form>
      <div className="text-xs text-muted mt-sm">网址内容会尝试在浏览器中抓取；受跨域限制无法抓取时，将作为参考网址提供给 AI。</div>

      {busy && <div className="text-sm text-muted mt-sm">处理中…</div>}
      {msg && <div className={`alert alert-${msg.type} mt-sm`}>{msg.text}</div>}

      <div className="flex items-center justify-between mt-md mb-sm">
        <span className="font-bold text-sm">已添加的知识（{draft.knowledge.length}）</span>
        <span className="text-xs text-muted">已用 {used.toLocaleString()} / {KNOWLEDGE_LIMITS.maxTotalChars.toLocaleString()} 字</span>
      </div>
      <div className="flex-col gap-sm">
        {draft.knowledge.length === 0 && <div className="text-sm text-muted">暂无知识来源</div>}
        {draft.knowledge.map(k => {
          const safeUrl = k.url && parseHttpUrl(k.url)?.href;
          return (
            <div key={k.id} className="knowledge-item">
              <span style={{ fontSize: 20 }}>{k.kind === 'url' ? '🌐' : '📄'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="font-bold text-sm ellipsis" title={k.name}>{k.name}</div>
                <div className="text-xs text-muted ellipsis">
                  {safeUrl ? <a href={safeUrl} target="_blank" rel="noopener noreferrer">{safeUrl}</a> : `${formatSize(k.size || 0)}${k.mime ? ` · ${k.mime}` : ''}`}
                </div>
                {k.note && <div className="text-xs text-muted">{k.note}</div>}
              </div>
              {k.content
                ? <span className="badge badge-success">已解析 {k.content.length.toLocaleString()} 字{k.truncated ? '（已截断）' : ''}</span>
                : <span className="badge badge-gray">仅引用</span>}
              <button type="button" className="btn btn-ghost btn-sm" aria-label={`移除${k.name}`} onClick={() => update({ knowledge: draft.knowledge.filter(x => x.id !== k.id) })}>✕</button>
            </div>
          );
        })}
      </div>

      <label className="switch mt-md">
        <input type="checkbox" checked={draft.knowledgeOnly} onChange={e => update({ knowledgeOnly: e.target.checked })} />
        <span className="text-sm">仅基于指令、上下文与以上知识回答（资料中没有时直接说明不知道）</span>
      </label>
    </div>
  );
}

function StartersSection({ draft, update }) {
  const set = (i, v) => update({ starters: draft.starters.map((s, j) => (j === i ? v : s)) });
  return (
    <div>
      <div className="text-xs text-muted mb-sm">开场提示会显示在家庭首页的对话建议中，帮助家人快速了解这个 Agent 能做什么。</div>
      <div className="flex-col gap-sm">
        {draft.starters.map((s, i) => (
          <div key={i} className="flex gap-sm">
            <input className="form-control" aria-label={`开场提示 ${i + 1}`} value={s} maxLength={60} onChange={e => set(i, e.target.value)} />
            <button type="button" className="btn btn-ghost btn-sm" aria-label="删除开场提示" onClick={() => update({ starters: draft.starters.filter((_, j) => j !== i) })}>✕</button>
          </div>
        ))}
      </div>
      {draft.starters.length < MAX_STARTERS && (
        <button type="button" className="btn btn-outline btn-sm mt-sm" onClick={() => update({ starters: [...draft.starters, ''] })}>＋ 添加开场提示</button>
      )}
    </div>
  );
}

function TestPane({ draft, agentId }) {
  const graph = useGraph();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState(null);
  const [busy, setBusy] = useState(false);
  const config = { ...draft, id: agentId, starters: draft.starters.filter(s => s.trim()) };

  const ask = async (e) => {
    e.preventDefault();
    if (!question.trim() || busy) return;
    setBusy(true);
    try {
      setAnswer(await consultAgent(config, question.trim(), { context: agentDomainContext(graph, agentId) }));
    } catch (err) {
      setAnswer({ reply: `出错了：${err.message}`, mode: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ position: 'sticky', top: 16 }}>
      <div className="card-header">
        <span className="card-title">🧪 试一试</span>
        <span className={`badge ${isAIConfigured() ? 'badge-success' : 'badge-gray'}`}>{isAIConfigured() ? 'AI 模式' : '本地模式'}</span>
      </div>
      <div className="text-xs text-muted mb-sm">使用当前（未保存的）配置向 {draft.emoji} {draft.label || '新 Agent'} 提问。</div>
      <form onSubmit={ask}>
        <textarea className="form-control" rows={3} aria-label="测试问题" value={question} onChange={e => setQuestion(e.target.value)} placeholder={config.starters[0] || '输入一个问题…'} />
        <button type="submit" className="btn btn-primary btn-sm mt-sm" disabled={busy || !question.trim()}>{busy ? '思考中…' : '发送'}</button>
      </form>
      {answer && <div className="chat-bubble assistant mt-sm" style={{ maxWidth: '100%' }}>{answer.reply}</div>}
      <details className="mt-md">
        <summary className="text-sm">👀 预览系统提示词</summary>
        <pre className="prompt-preview">{buildAgentPrompt(config)}</pre>
      </details>
    </div>
  );
}

export default function AgentConfigEditor({ agentId, onClose, onSaved }) {
  const graph = useGraph();
  const agent = agentId ? graph.getEntity(agentId) : null;
  const [initial, setInitial] = useState(() => (agent ? pickConfig(getAgentConfig(graph, agent)) : BLANK_AGENT));
  const [draft, setDraft] = useState(initial);
  const [section, setSection] = useState('basic');
  const [status, setStatus] = useState(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const update = (patch) => setDraft(prev => ({ ...prev, ...patch }));
  const otherChars = getAgents(graph).filter(a => a.id !== agentId).reduce((sum, a) => sum + knowledgeChars(a.knowledge), 0);

  if (agentId && !agent) {
    return <div className="alert alert-warning">Agent 不存在或已被删除。<button className="btn btn-ghost btn-sm" onClick={onClose}>返回</button></div>;
  }

  const save = () => {
    const label = draft.label.trim();
    if (!label) {
      setSection('basic');
      return setStatus({ type: 'danger', text: '请填写 Agent 名称' });
    }
    if (getAgents(graph).some(a => a.id !== agentId && a.label === label)) {
      setSection('basic');
      return setStatus({ type: 'danger', text: `已存在名为「${label}」的 Agent` });
    }
    const patch = {
      ...draft,
      label,
      emoji: draft.emoji.trim() || '🤖',
      description: draft.description.trim(),
      starters: draft.starters.map(s => s.trim()).filter(Boolean),
    };
    if (agent) {
      graph.updateEntity(agent.id, patch);
      setInitial(patch);
      setDraft(patch);
      setStatus({ type: 'success', text: '已保存配置 ✅' });
    } else {
      const created = graph.addEntity({ id: newId('agent'), type: 'Agent', ...patch });
      onSaved?.(created.id);
    }
  };

  const reset = () => {
    if (!window.confirm('恢复为内置默认配置？已上传的知识也会被清除。')) return;
    graph.updateEntity(agent.id, defaultAgentPatch(agent.id));
    const next = pickConfig(getAgentConfig(graph, graph.getEntity(agent.id)));
    setInitial(next);
    setDraft(next);
    setStatus({ type: 'info', text: '已恢复默认配置' });
  };

  const remove = () => {
    if (!window.confirm(`删除 Agent「${agent.label}」及其自定义工具？`)) return;
    graph.batch(() => {
      agentCapabilities(graph, agent.id).filter(c => c.layer === 'user').forEach(c => graph.removeEntity(c.id));
      graph.removeEntity(agent.id);
    });
    onClose();
  };

  const back = () => {
    if (dirty && !window.confirm('有未保存的修改，确定离开吗？')) return;
    onClose();
  };

  const mdField = MD_FIELDS.find(f => f.key === section);

  return (
    <div>
      <div className="flex items-center justify-between mb-md" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div className="flex items-center gap-sm">
          <button className="btn btn-ghost btn-sm" onClick={back}>← 返回</button>
          <h2 style={{ fontSize: 20 }}>{draft.emoji} {draft.label || '新建 Agent'} · 配置</h2>
          {dirty && <span className="badge badge-warning">未保存</span>}
        </div>
        <div className="flex gap-sm">
          {agent && isBuiltinAgent(agent.id) && <button className="btn btn-ghost btn-sm" onClick={reset}>↩️ 恢复默认</button>}
          {agent && agent.layer === 'user' && <button className="btn btn-ghost btn-sm" onClick={remove}>🗑️ 删除 Agent</button>}
          <button className="btn btn-primary btn-sm" onClick={save} disabled={!dirty && Boolean(agent)}>💾 保存</button>
        </div>
      </div>
      {status && <div className={`alert alert-${status.type}`}>{status.text}</div>}

      <div className="config-layout">
        <div className="card">
          <div className="tabs">
            {SECTIONS.map(s => (
              <button key={s.key} className={`tab-btn${section === s.key ? ' active' : ''}`} onClick={() => setSection(s.key)}>
                {s.label}
                {s.key === 'knowledge' && draft.knowledge.length > 0 && <span className="badge badge-gray" style={{ marginLeft: 4 }}>{draft.knowledge.length}</span>}
              </button>
            ))}
          </div>
          {section === 'basic' && <BasicSection draft={draft} update={update} />}
          {mdField && (
            <MdEditor key={mdField.key} field={mdField} value={draft[mdField.key]} agentLabel={draft.label} onChange={v => update({ [mdField.key]: v })} />
          )}
          {section === 'tools' && <ToolsSection agentId={agent?.id} />}
          {section === 'knowledge' && <KnowledgeSection draft={draft} update={update} otherChars={otherChars} />}
          {section === 'starters' && <StartersSection draft={draft} update={update} />}
        </div>
        <TestPane draft={draft} agentId={agent?.id} />
      </div>
    </div>
  );
}
