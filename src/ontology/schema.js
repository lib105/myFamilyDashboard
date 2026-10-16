/**
 * Ontology schema (TBox) for the family dashboard.
 *
 * Everything the app knows is expressed as typed entities (instances of a
 * class) connected by typed relations. Agents and their capabilities are part
 * of the same ontology, so new capabilities can be added at runtime simply by
 * adding new Capability entities linked to an Agent.
 */

export const LITERAL = 'Literal';

export const CLASSES = {
  FamilyMember:    { label: '家庭成员',   description: '家庭中的一个人，可拥有任意属性' },
  HealthCondition: { label: '健康状况',   description: '疾病或身体状况，如高血压、糖尿病' },
  Allergen:        { label: '过敏原',     description: '可能引起过敏的物质' },
  Ingredient:      { label: '食材',       description: '水果、蔬菜、肉蛋奶、谷物等' },
  Season:          { label: '季节',       description: '春夏秋冬，用于时令判断' },
  Recipe:          { label: '食谱',       description: '由若干食材组成的简单做法' },
  Store:           { label: '超市/商家',  description: '可购买食材的地点' },
  PriceOffer:      { label: '价格报价',   description: '某超市某食材的价格' },
  Promotion:       { label: '优惠活动',   description: '其他 App 的打折、团购信息' },
  Order:           { label: '订单',       description: '模拟下单生成的订单' },
  Shipment:        { label: '物流单',     description: '快递/配送信息' },
  Trip:            { label: '旅行计划',   description: '家庭出行计划，含预算、行前清单与心愿' },
  Task:            { label: '家庭任务',   description: '家务/学习等周期性任务，完成可获得积分' },
  HealthReminder:  { label: '健康提醒',   description: '用药、体检、疫苗、复查等健康提醒' },
  Agent:           { label: 'AI Agent',   description: '承担某一类职责的智能体' },
  Capability:      { label: '能力',       description: 'Agent 可被调用的一项能力（工具）' },
};

export const RELATIONS = {
  hasCondition:     { label: '存在健康状况', domain: 'FamilyMember', range: 'HealthCondition' },
  allergicTo:       { label: '对…过敏',      domain: 'FamilyMember', range: 'Allergen' },
  hasAttribute:     { label: '拥有属性',     domain: 'FamilyMember', range: LITERAL },
  benefits:         { label: '有益于',       domain: 'Ingredient',   range: 'HealthCondition' },
  cautionFor:       { label: '需慎食于',     domain: 'Ingredient',   range: 'HealthCondition' },
  containsAllergen: { label: '含过敏原',     domain: 'Ingredient',   range: 'Allergen' },
  availableIn:      { label: '当季于',       domain: 'Ingredient',   range: 'Season' },
  usesIngredient:   { label: '使用食材',     domain: 'Recipe',       range: 'Ingredient' },
  offerOf:          { label: '报价食材',     domain: 'PriceOffer',   range: 'Ingredient' },
  soldAt:           { label: '在售于',       domain: 'PriceOffer',   range: 'Store' },
  promotes:         { label: '优惠食材',     domain: 'Promotion',    range: 'Ingredient' },
  orderedFrom:      { label: '下单于',       domain: 'Order',        range: 'Store' },
  orderContains:    { label: '包含食材',     domain: 'Order',        range: 'Ingredient' },
  shipmentOf:       { label: '配送订单',     domain: 'Shipment',     range: 'Order' },
  providedBy:       { label: '由…提供',      domain: 'Capability',   range: 'Agent' },
};

export const SEASONS = [
  { id: 'season_spring', label: '春季', emoji: '🌸', months: [3, 4, 5] },
  { id: 'season_summer', label: '夏季', emoji: '☀️', months: [6, 7, 8] },
  { id: 'season_autumn', label: '秋季', emoji: '🍂', months: [9, 10, 11] },
  { id: 'season_winter', label: '冬季', emoji: '❄️', months: [12, 1, 2] },
];

export const INGREDIENT_CATEGORIES = {
  fruit:     { label: '水果', emoji: '🍎' },
  vegetable: { label: '蔬菜', emoji: '🥬' },
  mushroom:  { label: '菌菇', emoji: '🍄' },
  grain:     { label: '谷物', emoji: '🌾' },
  protein:   { label: '肉蛋奶豆', emoji: '🥚' },
  nut:       { label: '坚果', emoji: '🌰' },
};

export function seasonOfMonth(month) {
  return SEASONS.find(s => s.months.includes(month)) || SEASONS[0];
}
