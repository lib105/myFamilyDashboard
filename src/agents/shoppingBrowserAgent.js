import { getCapabilityAgent, newId } from '../ontology/queries.js';
import { resolveBrowserSite, buildSearchUrl, requestBrowserSearch } from './browserAgent.js';
import { normalizeProducts } from './productResults.js';
import { prepareShoppingTurn, shoppingSearchQuery } from './shoppingRequirements.js';

export async function searchProductsWithBrowser(args, { graph, capability }) {
  const allowed = new Set(graph.objects(capability.id, 'usesBrowserSite').filter(id => id === 'site_jd'));
  const defaultSites = args.requestId ? [] : args.site ? [resolveBrowserSite(graph, capability.id, args.site)?.id] : ['site_jd'];
  if (!allowed.size || defaultSites.some(id => !id || !allowed.has(id))) return { reply: '当前采购能力未获准访问所选站点；仅支持京东，淘宝/天猫搜索已取消，请检查 usesBrowserSite 授权。', views: [] };
  let request = args.requestId && graph.getEntity(args.requestId);
  if (!request) {
    if (args.requestId) return { reply: '采购需求不存在，请重新发起京东搜索。', views: [] };
    const query = typeof args.query === 'string' ? args.query.trim() : '';
    if (!query || query.length > 200) return { reply: '请告诉我想买什么商品，例如“我想买牛奶”。', views: [] };
    const turn = prepareShoppingTurn(query, { graph, force: true, sites: defaultSites });
    if (turn?.result) return turn.result;
    request = turn?.request;
  }
  if (request?.type !== 'ShoppingRequest' || request.status !== 'ready' || !Array.isArray(request.sites) || request.sites.length !== 1 || request.sites.some(id => !allowed.has(id))) {
    return { reply: '采购需求尚未确认、已执行或无站点权限，请重新发起商品搜索。', views: [] };
  }
  request = graph.updateEntity(request.id, { status: 'searching' });
  const query = shoppingSearchQuery(request);
  const agent = getCapabilityAgent(graph, capability);
  const runs = [];
  // The browser worker is single-concurrency. Never Promise.all these platform requests.
  for (const siteId of request.sites) {
    const site = resolveBrowserSite(graph, capability.id, siteId);
    const run = graph.batch(() => {
      const entity = graph.addEntity({ id: newId('brun'), type: 'BrowserTaskRun', kind: 'product_search', query,
        searchUrl: buildSearchUrl(site, query), products: [], status: 'running', executedAt: new Date().toISOString() });
      graph.addTriple(entity.id, 'targetsSite', site.id);
      graph.addTriple(entity.id, 'fulfillsShoppingRequest', request.id);
      if (agent) graph.addTriple(entity.id, 'executedByAgent', agent.id);
      return entity;
    });
    try {
      const data = await requestBrowserSearch('products', { site, query });
      const products = normalizeProducts(data?.products, site.id);
      if (data?.engine !== 'ego-browser-live' || !products.length || !Number.isFinite(Date.parse(data.observedAt))) {
        throw new Error('未取得有效商品快照，不能用模拟价格或搜索页冒充商品报价');
      }
      runs.push(graph.updateEntity(run.id, { products, observedAt: data.observedAt, engine: data.engine, attention: data.attention || null, status: 'succeeded', finishedAt: new Date().toISOString() }));
      if (data.attention) break;
    } catch (error) {
      runs.push(graph.updateEntity(run.id, { status: 'failed', error: error.message, errorCode: error.code, finishedAt: new Date().toISOString() }));
      // Stop on failure/user handoff; do not create another browser task to route around it.
      break;
    }
  }
  const succeeded = runs.filter(run => run.status === 'succeeded');
  const status = succeeded.length === request.sites.length && !runs.some(run => run.attention) ? 'completed' : succeeded.length ? 'partial' : 'failed';
  graph.updateEntity(request.id, { status, finishedAt: new Date().toISOString() });
  const lines = succeeded.flatMap(run => run.products.slice(0, 3).map(product => {
    const conditions = [product.priceNote, ...product.promotions].filter(Boolean).join('；');
    return `• 京东：${product.title}，${product.priceText || '价格未取得'}${conditions ? `（${conditions}）` : ''}`;
  }));
  const errors = runs.filter(run => run.status === 'failed' || run.attention).map(run => `未完成：${run.error || run.attention.message}`);
  return {
    reply: [request.platformNotice, `🛒 已按确认的采购需求搜索京东：${query}`, ...lines, ...errors,
      '仅查询京东，优先页面自营标识或店名标注旗舰店；品牌、规格和价格条件仍需核对，未自动领券或下单。'].filter(Boolean).join('\n'),
    views: [{ type: 'shopping_comparison', title: '京东采购结果', args: { requestId: request.id } }],
    shoppingRequestId: null,
  };
}
