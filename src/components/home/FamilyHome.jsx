import { useCallback, useEffect, useRef, useState } from 'react';
import { isAIConfigured, loadAISettings } from '../../agents/llmClient.js';
import FamilyProfiles from './FamilyProfiles.jsx';
import ChatPanel from './ChatPanel.jsx';
import ViewCard from './ViewCard.jsx';
import WeatherBar from './WeatherBar.jsx';
import UnansweredDialog from './UnansweredDialog.jsx';
import Markdown from '../common/Markdown.jsx';
import {
  DEFAULT_VIEWS, loadViews, saveViews, mergeViews, stampViews, loadAnswer, saveAnswer, loadLayout, saveLayout,
} from './homeViews.js';
import { applyLayoutCommand, arrangeViews, moduleLabel, revealModules } from '../../agents/homeLayout.js';

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
      {/* Agent template cards already present the answer; plain text is only a fallback. */}
      {answer.reply && !shown.length && <Markdown className="answer-reply" text={answer.reply} />}
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
  const [layout, setLayout] = useState(loadLayout);
  const [freshIds, setFreshIds] = useState([]);
  const [profileFresh, setProfileFresh] = useState(false);
  const [unanswered, setUnanswered] = useState(null);
  const [draft, setDraft] = useState('');
  const inputRef = useRef(null);
  const stageRef = useRef(null);

  useEffect(() => saveViews(views), [views]);
  useEffect(() => saveAnswer(answer), [answer]);
  useEffect(() => saveLayout(layout), [layout]);

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
    const cmd = result.layout;
    let incoming = result.views || [];
    const profileTouched = incoming.some(v => v.type === 'profile');
    if (profileTouched) setProfileFresh(true);
    // Showing / pinning a module reuses the cards already on the page; new cards only fill the gaps.
    const reused = cmd && ['show', 'pin'].includes(cmd.action) ? views.filter(v => cmd.modules.includes(v.type)) : [];
    if (reused.length) {
      const have = new Set(reused.map(v => v.type));
      incoming = incoming.filter(v => !have.has(v.type));
    }
    const stamped = stampViews(incoming.filter(v => v.type !== 'profile'));
    if (stamped.length) setViews(prev => mergeViews(prev, stamped));
    if (stamped.length || reused.length) setFreshIds([...reused, ...stamped].map(v => v.id));
    // Modules the user just asked about are revealed again, even if previously hidden.
    const touched = [...stamped.map(v => v.type), ...(profileTouched ? ['profiles'] : [])];
    setLayout(prev => revealModules(cmd ? applyLayoutCommand(prev, cmd) : prev, touched));
    const next = {
      question,
      reply: result.reply,
      trace: result.trace,
      mode: result.mode,
      viewIds: [...reused, ...stamped].map(v => v.id),
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
  const others = arrangeViews(views.filter(v => !answerIds.has(v.id)), layout);
  const removeView = id => setViews(prev => prev.filter(x => x.id !== id));
  const showModule = id => setLayout(prev => applyLayoutCommand(prev, { action: 'show', modules: [id] }));
  const profilesHidden = layout.hidden.includes('profiles');

  return (
    <div className="page-body home-page">
      <div className={`home-grid${profilesHidden ? ' no-profiles' : ''}`}>
        {!profilesHidden && (
          <aside className="home-profiles">
            <FamilyProfiles fresh={profileFresh} onAsk={name => { setDraft(`${name}：`); inputRef.current?.focus(); }} />
          </aside>
        )}
        <div className="home-main" ref={stageRef}>
          {!layout.hidden.includes('weather') && <WeatherBar />}
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
          {layout.hidden.length > 0 && (
            <div className="chip-row home-hidden" aria-label="已隐藏的模块">
              <span className="text-xs text-muted">🙈 已隐藏：</span>
              {layout.hidden.map(id => (
                <button key={id} type="button" className="suggestion-chip" onClick={() => showModule(id)} title="点击重新显示">
                  {moduleLabel(id)} ↩
                </button>
              ))}
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
