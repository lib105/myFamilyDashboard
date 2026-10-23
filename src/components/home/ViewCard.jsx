import { Link } from 'react-router-dom';
import { useGraph } from '../../ontology/index.js';
import { INGREDIENT_CATEGORIES } from '../../ontology/schema.js';
import { getIngredientFacts, getFamilyProfiles, getAgents, getCapabilities } from '../../ontology/queries.js';
import { recommendIngredients, recommendRecipes } from '../../agents/recommender.js';
import { confirmOrder, cancelOrder, getPantryItems, upsertPantryStock, computeRecipeRestock } from '../../agents/capabilities.js';
import { getBrowserTaskRuns } from '../../agents/browserAgent.js';
import { TripsView, TasksView, HealthView, RemindersView, HealthRecordsView } from './FamilyViews.jsx';
import ProfilesView from './ProfilesView.jsx';
import WeatherView from './WeatherView.jsx';
import ProductSearchView from './ProductSearchView.jsx';
import ShoppingComparisonView from './ShoppingComparisonView.jsx';
import FliggyTravelView from './FliggyTravelView.jsx';
import Markdown from '../common/Markdown.jsx';
import { VideoLink } from '../common/VideoPlayer.jsx';

const VIEW_META = {
  weather:         { emoji: '🌤️', color: '#5DADE2' },
  profiles:        { emoji: '👨‍👩‍👧‍👦', color: '#E91E8C' },
  produce:         { emoji: '🥗', color: '#27AE60' },
  recipes:         { emoji: '🍳', color: '#FF6B35' },
  ingredient_info: { emoji: '📚', color: '#4A90D9' },
  prices:          { emoji: '💰', color: '#F39C12' },
  discounts:       { emoji: '🏷️', color: '#E74C3C' },
  order:           { emoji: '🧾', color: '#9B59B6' },
  delivery:        { emoji: '🚚', color: '#1ABC9C' },
  capabilities:    { emoji: '🧠', color: '#34495E' },
  trips:           { emoji: '✈️', color: '#4A90D9' },
  tasks:           { emoji: '✅', color: '#27AE60' },
  health:          { emoji: '💗', color: '#E91E8C' },
  reminders:       { emoji: '⏰', color: '#E74C3C' },
  health_records:  { emoji: '📒', color: '#8E44AD' },
  pantry:          { emoji: '🧊', color: '#16A085' },
  video_search:    { emoji: '🎬', color: '#E67E22' },
  product_search:  { emoji: '🛒', color: '#E74C3C' },
  shopping_comparison: { emoji: '🛍️', color: '#E74C3C' },
  fliggy_travel:   { emoji: '🕊️', color: '#FF6A00' },
  text:            { emoji: '🧩', color: '#7F8C8D' },
};

const DISCLAIMER = '健康与饮食建议仅供参考，不能替代医生或营养师的专业意见。';

function ReasonChips({ reasons, warnings }) {
  const uniq = (arr) => [...new Map(arr.map(r => [`${r.member.id}-${r.condition.id}`, r])).values()];
  return (
    <div className="chip-row">
      {uniq(reasons).slice(0, 3).map(r => (
        <span key={`r-${r.member.id}-${r.condition.id}`} className="mini-chip good" title={`${r.member.name}：${r.condition.label}`}>
          {r.member.avatar} {r.condition.label}
        </span>
      ))}
      {uniq(warnings).map(w => (
        <span key={`w-${w.member.id}-${w.condition.id}`} className="mini-chip warn" title={`${w.member.name}（${w.condition.label}）慎食`}>
          ⚠️ {w.member.name}慎食
        </span>
      ))}
    </div>
  );
}

function ProduceView({ args = {} }) {
  const graph = useGraph();
  const result = recommendIngredients(graph, { category: args.category, memberIds: args.memberIds });
  const groups = args.category && args.category !== 'all'
    ? [[args.category, result.items]]
    : [
      ['fruit', result.items.filter(i => i.ingredient.category === 'fruit')],
      ['vegetable', result.items.filter(i => i.ingredient.category === 'vegetable')],
      ['other', result.items.filter(i => !['fruit', 'vegetable'].includes(i.ingredient.category))],
    ];
  return (
    <>
      <div className="text-sm text-muted mb-sm">
        {result.season.emoji} 当前 {result.month} 月 · {result.season.label}，当季优先，并结合
        {result.profiles.length ? ` ${result.profiles.map(p => p.member.name).join('、')} ` : '家庭'}的健康档案排序。
      </div>
      {groups.map(([cat, items]) => {
        const shown = items.filter(i => i.score > 0).slice(0, 6);
        if (!shown.length) return null;
        const meta = INGREDIENT_CATEGORIES[cat] || { label: '肉蛋奶 · 谷物 · 菌菇', emoji: '🍱' };
        return (
          <div key={cat} className="mb-md">
            <div className="group-title">{meta.emoji} {meta.label}</div>
            <div className="produce-grid">
              {shown.map(i => (
                <div key={i.ingredient.id} className="produce-card">
                  <div className="produce-head">
                    <span className="produce-emoji">{i.ingredient.emoji}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="font-bold">{i.ingredient.label}</div>
                      <div className="text-xs text-muted">{(i.ingredient.nutrients || []).slice(0, 2).join(' · ')}</div>
                    </div>
                    {i.inSeason && <span className="badge badge-success">当季</span>}
                  </div>
                  <ReasonChips reasons={i.reasons} warnings={i.warnings} />
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {result.excluded.length > 0 && (
        <div className="text-xs text-muted">
          🚫 已排除：{result.excluded.map(e => `${e.ingredient.label}（${e.reason}）`).join('；')}
        </div>
      )}
    </>
  );
}

function RecipesView({ args = {} }) {
  const graph = useGraph();
  const { recipes, excluded } = recommendRecipes(graph, { mealType: args.mealType, memberIds: args.memberIds });
  return (
    <>
    {!recipes.length && <div className="text-muted">暂无合适的食谱</div>}
    <div className="recipe-grid">
      {recipes.map(({ recipe, ingredients, warnings }) => (
        <div key={recipe.id} className="recipe-card">
          <div className="flex items-center gap-sm mb-sm">
            <span style={{ fontSize: 30 }}>{recipe.emoji}</span>
            <div style={{ flex: 1 }}>
              <div className="font-bold">{recipe.label}</div>
              <div className="text-xs text-muted">⏱️ {recipe.minutes} 分钟 · {recipe.mealType}</div>
            </div>
          </div>
          <div className="chip-row mb-sm">
            {ingredients.map(i => (
              <span key={i.ingredient.id} className={`mini-chip ${i.inSeason ? 'good' : ''}`}>
                {i.ingredient.emoji} {i.ingredient.label}
              </span>
            ))}
            {(recipe.extras || []).map(x => <span key={x} className="mini-chip">{x}</span>)}
          </div>
          <ol className="recipe-steps">
            {(recipe.steps || []).map((s, idx) => <li key={idx}>{s}</li>)}
          </ol>
          {warnings.length > 0 && (
            <div className="text-xs" style={{ color: 'var(--color-warning)' }}>
              ⚠️ {[...new Set(warnings.map(w => `${w.member.name}（${w.condition.label}）注意${w.ingredient.label}用量`))].join('；')}
            </div>
          )}
        </div>
      ))}
    </div>
    {excluded.length > 0 && <div className="text-xs text-muted">
      🚫 已排除：{excluded.map(e => `${e.recipe.label}（${e.reason}）`).join('；')}
    </div>}
    </>
  );
}

function IngredientInfoView({ args = {} }) {
  const graph = useGraph();
  const profiles = getFamilyProfiles(graph);
  return (
    <div className="flex-col gap-md">
      {(args.ingredientIds || []).map(id => graph.getEntity(id)).filter(Boolean).map(ing => {
        const f = getIngredientFacts(graph, ing);
        const fit = profiles.map(p => {
          const good = p.conditions.filter(c => f.benefits.some(b => b.id === c.id));
          const bad = p.conditions.filter(c => f.cautions.some(b => b.id === c.id));
          const allergic = p.allergens.filter(a => f.allergens.some(b => b.id === a.id));
          return { p, good, bad, allergic };
        }).filter(x => x.good.length || x.bad.length || x.allergic.length);
        return (
          <div key={ing.id} className="produce-card">
            <div className="produce-head">
              <span className="produce-emoji">{ing.emoji}</span>
              <div style={{ flex: 1 }}>
                <div className="font-bold">{ing.label} {ing.source && <span className="badge badge-purple">{ing.source}</span>}</div>
                <div className="text-xs text-muted">{INGREDIENT_CATEGORIES[ing.category]?.label} · 当季月份：{(ing.months || []).join('、')}月</div>
              </div>
            </div>
            <div className="text-sm"><b>营养：</b>{(ing.nutrients || []).join('、') || '—'}</div>
            <div className="text-sm"><b>有益于：</b>{f.benefits.map(c => c.label).join('、') || '—'}</div>
            <div className="text-sm"><b>需慎食：</b>{f.cautions.map(c => c.label).join('、') || '—'}</div>
            {f.allergens.length > 0 && <div className="text-sm"><b>过敏原：</b>{f.allergens.map(a => a.label).join('、')}</div>}
            {ing.note && <div className="text-sm text-muted">💡 {ing.note}</div>}
            {fit.length > 0 && (
              <div className="chip-row mt-sm">
                {fit.map(({ p, good, bad, allergic }) => (
                  <span key={p.member.id} className={`mini-chip ${allergic.length || bad.length ? 'warn' : 'good'}`}>
                    {p.member.avatar} {p.member.name}：
                    {allergic.length ? '过敏，避免' : bad.length ? `慎食（${bad.map(c => c.label).join('、')}）` : `适合（${good.map(c => c.label).join('、')}）`}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PricesView() {
  return <p className="text-sm text-muted" role="status">历史商超报价未核验，已停止展示为实时价格；这些旧记录没有可验证的来源截图。请在对话中明确搜索京东商品，或等待真实门店报价通道核验后再比较。</p>;
}

function DiscountsView({ args = {} }) {
  const graph = useGraph();
  const promos = (args.promotionIds || []).map(id => graph.getEntity(id)).filter(Boolean);
  return (
    <div className="flex-col gap-sm">
      {promos.map(p => (
        <div key={p.id} className="deal-row">
          <span style={{ fontSize: 24 }}>{p.emoji}</span>
          <div style={{ flex: 1 }}>
            <div className="font-bold text-sm">{p.title}</div>
            <div className="text-xs text-muted">
              {p.app} · 截止 {p.validUntil} · 相关食材：
              {graph.objects(p.id, 'promotes').map(id => graph.getEntity(id)?.label).filter(Boolean).join('、')}
            </div>
          </div>
          <span className="badge badge-danger">{p.discount}</span>
        </div>
      ))}
    </div>
  );
}

function OrderView({ args = {} }) {
  const graph = useGraph();
  const order = graph.getEntity(args.orderId);
  if (!order) return <div className="text-muted">订单不存在或已被清除</div>;
  const storeId = graph.objects(order.id, 'orderedFrom')[0];
  const store = storeId ? graph.getEntity(storeId) : null;
  const storeLabel = store?.label || order.storeLabel;
  const delivery = store?.delivery || order.delivery;
  const statusClass = order.status === '待确认' ? 'badge-warning' : order.status === '已下单' ? 'badge-success' : 'badge-gray';
  return (
    <div>
      <div className="flex items-center justify-between mb-sm">
        <div className="text-sm">🏪 {storeLabel} · {delivery}</div>
        <span className={`badge ${statusClass}`}>{order.status}</span>
      </div>
      <table className="data-table">
        <thead><tr><th>商品</th><th>数量</th><th>单价</th><th>小计</th></tr></thead>
        <tbody>
          {order.items.map(i => (
            <tr key={i.ingredientId}>
              <td>{i.emoji} {i.label}</td>
              <td>{i.quantity} {i.unit}</td>
              <td>¥{i.price}</td>
              <td>¥{Math.round(i.price * i.quantity * 100) / 100}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center justify-between mt-md">
        <div className="font-bold">合计：<span className="text-danger">¥{order.total}</span></div>
        {order.status === '待确认' && (
          <div className="flex gap-sm">
            <button className="btn btn-ghost btn-sm" onClick={() => cancelOrder(graph, order.id)}>取消</button>
            <button className="btn btn-primary btn-sm" onClick={() => confirmOrder(graph, order.id)}>确认下单（模拟）</button>
          </div>
        )}
      </div>
    </div>
  );
}

function DeliveryView() {
  const graph = useGraph();
  const ships = graph.findEntities('Shipment').sort((a, b) => (a.layer === 'user' ? -1 : 0) - (b.layer === 'user' ? -1 : 0));
  return (
    <div className="flex-col gap-md">
      {ships.map(s => (
        <div key={s.id} className="produce-card">
          <div className="flex items-center justify-between">
            <div className="font-bold text-sm">📦 {s.item}</div>
            <span className="badge badge-secondary">{s.status}</span>
          </div>
          <div className="text-xs text-muted mb-sm">{s.carrier} · {s.trackingNo} · 预计 {s.eta}</div>
          <ul className="timeline">
            {(s.events || []).map((e, idx) => (
              <li key={idx}><span className="text-xs text-muted">{e.time}</span> {e.desc}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function CapabilitiesView() {
  const graph = useGraph();
  const caps = getCapabilities(graph);
  return (
    <div>
      {getAgents(graph).map(agent => {
        const own = caps.filter(c => graph.objects(c.id, 'providedBy').includes(agent.id));
        if (!own.length) return null;
        return (
          <div key={agent.id} className="mb-sm">
            <div className="group-title">{agent.emoji} {agent.label}</div>
            <div className="chip-row">
              {own.map(c => (
                <span key={c.id} className={`mini-chip ${c.enabled === false ? '' : 'good'}`}>
                  {c.enabled === false ? '⏸️' : '✅'} {c.label}
                </span>
              ))}
            </div>
          </div>
        );
      })}
      <Link to="/agents" className="btn btn-ghost btn-sm mt-sm">前往能力中心 →</Link>
    </div>
  );
}

function PantryView({ args = {}, onAsk }) {
  const graph = useGraph();
  const stocks = getPantryItems(graph);
  const { plans, missingIngredients } = computeRecipeRestock(graph, {
    recipeQuery: args.recipe,
    mealType: args.mealType,
  });
  return (
    <div className="flex-col gap-md">
      <div>
        <div className="group-title">🧊 现有食材库存（{stocks.length} 项）</div>
        {stocks.length === 0 ? (
          <div className="text-sm text-muted">冰箱还没有记录食材，可在右侧说“冰箱里还有2个西红柿和1盒豆腐”。</div>
        ) : (
          <div className="chip-row">
            {stocks.map(({ item, ingredient }) => (
              <span key={item.id} className="mini-chip good">
                {ingredient.emoji} {ingredient.label} · {item.quantity}{item.unit || '份'}
                <button
                  type="button"
                  className="chip-x"
                  title="消耗 1 份"
                  aria-label={`消耗${ingredient.label}`}
                  onClick={() => upsertPantryStock(graph, ingredient.id, { quantity: 1, mode: 'consume' })}
                >
                  −1
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
      {plans.length > 0 && (
        <div>
          <div className="group-title">🍳 推荐食谱缺料对照</div>
          <div className="flex-col gap-sm">
            {plans.map(({ recipe, have, missing }) => (
              <div key={recipe.id} className="produce-card">
                <div className="flex items-center justify-between mb-sm">
                  <div className="font-bold text-sm">{recipe.emoji} {recipe.label}</div>
                  {missing.length === 0
                    ? <span className="badge badge-success">食材已齐</span>
                    : <span className="badge badge-warning">缺 {missing.length} 项</span>}
                </div>
                <div className="chip-row">
                  {have.map(i => <span key={i.id} className="mini-chip good">✅ {i.label}</span>)}
                  {missing.map(i => <span key={i.id} className="mini-chip warn">🛒 缺 {i.label}</span>)}
                </div>
              </div>
            ))}
          </div>
          {missingIngredients.length > 0 && onAsk && (
            <button
              type="button"
              className="btn btn-primary btn-sm mt-sm"
              onClick={() => onAsk(`帮我买${missingIngredients.map(i => `1份${i.label}`).join('、')}`)}
            >
              🛒 一键填入所缺食材（{missingIngredients.map(i => i.label).join('、')}）
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function VideoSearchView({ args = {} }) {
  const graph = useGraph();
  const runs = getBrowserTaskRuns(graph, { kind: 'video_search' });
  const current = (args.runId && graph.getEntity(args.runId)) || runs[0];
  if (!current) {
    return <div className="text-sm text-muted">暂无视频搜索记录，可在右侧说“搜索番茄炒蛋的做法视频”或“在B站找八段锦教学视频”。</div>;
  }
  if (current.status === 'failed') {
    return (
      <div className="alert alert-danger" role="alert">
        视频搜索失败：{current.error || '服务端浏览器未就绪'}。请检查服务器的 /api/ego-browser/health，修复后重新搜索。
      </div>
    );
  }
  if (current.status === 'running') return <div role="status">正在通过服务端 ego-lite 搜索视频…</div>;
  const siteId = graph.objects(current.id, 'targetsSite')[0];
  const site = siteId ? graph.getEntity(siteId) : null;
  const agentId = graph.objects(current.id, 'executedByAgent')[0];
  const agent = agentId ? graph.getEntity(agentId) : null;
  const memberId = graph.objects(current.id, 'requestedFor')[0];
  const member = memberId ? graph.getEntity(memberId) : null;
  return (
    <div className="flex-col gap-md">
      <div className="produce-card">
        <div className="flex items-center justify-between mb-sm" style={{ flexWrap: 'wrap', gap: 6 }}>
          <div className="font-bold">{site?.emoji || '🎬'} 关键词：{current.query}</div>
          <div className="chip-row">
            {site && <span className="badge badge-secondary">{site.label}</span>}
            <span className={`badge ${current.engine === 'ego-browser-live' ? 'badge-success' : 'badge-gray'}`}>
              {current.engine === 'ego-browser-live' ? '🌐 ego-lite 实时检索' : '🧭 站点直达'}
            </span>
            {member && <span className="badge badge-purple">{member.avatar} {member.name}</span>}
          </div>
        </div>
        <div className="text-sm mb-sm">
          <b>首选结果（网站搜索排序）：</b>
          <VideoLink href={current.bestUrl} videoTitle={current.bestTitle} target="_blank" rel="noopener noreferrer" className="font-bold">
            {current.bestTitle || current.bestUrl} · 播放
          </VideoLink>
        </div>
        {(current.candidates || []).length > 1 && (
          <div>
            <div className="text-xs text-muted mb-sm">候选视频列表：</div>
            <ul className="recipe-steps" style={{ listStyle: 'decimal' }}>
              {current.candidates.map((c, idx) => (
                <li key={idx}>
                  <VideoLink href={c.url} videoTitle={c.title} target="_blank" rel="noopener noreferrer">{c.title || c.url}</VideoLink>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="text-xs text-muted mt-sm">
          按网站搜索顺序选取，未核实内容质量。\n          本体溯源：{agent?.label || 'Agent'} —executedByAgent← {current.id} —targetsSite→ {site?.label || siteId}
        </div>
      </div>
      {runs.length > 1 && (
        <div>
          <div className="group-title">🕓 最近浏览器检索记录（{runs.length}）</div>
          <div className="chip-row">
            {runs.filter(r => r.status === 'succeeded' && r.bestUrl).slice(0, 5).map(r => (
              <VideoLink key={r.id} href={r.bestUrl} videoTitle={r.bestTitle || r.query} target="_blank" rel="noopener noreferrer" className="mini-chip link">
                🎬 {r.query} · 播放
              </VideoLink>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TextView({ view }) {
  return <Markdown className="text-sm" text={view.data?.text} />;
}

const RENDERERS = {
  weather: WeatherView,
  profiles: ProfilesView,
  produce: ProduceView,
  recipes: RecipesView,
  ingredient_info: IngredientInfoView,
  prices: PricesView,
  discounts: DiscountsView,
  order: OrderView,
  delivery: DeliveryView,
  capabilities: CapabilitiesView,
  trips: TripsView,
  tasks: TasksView,
  health: HealthView,
  reminders: RemindersView,
  health_records: HealthRecordsView,
  pantry: PantryView,
  video_search: VideoSearchView,
  product_search: ProductSearchView,
  shopping_comparison: ShoppingComparisonView,
  fliggy_travel: FliggyTravelView,
  text: TextView,
};

export default function ViewCard({ view, fresh, onClose, onAsk }) {
  const graph = useGraph();
  const Renderer = RENDERERS[view.type];
  if (!Renderer) return null;
  const meta = VIEW_META[view.type] || VIEW_META.text;
  const capability = view.capabilityId && graph.getEntity(view.capabilityId);
  const agent = capability && graph.getEntity(graph.objects(capability.id, 'providedBy')[0]);
  return (
    <div className={`card view-card${fresh ? ' fresh' : ''}`} style={{ borderTop: `4px solid ${meta.color}` }}>
      <div className="card-header">
        <span className="card-title">{meta.emoji} {view.title}</span>
        <div className="flex items-center gap-sm">
          {agent && <span className="badge badge-gray" title={capability.label}>{agent.emoji} {agent.label}</span>}
          {onClose && <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="关闭卡片">✕</button>}
        </div>
      </div>
      <Renderer args={view.args} view={view} onAsk={onAsk} />
      {['produce', 'recipes', 'ingredient_info', 'health'].includes(view.type) && (
        <div className="text-xs text-muted mt-sm">ℹ️ {DISCLAIMER}</div>
      )}
    </div>
  );
}
