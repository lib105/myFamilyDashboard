import { useGraph } from '../../ontology/index.js';
import { normalizeProducts } from '../../agents/productResults.js';
import { evaluateProduct } from '../../agents/productComparison.js';
import ProductResultRow from './ProductResultRow.jsx';

const time = value => Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '时间未记录';

/** Retain the historical view type/IDs, but show only JD as the active shopping platform. */
export default function ShoppingComparisonView({ args = {} }) {
  const graph = useGraph();
  const request = graph.getEntity(args.requestId);
  if (request?.type !== 'ShoppingRequest') return <p className="text-muted">该采购需求不存在，请在对话中重新发起京东搜索。</p>;
  const runs = graph.subjects('fulfillsShoppingRequest', request.id).map(id => graph.getEntity(id)).filter(Boolean);
  const jdRuns = runs.filter(run => graph.objects(run.id, 'targetsSite').includes('site_jd'));
  const products = jdRuns.filter(run => run.status === 'succeeded').flatMap(run => normalizeProducts(run.products, 'site_jd'));
  const evaluated = products.map(product => evaluateProduct(product, request))
    .sort((a, b) => Number(Boolean(a.excluded.length)) - Number(Boolean(b.excluded.length)) || a.store.rank - b.store.rank);
  const budget = request.minPrice == null && request.maxPrice == null ? '不限' : `${request.minPrice ?? 0}–${request.maxPrice ?? '不限'}元`;
  return (
    <section aria-label="采购需求与京东商品">
      <div className="shopping-requirements">
        <h3>已确认的采购需求</h3>
        <p>{request.variant || '类型未细分'} · 品牌：{request.brand || '不限'} · 规格/型号：{request.spec || '不限'} · 预算：{budget}</p>
        <p className="text-sm text-muted">仅查询京东，优先页面自营标识或店名标注旗舰店。店名不等于已独立核验官方授权；预算仅核对本次采集的展示价。</p>
      </div>
      {request.sites?.some(id => id !== 'site_jd') && <p className="alert alert-info">此历史需求包含已停用的平台；原始快照保留，当前界面仅展示京东结果，不再执行跨平台搜索或比价。</p>}
      {!jdRuns.length && <p className="text-sm text-muted">此历史记录没有京东结果。请在对话中重新发起京东采购；不会自动替换平台或重新执行。</p>}
      <div className="shopping-sources">{jdRuns.map(run => <div key={run.id} className="shopping-source">
        <b>京东</b>
        {run.status === 'succeeded' ? <p className="text-sm">采集于 {time(run.observedAt)} · {run.products.length} 条结果</p>
          : <p className="text-sm" role={run.status === 'failed' ? 'alert' : undefined}>{run.error || '搜索尚未完成'}</p>}
      </div>)}</div>
      <h3 className="group-title mt-md">京东店铺与商品明细 · {evaluated.length} 条（先核对需求，再按渠道优先）</h3>
      <ol className="jd-products" aria-label="京东商品列表">{evaluated.map(item => (
        <ProductResultRow key={item.product.url} product={item.product} assessment={item} />
      ))}</ol>
      {!!jdRuns.length && jdRuns.every(run => run.status === 'succeeded') && !evaluated.length && <p className="text-sm text-muted">本次未采集到商品，请在对话中调整需求后重新搜索。</p>}
      <p className="text-sm text-muted mt-md">价格、会员价和优惠条件是采集时的网页快照，并非无条件结算价；未计算运费或叠加优惠，未加购物车或下单。</p>
    </section>
  );
}
