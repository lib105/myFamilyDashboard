import { useState } from 'react';
import {
  PROVIDER_PRESETS, loadAISettings, saveAISettings, clearAISettings, validateBaseUrl, chatCompletion, DEFAULT_SETTINGS,
} from '../../agents/llmClient.js';
import { resetKnowledge } from '../../ontology/index.js';

export default function AISettings() {
  const [form, setForm] = useState(loadAISettings);
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState(null);
  const [testing, setTesting] = useState(false);

  const update = (patch) => setForm(prev => ({ ...prev, ...patch }));

  const choosePreset = (id) => {
    const preset = PROVIDER_PRESETS.find(p => p.id === id);
    update({ provider: id, ...(preset?.baseUrl ? { baseUrl: preset.baseUrl, model: preset.model } : {}) });
  };

  const save = () => {
    const error = validateBaseUrl(form.baseUrl);
    if (error) return setStatus({ type: 'danger', text: error });
    saveAISettings({ ...form, apiKey: form.apiKey.trim(), model: form.model.trim(), baseUrl: form.baseUrl.trim() });
    setStatus({ type: 'success', text: '已保存。AI 模式下将由大模型理解意图并调用 Agent 能力。' });
  };

  const test = async () => {
    const error = validateBaseUrl(form.baseUrl);
    if (error) return setStatus({ type: 'danger', text: error });
    if (!form.apiKey) return setStatus({ type: 'warning', text: '请先填写 API Key' });
    setTesting(true);
    setStatus(null);
    try {
      const msg = await chatCompletion({ settings: form, messages: [{ role: 'user', content: '只回复“连接成功”' }] });
      setStatus({ type: 'success', text: `连接成功：${String(msg.content || '').slice(0, 60)}` });
    } catch (e) {
      setStatus({ type: 'danger', text: `连接失败：${e.message}` });
    } finally {
      setTesting(false);
    }
  };

  const clear = () => {
    clearAISettings();
    setForm({ ...DEFAULT_SETTINGS });
    setStatus({ type: 'info', text: '已清除 AI Key，当前使用本地规则模式。' });
  };

  return (
    <div>
      <div className="page-header">
        <h1>⚙️ AI 设置</h1>
        <span className="text-sm text-muted">配置你自己的大模型 Key（OpenAI 兼容接口）</span>
      </div>
      <div className="page-body">
        <div className="grid-2">
          <div className="card">
            <div className="card-header"><span className="card-title">🔑 AI Key 配置</span></div>
            <div className="form-group">
              <label className="form-label" htmlFor="ai-provider">服务商</label>
              <select id="ai-provider" className="form-control" value={form.provider} onChange={e => choosePreset(e.target.value)}>
                {PROVIDER_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="ai-base">Base URL</label>
              <input id="ai-base" className="form-control" value={form.baseUrl} placeholder="https://api.example.com/v1" onChange={e => update({ baseUrl: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="ai-model">模型</label>
              <input id="ai-model" className="form-control" value={form.model} placeholder="gpt-4o-mini" onChange={e => update({ model: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="ai-key">API Key</label>
              <div className="flex gap-sm">
                <input
                  id="ai-key"
                  className="form-control"
                  type={showKey ? 'text' : 'password'}
                  autoComplete="off"
                  value={form.apiKey}
                  placeholder="sk-..."
                  onChange={e => update({ apiKey: e.target.value })}
                />
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowKey(s => !s)}>{showKey ? '隐藏' : '显示'}</button>
              </div>
            </div>
            <label className="switch mb-md">
              <input type="checkbox" checked={form.enabled} onChange={e => update({ enabled: e.target.checked })} />
              <span>启用 AI 模式（关闭则使用本地规则路由）</span>
            </label>
            {status && <div className={`alert alert-${status.type}`}>{status.text}</div>}
            <div className="flex gap-sm">
              <button className="btn btn-primary" onClick={save}>保存</button>
              <button className="btn btn-outline" onClick={test} disabled={testing}>{testing ? '测试中…' : '测试连接'}</button>
              <button className="btn btn-ghost" onClick={clear}>清除</button>
            </div>
          </div>

          <div className="flex-col gap-md">
            <div className="card">
              <div className="card-header"><span className="card-title">🧭 工作方式</span></div>
              <ul className="settings-list">
                <li><b>本地模式</b>：未配置 Key 时，使用本地规则识别意图、抽取家人档案，全部使用本地模拟数据。</li>
                <li><b>AI 模式</b>：把已启用的 Agent 能力作为工具（function calling）交给大模型，由大模型理解意图并调用，结果动态展示在首页。</li>
                <li>AI 调用失败时会自动回退到本地模式。</li>
              </ul>
            </div>
            <div className="alert alert-warning" style={{ display: 'block' }}>
              🔒 <b>安全提示</b>：Key 仅保存在本浏览器的 localStorage，并由浏览器直接请求你填写的接口（仅允许 https）。
              请勿在公共电脑上保存 Key；正式上线建议通过后端代理转发，避免在前端暴露 Key。
            </div>
            <div className="card">
              <div className="card-header"><span className="card-title">🗂️ 数据管理</span></div>
              <p className="text-sm text-muted mb-md">家庭档案、订单、对话新增的能力都保存在本地知识图谱中。</p>
              <div className="flex gap-sm">
                <button className="btn btn-outline btn-sm" onClick={() => window.confirm('恢复为示例家庭数据？对话产生的数据将被清除。') && resetKnowledge({ withDemo: true })}>恢复示例数据</button>
                <button className="btn btn-ghost btn-sm" onClick={() => window.confirm('清空全部家庭档案与对话产生的数据？') && resetKnowledge({ withDemo: false })}>清空全部</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
