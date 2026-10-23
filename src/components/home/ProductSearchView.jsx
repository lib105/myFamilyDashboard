import { useGraph } from '../../ontology/index.js';
import { getBrowserTaskRuns } from '../../agents/browserAgent.js';
import { normalizeJDProducts } from '../../agents/productResults.js';
import ProductResultRow from './ProductResultRow.jsx';

export default function ProductSearchView({ args = {} }) {
  const graph = useGraph();
  const runs = getBrowserTaskRuns(graph, { kind: 'product_search' });
  const run = (args.runId && graph.getEntity(args.runId)) || runs[0];
  if (!run) return <p className="text-sm text-muted">可在对话中输入“在京东搜索牛奶，看看价格和优惠”。</p>;
  if (run.status === 'running') return <p role="status">采购 Agent 正在通过本机 ego-lite 搜索京东商品…</p>;
  const searchUrl = `https://search.jd.com/Search?keyword=${encodeURIComponent(run.query)}&enc=utf-8`;
  if (run.status === 'failed') {
    return (
      <div>
        <div className="alert alert-danger" role="alert">京东商品搜索未完成：{run.error}。如需登录或验证，请在提示的浏览器任务空间手动处理后重新搜索。</div>
        <a href={searchUrl} target="_blank" rel="noopener noreferrer">在京东查看搜索页 ↗</a>
      </div>
    );
  }
  const products = normalizeJDProducts(run.products);
  const observedAt = Number.isFinite(Date.parse(run.observedAt))
    ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(run.observedAt)) : '时间未记录';
  return (
    <section aria-label="京东商品搜索结果">
      <div className="jd-search-meta">
        <div><b>{run.query}</b><p className="text-sm text-muted">{products.length} 条结果 · 采集于 {observedAt} · 网站搜索顺序，非全网最低价</p></div>
        <a href={searchUrl} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm">京东搜索页 ↗</a>
      </div>
      <ol className="jd-products" aria-label="京东商品列表">
        {products.map(product => <ProductResultRow key={product.sku} product={product} />)}
      </ol>
      {!products.length && <p className="text-sm text-muted">本次未采集到商品，请到京东搜索页核对或重新搜索。</p>}
      <p className="text-sm text-muted mt-md">价格和优惠为采集时网页快照，可能受规格、地址、会员、领券、首购和活动时效影响。未自动叠加优惠或计算结算价；未领券、加购物车或下单。</p>
    </section>
  );
}
