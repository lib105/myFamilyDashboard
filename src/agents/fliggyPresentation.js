/** Share presentation between chat and card, without inferring timezone or missing API fields. */
export const missingTravelValue = '未返回';
export const travelValue = value => value === undefined || value === null || value === '' ? missingTravelValue : String(value);
export function splitTravelDateTime(value) {
  const match = typeof value === 'string' && value.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::\d{2})?/);
  return match ? { date: match[1], time: match[2] } : { date: missingTravelValue, time: missingTravelValue };
}
export function travelCriteriaText(criteria = {}) {
  if (criteria.type === 'flight' || criteria.type === 'train') {
    return `${travelValue(criteria.origin)} → ${travelValue(criteria.destination)} · 出发日期：${travelValue(criteria.depDate)}${criteria.backDate ? ` · 回程日期：${criteria.backDate}` : ''}`;
  }
  if (criteria.type === 'hotel') {
    return `${travelValue(criteria.destName)} · 入住日期：${criteria.checkInDate || '未指定'} · 退房日期：${criteria.checkOutDate || '未指定'}`;
  }
  return '';
}
export function travelDetailLines(item) {
  if (!item.journeys?.length) return item.description ? [item.description] : [];
  return item.journeys.flatMap((journey, index) => [
    `${item.journeys.length > 1 ? `行程 ${index + 1} · ` : ''}${travelValue(journey.journeyType)}`,
    ...(journey.segments || []).map(segment => {
      const departure = splitTravelDateTime(segment.departureDateTime), arrival = splitTravelDateTime(segment.arrivalDateTime);
      return `${segment.transportNo}｜出发：${departure.date} ${departure.time} ${travelValue(segment.departureStation)}${segment.departureTerminal ? ` ${segment.departureTerminal}` : ''}｜到达：${arrival.date} ${arrival.time} ${travelValue(segment.arrivalStation)}${segment.arrivalTerminal ? ` ${segment.arrivalTerminal}` : ''}｜舱位/席别：${travelValue(segment.seatClass)}｜历时：${segment.durationMinutes == null ? missingTravelValue : `${segment.durationMinutes}分钟`}`;
    }),
  ]);
}
