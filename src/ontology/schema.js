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
  OntologyClass:   { label: '本体类元实体', description: 'TBox 中的类，用于声明 Agent 能力读写的领域边界' },
  FamilyMember:    { label: '家庭成员',   description: '家庭中的一个人，可拥有任意属性' },
  HealthCondition: { label: '健康状况',   description: '疾病或身体状况，如高血压、糖尿病' },
  Allergen:        { label: '过敏原',     description: '可能引起过敏的物质' },
  Ingredient:      { label: '食材',       description: '水果、蔬菜、肉蛋奶、谷物等' },
  FoodSource:      { label: '食材来源',   description: '食材的植物、菌类或动物来源；混合食材可关联多个来源' },
  Season:          { label: '季节',       description: '春夏秋冬，用于时令判断' },
  Recipe:          { label: '食谱',       description: '由若干食材组成的简单做法' },
  Store:           { label: '超市/商家',  description: '可购买食材的地点' },
  PriceOffer:      { label: '价格报价',   description: '某超市某食材的价格' },
  Promotion:       { label: '优惠活动',   description: '其他 App 的打折、团购信息' },
  Order:           { label: '订单',       description: '模拟下单生成的订单' },
  Shipment:        { label: '物流单',     description: '快递/配送信息' },
  Trip:            { label: '旅行计划',   description: '家庭出行计划，含预算、行前清单与心愿' },
  Task:            { label: '家庭任务',   description: '家务/学习等周期性任务，完成可获得积分' },
  TaskLog:         { label: '任务打卡记录', description: '某次任务完成的事件实体，记录完成时间、积分与实际执行人' },
  HealthReminder:  { label: '健康提醒',   description: '用药、体检、疫苗、复查等健康提醒' },
  HealthRecord:    { label: '健康监测记录', description: '某次血压、血糖、体重、体温或服药的时序观测实体' },
  PantryItem:      { label: '家庭库存项', description: '冰箱/储物柜中某食材的现有库存量与单位' },
  BrowserSite:     { label: '浏览器目标站点', description: '服务端 ego-lite 浏览器允许访问的受控站点与搜索/提取规则' },
  ShoppingRequest: { label: '采购需求', description: '一次采购对话确认的品类、品牌、规格、预算、平台偏好与生命周期状态；不是订单' },
  BrowserTaskRun:  { label: '浏览器执行记录', description: 'Agent 调用服务端 ego-lite 浏览器执行真实网页操作并提取结果的事件记录' },
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
  derivedFrom:      { label: '来源于',       domain: 'Ingredient',   range: 'FoodSource' },
  extrasDerivedFrom: { label: '辅料来源于',   domain: 'Recipe',       range: 'FoodSource' },
  extrasContainAllergen: { label: '辅料含过敏原', domain: 'Recipe',   range: 'Allergen' },
  availableIn:      { label: '当季于',       domain: 'Ingredient',   range: 'Season' },
  usesIngredient:   { label: '使用食材',     domain: 'Recipe',       range: 'Ingredient' },
  offerOf:          { label: '报价食材',     domain: 'PriceOffer',   range: 'Ingredient' },
  soldAt:           { label: '在售于',       domain: 'PriceOffer',   range: 'Store' },
  promotes:         { label: '优惠食材',     domain: 'Promotion',    range: 'Ingredient' },
  orderedFrom:      { label: '下单于',       domain: 'Order',        range: 'Store' },
  orderContains:    { label: '包含食材',     domain: 'Order',        range: 'Ingredient' },
  shipmentOf:       { label: '配送订单',     domain: 'Shipment',     range: 'Order' },
  assignedTo:       { label: '分配给',       domain: 'Task',         range: 'FamilyMember' },
  logOfTask:        { label: '打卡任务',     domain: 'TaskLog',      range: 'Task' },
  completedBy:      { label: '完成人',       domain: 'TaskLog',      range: 'FamilyMember' },
  reminderFor:      { label: '提醒对象',     domain: 'HealthReminder', range: 'FamilyMember' },
  recordFor:        { label: '监测成员',     domain: 'HealthRecord', range: 'FamilyMember' },
  stocksIngredient: { label: '库存食材',     domain: 'PantryItem',   range: 'Ingredient' },
  usesBrowserSite:  { label: '允许访问站点', domain: 'Capability',   range: 'BrowserSite' },
  executedByAgent:  { label: '执行智能体',   domain: 'BrowserTaskRun', range: 'Agent' },
  targetsSite:      { label: '访问目标站点', domain: 'BrowserTaskRun', range: 'BrowserSite' },
  requestedFor:     { label: '关联家庭成员', domain: 'BrowserTaskRun', range: 'FamilyMember' },
  fulfillsShoppingRequest: { label: '响应采购需求', domain: 'BrowserTaskRun', range: 'ShoppingRequest' },
  providedBy:       { label: '由…提供',      domain: 'Capability',   range: 'Agent' },
  mutatesClass:     { label: '修改本体类',   domain: 'Capability',   range: 'OntologyClass' },
  readsClass:       { label: '读取本体类',   domain: 'Capability',   range: 'OntologyClass' },
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

export const FOOD_SOURCES = [
  { id: 'food_plant', label: '植物' },
  { id: 'food_fungus', label: '菌类' },
  { id: 'food_meat', label: '畜禽肉及其制品' },
  { id: 'food_fish', label: '鱼及其制品' },
  { id: 'food_seafood', label: '其他海鲜及其制品' },
  { id: 'food_egg', label: '蛋及其制品' },
  { id: 'food_dairy', label: '乳及其制品' },
  { id: 'food_animal_other', label: '其他动物来源（如蜂蜜；肉源明胶归入肉类）' },
];

export function seasonOfMonth(month) {
  return SEASONS.find(s => s.months.includes(month)) || SEASONS[0];
}
