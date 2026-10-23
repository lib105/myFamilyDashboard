/** Calendar-only dates; parsing never depends on the host machine's timezone. */
export const chinaToday = now => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(now);
export const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const pad = number => String(number).padStart(2, '0');
const datePattern = /(?<!\d)(?:(\d{4})\s*(?:年|[-/.])\s*)?(\d{1,2})\s*(?:月|[-/.])\s*(\d{1,2})(?:日|号)?(?!\d)|大后天|后天|明天|明日|今天|今日/g;

export function parseTravelDates(query, now = new Date()) {
  const today = chinaToday(now);
  const year = Number(today.slice(0, 4));
  const matches = [...query.matchAll(datePattern)];
  const dates = [];
  for (const match of matches) {
    let date;
    if (match[2]) date = `${match[1] || year}-${pad(match[2])}-${pad(match[3])}`;
    else {
      const days = /大后天/.test(match[0]) ? 3 : /后天/.test(match[0]) ? 2 : /明/.test(match[0]) ? 1 : 0;
      date = new Date(Date.parse(`${today}T12:00:00+08:00`) + days * 86400000).toISOString().slice(0, 10);
    }
    if (!validDate(date)) return { error: `日期「${match[0]}」无效，请填写真实的日历日期。` };
    if (!match[1] && date < today) return { error: `日期「${match[0]}」按当前年份 ${year} 年已过期，请明确出行年份。` };
    dates.push(date);
  }
  return { dates, cleaned: query.replace(datePattern, ' ').replace(/\s+/g, ' ').trim() };
}
