import { parseTravelDates, validDate, chinaToday } from './fliggyDates.js';

/** Shared, deterministic intent parsing. No LLM call and no guessed travel dates/cities. */
export const FLIGGY_TYPES = { all: '综合旅行', hotel: '酒店', poi: '景点门票', flight: '机票', train: '火车票' };
export function fliggyIntentTypes(query) {
  return [
    ['flight', /机票|航班|飞机|航空/], ['train', /火车|高铁|动车|车次/],
    ['poi', /门票|景点|景区|水世界|水族馆|迪士尼|博物馆/],
    ['hotel', /酒店|住宿|订房|民宿/],
  ].filter(([, re]) => re.test(query)).map(([type]) => type);
}
const cities = '北京 上海 大连 三亚 杭州 广州 深圳 成都 重庆 西安 南京 苏州 武汉 长沙 厦门 青岛 天津 沈阳 海口 昆明 丽江 桂林 珠海 香港 澳门 东京 大阪 京都 新加坡 曼谷 巴黎 伦敦 纽约'.split(' ');
export const findFliggyCity = query => cities.find(city => query.includes(city));
export function resolveFliggyRequest(input = {}, now = new Date()) {
  const query = typeof input.query === 'string' ? input.query.trim() : '';
  if (!query || query.length > 300) return { error: '请提供 1–300 字的旅行查询需求。' };
  const types = fliggyIntentTypes(query);
  if (types.length > 1) return { error: '这次需求包含多个旅行品类，请分别查询机票、火车票、酒店或景点门票，避免混用报价。' };
  const type = types[0] || input.type || 'all';
  if (!Object.hasOwn(FLIGGY_TYPES, type)) return { error: '不支持的飞猪查询类型。' };
  let cleaned = query.replace(/^(?:请)?(?:帮我)?\s*(?:在|用|通过)?飞猪(?:上(?=\s|搜索|查询|查|找|订|买))?\s*/, '')
    .replace(/^(?:请)?(?:帮我)?\s*(?:搜索|查询|查一下|查查|看看|找一下|推荐|查|搜|找)\s*/, '');
  const parsedDates = parseTravelDates(query, now);
  if (parsedDates.error) return parsedDates;
  const { dates } = parsedDates;
  cleaned = parseTravelDates(cleaned, now).cleaned;
  const date = input.depDate || dates[0];
  const checkDate = (value) => !validDate(value) ? '日期无效，请使用 YYYY-MM-DD。'
    : value < chinaToday(now) ? '出行日期已过期，请重新指定未来日期。' : null;
  for (const value of [input.depDate, input.backDate, input.checkInDate, input.checkOutDate, ...dates].filter(v => v !== undefined)) {
    const error = checkDate(value);
    if (error) return { error };
  }
  if (input.depDate && dates[0] && input.depDate !== dates[0]) return { error: '出发日期参数与问题中的日期不一致，请重新确认。' };
  if (type === 'flight' || type === 'train') {
    cleaned = cleaned.replace(/(?:机票|航班|飞机|火车票|高铁票?|动车票?|车次)/g, ' ')
      .replace(/^(?:(?:请|帮我|我想|查询|查一下|查查|搜索|查|订|购买|买|从)\s*)+/, '')
      .replace(/(?:出发日期|返程日期|日期|的|出发|往返|回程|返回|单程|票价|多少钱|有什么|有哪些|[，,。？！?!])/g, ' ').trim();
    const route = cleaned.match(/^([\p{L}]{2,20})\s*(?:到|至|飞往|飞|→|->)\s*([\p{L}]{2,20})$/u);
    const origin = input.origin || route?.[1], destination = input.destination || route?.[2];
    if (!origin || !destination || !date) return { error: `查询${FLIGGY_TYPES[type]}需要出发地、目的地和出发日期。例如：查明天北京到上海的${type === 'flight' ? '航班' : '高铁'}。` };
    if (dates.length > 2 || (dates.length > 1 && !/往返|回程|返回|返程/.test(query))) return { error: '请明确是单程日期还是往返日期；目前一次只查询一组行程。' };
    const backDate = input.backDate || (/往返|回程|返回|返程/.test(query) ? dates[1] : undefined);
    if (/往返/.test(query) && !backDate) return { error: '往返查询请补充回程日期。' };
    if (backDate && backDate < date) return { error: '回程日期不能早于出发日期。' };
    return { type, query, origin, destination, depDate: date, ...(backDate ? { backDate } : {}) };
  }
  const city = findFliggyCity(cleaned);
  if (type === 'hotel') {
    const destName = input.destName || city;
    if (!destName) return { error: '请补充酒店目的地城市，例如：杭州西湖附近的酒店。' };
    const checkInDate = input.checkInDate || dates[0], checkOutDate = input.checkOutDate || dates[1];
    if (dates.length > 2) return { error: '酒店查询请只提供入住、退房两个日期。' };
    if (Boolean(checkInDate) !== Boolean(checkOutDate)) return { error: '指定日期查酒店时，请同时提供入住日期和退房日期。' };
    if (checkInDate && checkOutDate <= checkInDate) return { error: '退房日期必须晚于入住日期。' };
    return { type, query, destName, keywords: input.keywords || cleaned.replace(/入住|退房/g, '').trim(), checkInDate, checkOutDate };
  }
  if (type === 'poi') {
    if (dates.length) return { error: '当前飞猪景点接口不支持按游玩日期核价；请先查询景点门票，再在飞猪详情页选择使用日期。' };
    const cityName = input.cityName || city;
    if (!cityName) return { error: '请补充景点所在城市，例如：上海迪士尼门票。' };
    const keyword = input.keyword || cleaned.replace(cityName, '').replace(/(?:的)?(?:门票|票价|价格|多少钱|有什么|推荐|查询|购买|买|订)/g, '').replace(/[？?。]/g, '').trim();
    return { type, query, cityName, keyword };
  }
  return { type, query };
}
