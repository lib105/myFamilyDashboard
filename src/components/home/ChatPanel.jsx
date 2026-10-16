import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useGraph } from '../../ontology/index.js';
import { handleUserMessage } from '../../agents/orchestrator.js';
import { isAIConfigured, loadAISettings } from '../../agents/llmClient.js';
import { loadMessages, saveMessages } from './homeViews.js';
import { getAgents } from '../../ontology/queries.js';
import { getAgentConfig } from '../../agents/agentConfig.js';

const BASE_SUGGESTIONS = [
  '奶奶72岁，血糖偏高，对花生过敏',
  '推荐点当季水果',
  '今晚做什么菜',
  '你能做什么',
];
const MAX_SUGGESTIONS = 10;

const WELCOME = {
  role: 'assistant',
  welcome: true,
  text: '你好！我是家庭助手 🏡\n告诉我家人的健康情况，我会结合当季食材推荐吃什么、怎么做；还可以管理旅行计划、健康提醒和家庭任务，比价、下单和查快递也没问题。',
};

export default function ChatPanel({ draft, setDraft, onResult, onFocusAnswer, inputRef }) {
  const graph = useGraph();
  const [messages, setMessages] = useState(() => {
    const saved = loadMessages();
    return saved.length ? saved : [WELCOME];
  });
  const [busy, setBusy] = useState(false);
  const listRef = useRef(null);
  const settings = loadAISettings();
  const aiOn = isAIConfigured(settings);
  const starters = getAgents(graph).flatMap(a => getAgentConfig(graph, a).starters.slice(0, 2));
  const suggestions = [...new Set([...BASE_SUGGESTIONS.slice(0, 3), ...starters, ...BASE_SUGGESTIONS.slice(3)])].slice(0, MAX_SUGGESTIONS);

  useEffect(() => {
    saveMessages(messages);
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const send = async (text) => {
    const content = text.trim();
    if (!content || busy) return;
    setDraft('');
    const history = messages.filter(m => !m.welcome).map(m => ({ role: m.role, text: m.fullText || m.text }));
    setMessages(prev => [...prev, { role: 'user', text: content }]);
    setBusy(true);
    try {
      const result = await handleUserMessage(content, { graph, history });
      if (result.unanswered) {
        setMessages(prev => [...prev, { role: 'assistant', text: '😅 这个问题我暂时无法回答，已在页面中间给出提示。', fullText: result.reply, unanswered: true }]);
        onResult(content, result);
      } else {
        const answer = onResult(content, result);
        setMessages(prev => [...prev, { role: 'assistant', text: result.reply, trace: result.trace, mode: result.mode, answer }]);
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', text: `😅 出错了：${e.message}`, unanswered: true }]);
      onResult(content, { reply: '', views: [], trace: [], mode: 'local', unanswered: { reason: `出错了：${e.message}` } });
    } finally {
      setBusy(false);
      inputRef?.current?.focus();
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
            <div className={`chat-bubble ${m.role}${m.answer ? ' summary' : ''}${m.unanswered ? ' unanswered' : ''}`}>
              <div className={m.answer ? 'chat-clamp' : undefined}>{m.text}</div>
              {m.answer && (
                <button type="button" className="chat-focus" onClick={() => onFocusAnswer(m.answer)} title="在页面中间查看完整结果">
                  👈 完整结果见页面中间
                </button>
              )}
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

      <div className="suggestion-row" aria-label="快捷提问">
        {suggestions.map(s => (
          <button key={s} className="suggestion-chip" onClick={() => send(s)} disabled={busy}>{s}</button>
        ))}
      </div>

      <form className="chat-input" onSubmit={e => { e.preventDefault(); send(draft); }}>
        <textarea
          ref={inputRef}
          className="form-control"
          rows={2}
          value={draft}
          placeholder="说说家人的健康情况，或问我“今天吃什么”“有哪些任务”…（Enter 发送，Shift+Enter 换行）"
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
