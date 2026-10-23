import { fliggyIntentTypes, findFliggyCity, resolveFliggyRequest } from './fliggyRequest.js';
import { parseTravelDates, validDate } from './fliggyDates.js';

const fields = ['type', 'origin', 'destination', 'depDate', 'backDate', 'destName', 'checkInDate', 'checkOutDate', 'cityName', 'keywords'];
const contextOnly = request => Object.fromEntries(fields.filter(key => typeof request?.[key] === 'string').map(key => [key, request[key]]));
const continuation = /再|接着|继续|同日|同一天|当天|那天|那里|当地|目的地|同城/;
const shortHotelAnswer = text => {
  const cleaned = String(text).replace(/^(?:请)?(?:那就|就|我想|想|我们)?\s*/, '').replace(/[，,。！!？?\s]/g, '');
  if (/^住(?:\d+|一|二|两|三|四|五|六|七|八|九|十)晚$/.test(cleaned)) return true;
  if (!/\d.*(?:月|[-/.])|今天|明天|后天/.test(cleaned)) return false;
  return /^(?:入住|退房|退店|到|至)*$/.test(cleaned
    .replace(/(?:\d{4}(?:年|[-/.]))?\d{1,2}(?:月|[-/.])\d{1,2}(?:日|号)?|大后天|后天|明天|明日|今天|今日/g, ''));
};

/** Only this chat's recent history; never infer from globally shared graph results. */
export function recentFliggyContext(history = [], now = new Date()) {
  for (const message of history.slice(-12).reverse()) {
    if (message.role === 'assistant' && message.fliggyContext) return contextOnly(message.fliggyContext);
    if (message.role !== 'user') continue;
    const text = String(message.text || '');
    if (fliggyIntentTypes(text).length || /飞猪/.test(text)) {
      const request = resolveFliggyRequest({ query: text }, now);
      if (!request.error) return contextOnly(request); // Supports messages saved before context metadata existed.
      continue;
    }
    if (!shortHotelAnswer(text) && !continuation.test(text)) return null; // Don't revive a stale trip after unrelated chat.
  }
  return null;
}

export function isFliggyContextReply(text, history = []) {
  const context = recentFliggyContext(history);
  return context?.type === 'hotel' && shortHotelAnswer(text);
}

/** Resolve explicit new values first; inherit only values referenced by a continuation. */
export function resolveFliggyTurn(args, history = [], now = new Date()) {
  const query = String(args.query || '').trim();
  const previous = recentFliggyContext(history, now);
  const types = fliggyIntentTypes(query);
  const type = types[0] || args.type || (previous?.type === 'hotel' && shortHotelAnswer(query) ? 'hotel' : undefined);
  const reuse = previous && (continuation.test(query) || (previous.type === 'hotel' && shortHotelAnswer(query)));
  const input = { ...args, ...(type ? { type } : {}) };
  const parsed = parseTravelDates(query, now);
  if (parsed.error) return { request: parsed, context: null, notice: '' };
  const explicitCity = findFliggyCity(query);
  const inherited = [];
  if (type === 'hotel' && reuse) {
    const city = explicitCity || args.destName || previous.destName || previous.destination || previous.cityName;
    if (city && !args.destName) input.destName = city;
    if (city && !explicitCity && !args.destName) inherited.push(`目的地 ${city}`);
    const sameDay = /同日|同一天|当天|那天/.test(query);
    const previousDate = previous.checkInDate || previous.depDate;
    const checkoutAnswer = /退房|退店/.test(query) && !/入住/.test(query) && parsed.dates.length === 1;
    if (!args.checkInDate && !checkoutAnswer && parsed.dates[0]) input.checkInDate = parsed.dates[0];
    if (!input.checkInDate && previousDate && (sameDay || previous.type === 'hotel')) {
      input.checkInDate = previousDate;
      inherited.push(`入住日期 ${previousDate}`);
    }
    if (checkoutAnswer) input.checkOutDate = parsed.dates[0];
    else if (!input.checkOutDate && parsed.dates[1]) input.checkOutDate = parsed.dates[1];
    // Retain a confirmed checkout only when the stay's city and check-in haven't changed.
    if (!input.checkOutDate && previous.type === 'hotel' && city === previous.destName && input.checkInDate === previous.checkInDate) input.checkOutDate = previous.checkOutDate;
    const nightsMatch = query.match(/住\s*(\d+|一|二|两|三|四|五|六|七|八|九|十)\s*晚/);
    if (nightsMatch && validDate(input.checkInDate)) {
      const nights = Number(nightsMatch[1]) || ({ 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 })[nightsMatch[1]];
      if (nights >= 1 && nights <= 30) input.checkOutDate = new Date(Date.parse(`${input.checkInDate}T12:00:00+08:00`) + nights * 86400000).toISOString().slice(0, 10);
    }
  }
  // Remove referential wording from search keywords, not from the displayed user query.
  if (type === 'hotel' && reuse && !input.keywords && shortHotelAnswer(query) && input.destName === previous.destName) input.keywords = previous.keywords;
  if (type === 'hotel' && reuse && !input.keywords) {
    const preferences = parsed.cleaned.replace(/再|接着|继续|同日|同一天|当天|那天|那里|当地|目的地|同城|请|帮我|查查|查询|查一下|看看|查|的|入住|退房|退店|住\s*(?:\d+|一|二|两|三|四|五|六|七|八|九|十)\s*晚|[，,。！!？?]/g, '').trim();
    input.keywords = `${explicitCity ? '' : input.destName || ''}${preferences || '酒店'}`;
  }
  let request = resolveFliggyRequest(input, now);
  const context = contextOnly(request.error ? input : request);
  const notice = inherited.length ? `沿用上一轮：${inherited.join('，')}。` : '';
  if (request.error && type === 'hotel' && input.destName && input.checkInDate && !input.checkOutDate) {
    request = { error: `已理解为查询${input.destName}、${input.checkInDate}入住的酒店。请补充退房日期，或告诉我住几晚（例如“住两晚”），我再按完整日期查询。` };
  }
  return { request, context, notice };
}
