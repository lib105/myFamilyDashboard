import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useGraph } from '../../ontology/index.js';
import { handleUserMessage } from '../../agents/orchestrator.js';
import { isAIConfigured, loadAISettings } from '../../agents/llmClient.js';
import { loadMessages, saveMessages } from './homeViews.js';

const SUGGESTIONS = [
  '奶奶72岁，血糖偏高，对花生过敏',
  '推荐点当季水果',
  '今晚做什么菜',
  '西兰花哪家超市便宜',
  '最近有什么打折的蔬菜',
  '帮我买2斤猕猴桃和1盒豆腐',
  '我的快递到哪了',
  '你能做什么',
];

const WELCOME = {
  role: 'assistant',
  welcome: true,
  text: '你好！我是家庭饮食助手 🥗\n告诉我家人的健康情况（比如高血压、糖尿病、过敏性鼻炎、免疫力低下……属性不限），我会结合当季食材为全家推荐吃什么、怎么做，还能比价、找优惠、下单和查快递。',
};

export default function ChatPanel({ draft, setDraft, onViews }) {
  const graph = useGraph();
  const [messages, setMessages] = useState(() => {
    const saved = loadMessages();
    return saved.length ? saved : [WELCOME];
  });
  const [busy, setBusy] = useState(false);
  const listRef = useRef(null);
  const settings = loadAISettings();
  const aiOn = isAIConfigured(settings);

  useEffect(() => {
    saveMessages(messages);
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const send = async (text) => {
    const content = text.trim();
    if (!content || busy) return;
    setDraft('');
    const history = messages.filter(m => !m.welcome);
    setMessages(prev => [...prev, { role: 'user', text: content }]);
    setBusy(true);
    try {
      const result = await handleUserMessage(content, { graph, history });
      setMessages(prev => [...prev, { role: 'assistant', text: result.reply, trace: result.trace, mode: result.mode }]);
      if (result.views.length) onViews(result.views);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', text: `出错了：${e.message}` }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="chat-panel card">
      <div className="card-header" style={{ marginBottom: 'var(--spacing-sm)' }}>
        <span className="card-title">💬 AI 家庭助手</span>
        <div className="flex items-center gap-sm">
          <Link to="/settings" className={`badge ${aiOn ? 'badge-success' : 'badge-gray'}`} title="配置 AI Key">
            {aiOn ? `🤖 ${settings.model}` : '🧩 本地模式'}
          </Link>
          <button className="btn btn-ghost btn-sm" onClick={() => setMessages([WELCOME])} title="清空对话">🧹</button>
        </div>
      </div>

      <div className="chat-messages" ref={listRef}>
        {messages.map((m, i) => (
          <div key={i} className={`chat-row ${m.role}`}>
            <div className={`chat-bubble ${m.role}`}>
              {m.text}
              {m.trace?.length > 0 && (
                <div className="chat-trace">
                  {m.trace.map((t, j) => (
                    <span key={j} className="trace-chip" title={t.auto ? '自动联动调用' : '根据意图调用'}>
                      {t.agent} → {t.capability}{t.auto ? ' 🔁' : ''}
                    </span>
                  ))}
                  <span className="trace-chip mode">{m.mode === 'llm' ? 'AI 路由' : '本地路由'}</span>
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && <div className="chat-row assistant"><div className="chat-bubble assistant">思考中… 🤔</div></div>}
      </div>

      <div className="chip-row" style={{ margin: 'var(--spacing-sm) 0' }}>
        {SUGGESTIONS.map(s => (
          <button key={s} className="suggestion-chip" onClick={() => send(s)} disabled={busy}>{s}</button>
        ))}
      </div>

      <form className="chat-input" onSubmit={e => { e.preventDefault(); send(draft); }}>
        <textarea
          className="form-control"
          rows={2}
          value={draft}
          placeholder="说说家人的健康情况，或问我“今天吃什么”…（Enter 发送，Shift+Enter 换行）"
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send(draft);
            }
          }}
        />
        <button type="submit" className="btn btn-primary" disabled={busy || !draft.trim()}>发送</button>
      </form>
    </div>
  );
}
