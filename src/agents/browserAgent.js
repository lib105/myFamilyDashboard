import { findMember, getCapabilityAgent, newId } from '../ontology/queries.js';
import { normalizeVideoCandidates } from './videoResults.js';

const asText = (v) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');

/** UI-level authorization; the server independently enforces its own site/action whitelist. */
export function resolveBrowserSite(graph, capabilityId, siteHint) {
  const allowed = graph.objects(capabilityId, 'usesBrowserSite')
    .map(id => graph.getEntity(id)).filter(s => s?.type === 'BrowserSite' && s.enabled !== false);
  const hint = asText(siteHint).toLowerCase();
  if (hint) {
    return allowed.find(s => s.id.toLowerCase() === hint || s.label.toLowerCase() === hint
      || s.domain?.toLowerCase() === hint || (s.synonyms || []).some(syn => syn.toLowerCase() === hint));
  }
  return allowed.find(s => s.defaultSite) || allowed[0];
}

export function buildSearchUrl(site, query) {
  return String(site.searchUrlTemplate).replaceAll('{query}', encodeURIComponent(asText(query)));
}

/** No simulated success: unavailable runtime, empty results, and HTTP failures remain failures. */
export async function requestBrowserSearch(kind, { site, query }) {
  const endpoint = { video: '/api/ego-browser/search-video', products: '/api/ego-browser/search-products' }[kind];
  if (!endpoint) throw new Error('不支持的浏览器搜索类型');
  let res;
  try {
    res = await globalThis.fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteId: site.id, query }),
      signal: AbortSignal.timeout(kind === 'products' ? 75000 : 40000),
    });
  } catch (error) {
    if (['TimeoutError', 'AbortError'].includes(error.name)) throw new Error('浏览器接口超时，请检查服务端 ego-lite 状态', { cause: error });
    throw new Error('无法连接浏览器接口，请启动服务端浏览器桥接进程并检查 /api/ego-browser/health', { cause: error });
  }
  let data;
  try { data = await res.json(); } catch {
    throw new Error(`浏览器接口返回非 JSON（HTTP ${res.status}），请检查 /api 反向代理；静态站点本身不能运行 ego-browser`);
  }
  if (!res.ok) throw Object.assign(new Error(data?.error || `浏览器接口返回 HTTP ${res.status}`), { code: data?.code });
  return data;
}

export async function runEgoBrowserSearch({ site, query }) {
  const data = await requestBrowserSearch('video', { site, query });
  const candidates = normalizeVideoCandidates(data?.candidates, site.id);
  if (data?.engine !== 'ego-browser-live' || !candidates.length) {
    throw new Error('未取得真实视频详情链接，不能将搜索页当作已核实的视频结果');
  }
  return {
    bestTitle: candidates[0].title, bestUrl: candidates[0].url, candidates,
    engine: data.engine, ranking: 'site-search-order',
  };
}

export function getBrowserTaskRuns(graph, { agentId, siteId, kind } = {}) {
  return graph.findEntities('BrowserTaskRun')
    .filter(run => (!agentId || graph.objects(run.id, 'executedByAgent').includes(agentId))
      && (!siteId || graph.objects(run.id, 'targetsSite').includes(siteId))
      && (!kind || (run.kind || 'video_search') === kind))
    .sort((a, b) => String(b.executedAt || '').localeCompare(String(a.executedAt || '')));
}

export async function searchVideoWithBrowser(args, { graph, text, capability }) {
  const query = asText(args.query) || asText(text);
  if (!query || query.length > 200) return { reply: '请提供 1–200 字的视频搜索关键词。', views: [] };
  const inferredSite = graph.findEntities('BrowserSite').find(s =>
    (s.synonyms || []).some(syn => asText(text).toLowerCase().includes(syn.toLowerCase())));
  const site = resolveBrowserSite(graph, capability?.id || 'search_video_with_browser', args.site || inferredSite?.id);
  if (!site) return { reply: '该 Agent 没有获准访问所选视频站点，请检查 usesBrowserSite 授权。', views: [] };

  const member = asText(args.member) && findMember(graph, asText(args.member));
  const agent = capability && getCapabilityAgent(graph, capability);
  const searchUrl = buildSearchUrl(site, query);
  const run = graph.batch(() => {
    const entity = graph.addEntity({
      id: newId('brun'), type: 'BrowserTaskRun', kind: 'video_search', query, searchUrl,
      candidates: [], status: 'running', executedAt: new Date().toISOString(),
    });
    if (agent) graph.addTriple(entity.id, 'executedByAgent', agent.id);
    graph.addTriple(entity.id, 'targetsSite', site.id);
    if (member) graph.addTriple(entity.id, 'requestedFor', member.id);
    return entity;
  });
  const views = [{ type: 'video_search', title: `视频搜索 · ${query}`, args: { runId: run.id } }];
  try {
    const outcome = await runEgoBrowserSearch({ site, query });
    graph.updateEntity(run.id, { ...outcome, status: 'succeeded', finishedAt: new Date().toISOString() });
    return {
      reply: `🎬 服务端 ego-lite 已在「${site.label}」搜索「${query}」。\n\n首选视频：[${outcome.bestTitle}](${outcome.bestUrl})\n\n按网站搜索顺序选取首个有效视频链接，尚未核实内容质量或医学权威性。`,
      views,
    };
  } catch (error) {
    graph.updateEntity(run.id, { status: 'failed', error: error.message, finishedAt: new Date().toISOString() });
    return { reply: `❌ 视频搜索未完成：${error.message}。未生成或编造视频链接。`, views };
  }
}
