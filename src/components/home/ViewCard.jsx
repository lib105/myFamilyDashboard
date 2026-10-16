import { Link } from 'react-router-dom';
import { useGraph } from '../../ontology/index.js';
import { INGREDIENT_CATEGORIES } from '../../ontology/schema.js';
import { getIngredientFacts, getFamilyProfiles, getAgents, getCapabilities } from '../../ontology/queries.js';
import { recommendIngredients, recommendRecipes } from '../../agents/recommender.js';
import { confirmOrder, cancelOrder } from '../../agents/capabilities.js';
import { TripsView, TasksView, HealthView, RemindersView } from './FamilyViews.jsx';

const VIEW_META = {
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
          🚫 已因过敏排除：{result.excluded.map(e => `${e.ingredient.label}（${e.reason}）`).join('；')}
        </div>
      )}
    </>
  );
}

function RecipesView({ args = {} }) {
  const graph = useGraph();
  const { recipes } = recommendRecipes(graph, { mealType: args.mealType, memberIds: args.memberIds });
  if (!recipes.length) return <div className="text-muted">暂无合适的食谱</div>;
  return (
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

function PricesView({ args = {} }) {
  const graph = useGraph();
  const stores = graph.findEntities('Store');
  const rows = (args.ingredientIds || []).map(id => graph.getEntity(id)).filter(Boolean).map(ing => {
    const offers = Object.fromEntries(graph.subjects('offerOf', ing.id).map(oid => [graph.objects(oid, 'soldAt')[0], graph.getEntity(oid)]));
    const min = Math.min(...Object.values(offers).map(o => o.price));
    return { ing, offers, min };
  });
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>食材</th>
            {stores.map(s => <th key={s.id}>{s.emoji} {s.label}<div className="text-xs text-muted">{s.distanceKm}km · {s.delivery}</div></th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ ing, offers, min }) => (
            <tr key={ing.id}>
              <td>{ing.emoji} {ing.label}</td>
              {stores.map(s => {
                const o = offers[s.id];
                return (
                  <td key={s.id} className={o?.price === min ? 'cheapest' : ''}>
                    {o ? `¥${o.price}/${o.unit}` : '—'}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-xs text-muted mt-sm">价格为本地模拟数据，绿色为最低价。</div>
    </div>
  );
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
  const statusClass = order.status === '待确认' ? 'badge-warning' : order.status === '已下单' ? 'badge-success' : 'badge-gray';
  return (
    <div>
      <div className="flex items-center justify-between mb-sm">
        <div className="text-sm">🏪 {order.storeLabel} · {order.delivery}</div>
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

function TextView({ view }) {
  return <div style={{ whiteSpace: 'pre-wrap' }} className="text-sm">{view.data?.text}</div>;
}

const RENDERERS = {
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
  text: TextView,
};

export default function ViewCard({ view, fresh, onClose }) {
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
      <Renderer args={view.args} view={view} />
      {['produce', 'recipes', 'ingredient_info', 'health'].includes(view.type) && (
        <div className="text-xs text-muted mt-sm">ℹ️ {DISCLAIMER}</div>
      )}
    </div>
  );
}
