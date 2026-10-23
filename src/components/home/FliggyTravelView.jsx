import { splitTravelDateTime, travelValue, travelCriteriaText } from '../../agents/fliggyPresentation.js';

function JourneyStop({ label, dateTime, station, terminal }) {
  const { date, time } = splitTravelDateTime(dateTime);
  return <div className="flex-col gap-xs">
    <span className="text-sm text-muted">{label} · {date}</span>
    <strong style={{ fontSize: 20, fontVariantNumeric: 'tabular-nums' }}>{time}</strong>
    <span className="text-sm">{travelValue(station)}{terminal ? ` · ${terminal}` : ''}</span>
  </div>;
}

/** Same full travel data as the chat reply; peer rows, not promotional hotel cards. */
export default function FliggyTravelView({ args = {} }) {
  const items = args.items || [];
  const criteriaText = travelCriteriaText(args.criteria);
  return <section className="flex-col gap-sm" aria-label="飞猪旅行查询结果">
    <p className="text-sm">{criteriaText || `搜索关键词：${args.query}`}</p>
    {!items.length && <p className="text-sm text-muted">该查询暂无结果。</p>}
    {items.map(item => <article key={item.id || item.title} className="produce-card flex-col gap-sm">
      <div className="flex items-center justify-between" style={{ gap: 12, flexWrap: 'wrap' }}>
        <strong className="text-sm" style={{ overflowWrap: 'anywhere' }}>
          {item.jumpUrl ? <a href={item.jumpUrl} target="_blank" rel="noopener noreferrer">{item.title || item.name} ↗</a> : item.title || item.name}
        </strong>
        <span className="text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>展示价 <b>{item.price || '未返回'}</b></span>
      </div>
      {(item.journeys || []).map((journey, j) => <div key={j} className="flex-col gap-sm">
        <p className="text-sm text-muted">{item.journeys.length > 1 ? `行程 ${j + 1} · ` : ''}{travelValue(journey.journeyType)}</p>
        {(journey.segments || []).map((segment, s) => <div key={s} className="flex-col gap-sm">
          <p className="text-sm">{segment.carrier || ''} {segment.transportNo} · {travelValue(segment.seatClass)} · 历时 {segment.durationMinutes == null ? '未返回' : `${segment.durationMinutes}分钟`}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 16 }}>
            <JourneyStop label="出发" dateTime={segment.departureDateTime} station={segment.departureStation} terminal={segment.departureTerminal} />
            <JourneyStop label="到达" dateTime={segment.arrivalDateTime} station={segment.arrivalStation} terminal={segment.arrivalTerminal} />
          </div>
        </div>)}
      </div>)}
      {item.description && <p className="text-sm">{item.description}</p>}
      {item.star && <p className="text-sm text-muted">星级：{item.star}</p>}
    </article>)}
    <p className="text-sm text-muted">时间按飞猪原文展示，为机场/车站当地时间，未做时区换算。价格与库存请以飞猪详情页为准，未自动预订。</p>
  </section>;
}
