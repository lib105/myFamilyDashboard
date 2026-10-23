import { useEffect, useId, useRef, useState } from 'react';
import { normalizePriceEvidence } from '../../agents/priceEvidence.js';

export default function PriceEvidence({ product }) {
  const evidence = normalizePriceEvidence(product.evidence, product);
  if (!evidence) return <span className="price-evidence-unavailable" title="未留存价格来源截图（历史记录或采集失败），请到原站核对。" aria-label="未留存价格来源截图，请到原站核对">无截图</span>;
  // A new capture gets fresh dialog/image state without a cascading effect render.
  return <PriceEvidenceCapture key={evidence.id} product={product} evidence={evidence} />;
}

/** Native dialog supplies focus trapping, Escape, and focus return to the thumbnail button. */
function PriceEvidenceCapture({ product, evidence }) {
  const dialog = useRef(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current?.close();
  }, [open]);
  const time = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Asia/Shanghai' }).format(new Date(evidence.observedAt));
  return <div className="price-evidence">
    <button type="button" className="price-evidence-thumb" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={`查看${product.title}价格来源截图`}
      title={`${failed ? '来源截图无法加载，请到原站核对' : '点击放大价格来源截图'} · 截于 ${time}（北京时间）`}>
      {failed ? <span className="price-evidence-error">失效</span>
        : <img src={evidence.imageUrl} alt={`${product.title}的价格来源裁图`} width="32" height="32" loading="lazy" onError={() => setFailed(true)} />}
    </button>
    <dialog ref={dialog} aria-labelledby={titleId} className="price-evidence-dialog" onClose={() => setOpen(false)} onCancel={() => setOpen(false)}
      onClick={event => { if (event.target === dialog.current) setOpen(false); }}>
      <div className="price-evidence-header">
        <h3 id={titleId}>价格来源 · {product.title}</h3>
        <button type="button" className="btn btn-outline" onClick={() => setOpen(false)} autoFocus>关闭截图</button>
      </div>
      <div className="price-evidence-details">
        <p>{product.shop || '店铺未取得'} · {product.priceText || '价格未取得'}{product.priceNote ? ` · ${product.priceNote}` : ''}</p>
        {!!product.promotions?.length && <p>{product.promotions.join('；')}</p>}
        <p>截图时间：{time}（北京时间）。截图是采集时观察，不保证最终结算价。</p>
        <p><a href={evidence.sourceUrl} target="_blank" rel="noopener noreferrer">打开来源搜索页 ↗</a> · <a href={product.url} target="_blank" rel="noopener noreferrer">打开商品详情 ↗</a></p>
      </div>
      {open && <div className="price-evidence-image">{failed ? <p role="alert">截图无法加载，请到原站核对。</p>
        : <img src={evidence.imageUrl} alt={`${product.title}的原网页价格来源截图`} onError={() => setFailed(true)} />}</div>}
    </dialog>
  </div>;
}
