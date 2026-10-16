import { useCallback, useEffect, useRef, useState } from 'react';
import { isAIConfigured, loadAISettings } from '../../agents/llmClient.js';
import FamilyProfiles from './FamilyProfiles.jsx';
import ChatPanel from './ChatPanel.jsx';
import ViewCard from './ViewCard.jsx';
import WeatherBar from './WeatherBar.jsx';
import UnansweredDialog from './UnansweredDialog.jsx';
import {
  DEFAULT_VIEWS, loadViews, saveViews, mergeViews, stampViews, loadAnswer, saveAnswer,
} from './homeViews.js';

function AnswerStage({ answer, views, freshIds, onClose, onCloseView }) {
  const shown = answer.viewIds.map(id => views.find(v => v.id === id)).filter(Boolean);
  return (
    <section className="answer-stage card" aria-live="polite" aria-label="当前问题的回答">
      <div className="card-header" style={{ marginBottom: 'var(--spacing-sm)' }}>
        <span className="card-title">🎯 当前回答</span>
        <div className="flex items-center gap-sm">
          <span className="text-xs text-muted">{new Date(answer.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="收起当前回答">✕</button>
        </div>
      </div>
      <div className="answer-question">🙋 {answer.question}</div>
      {answer.reply && <div className="answer-reply">{answer.reply}</div>}
      {answer.trace?.length > 0 && (
        <div className="chat-trace mb-sm">
          {answer.trace.map((t, j) => (
            <span key={j} className="trace-chip">{t.agent} → {t.capability}{t.auto ? ' 🔁' : ''}</span>
          ))}
          <span className="trace-chip mode">{answer.mode === 'llm' ? 'AI 路由' : '本地路由'}</span>
        </div>
      )}
      {shown.length > 0 && (
        <div className="answer-views">
          {shown.map(v => (
            <ViewCard key={v.id} view={v} fresh={freshIds.includes(v.id)} onClose={() => onCloseView(v.id)} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function FamilyHome() {
  const [views, setViews] = useState(loadViews);
  const [answer, setAnswer] = useState(loadAnswer);
  const [freshIds, setFreshIds] = useState([]);
  const [profileFresh, setProfileFresh] = useState(false);
  const [unanswered, setUnanswered] = useState(null);
  const [draft, setDraft] = useState('');
  const inputRef = useRef(null);
  const stageRef = useRef(null);

  useEffect(() => saveViews(views), [views]);
  useEffect(() => saveAnswer(answer), [answer]);

  useEffect(() => {
    if (!freshIds.length && !profileFresh) return undefined;
    const t = setTimeout(() => { setFreshIds([]); setProfileFresh(false); }, 2500);
    return () => clearTimeout(t);
  }, [freshIds, profileFresh]);

  const showStage = () => {
    requestAnimationFrame(() => {
      const el = stageRef.current;
      if (!el) return;
      const { top } = el.getBoundingClientRect();
      if (top < 0 || top > window.innerHeight * 0.5) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  /** Receives each chat result; returns the answer object shown in the centre (or null). */
  const onResult = (question, result) => {
    if (result.unanswered) {
      setUnanswered({ question, ...result.unanswered });
      return null;
    }
    const incoming = result.views || [];
    if (incoming.some(v => v.type === 'profile')) setProfileFresh(true);
    const stamped = stampViews(incoming.filter(v => v.type !== 'profile'));
    if (stamped.length) {
      setViews(prev => mergeViews(prev, stamped));
      setFreshIds(stamped.map(v => v.id));
    }
    const next = {
      question,
      reply: result.reply,
      trace: result.trace,
      mode: result.mode,
      viewIds: stamped.map(v => v.id),
      at: Date.now(),
    };
    setAnswer(next);
    showStage();
    return next;
  };

  const onFocusAnswer = (a) => { setAnswer(a); showStage(); };
  const closeUnanswered = useCallback(() => {
    setUnanswered(null);
    inputRef.current?.focus();
  }, []);

  const answerIds = new Set(answer?.viewIds || []);
  const others = views.filter(v => !answerIds.has(v.id));
  const removeView = id => setViews(prev => prev.filter(x => x.id !== id));

  return (
    <div className="page-body home-page">
      <WeatherBar />
      <div className="home-grid">
        <aside className="home-profiles">
          <FamilyProfiles fresh={profileFresh} onAsk={name => { setDraft(`${name}：`); inputRef.current?.focus(); }} />
        </aside>
        <div className="home-main" ref={stageRef}>
          {answer && (
            <AnswerStage
              answer={answer}
              views={views}
              freshIds={freshIds}
              onClose={() => setAnswer(null)}
              onCloseView={removeView}
            />
          )}
          {!answer && (
            <div className="answer-placeholder">
              💬 在右侧提问，回答会显示在这里
            </div>
          )}
          {others.length > 0 && (
            <div className="group-title home-more-title">{answer ? '📌 其他模块' : '📌 为你推荐'}</div>
          )}
          {others.map(v => (
            <ViewCard key={v.id} view={v} fresh={freshIds.includes(v.id)} onClose={() => removeView(v.id)} />
          ))}
          {views.length === 0 && !answer && (
            <div className="card empty-state">
              <span style={{ fontSize: 40 }}>🪄</span>
              <p>首页内容由 AI 根据对话动态生成</p>
              <button className="btn btn-outline btn-sm" onClick={() => setViews(DEFAULT_VIEWS)}>恢复默认推荐</button>
            </div>
          )}
        </div>
        <aside className="home-side">
          <ChatPanel
            draft={draft}
            setDraft={setDraft}
            onResult={onResult}
            onFocusAnswer={onFocusAnswer}
            inputRef={inputRef}
          />
        </aside>
      </div>
      {unanswered && (
        <UnansweredDialog
          info={unanswered}
          aiOn={isAIConfigured(loadAISettings())}
          onClose={closeUnanswered}
          onPick={(s) => { setDraft(s); closeUnanswered(); }}
        />
      )}
    </div>
  );
}
