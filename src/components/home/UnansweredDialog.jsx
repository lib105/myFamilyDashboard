import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

const EXAMPLES = ['推荐点当季水果', '今天有哪些家庭任务', '我们有哪些旅行计划', '全家健康状况怎么样', '你能做什么'];

export default function UnansweredDialog({ info, aiOn, onClose, onPick }) {
  const okRef = useRef(null);

  useEffect(() => {
    okRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="unanswered-title"
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-emoji" aria-hidden="true">🤔</div>
        <h2 id="unanswered-title" className="modal-title">这个问题我暂时无法回答</h2>
        {info.question && <div className="modal-question">“{info.question}”</div>}
        <p className="text-sm text-muted">{info.reason}</p>
        {info.note && <p className="text-xs text-danger mt-sm">{info.note}</p>}
        <div className="group-title mt-md">可以试试这样问：</div>
        <div className="chip-row" style={{ justifyContent: 'center' }}>
          {EXAMPLES.map(s => (
            <button key={s} className="suggestion-chip" onClick={() => onPick(s)}>{s}</button>
          ))}
        </div>
        {!aiOn && (
          <p className="text-xs text-muted mt-md">
            当前为本地模式，只能识别固定关键词。<Link to="/settings" onClick={onClose}>配置 AI Key</Link> 后可理解更多开放式问题。
          </p>
        )}
        <div className="modal-actions">
          <button ref={okRef} className="btn btn-primary" onClick={onClose}>知道了</button>
        </div>
      </div>
    </div>
  );
}
