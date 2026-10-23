import PriceEvidence from './PriceEvidence.jsx';

/** One compact layout for both direct searches and requirement-checked procurement. */
export default function ProductResultRow({ product, assessment }) {
  return (
    <li className="jd-product">
      <PriceEvidence product={product} />
      <div className="jd-product-info">
        <h3><a href={product.url} target="_blank" rel="noopener noreferrer">{product.title} ↗</a></h3>
        <p className="jd-product-shop">
          <span>{product.shop || '未采集到店铺名'}{product.isAd ? ' · 广告' : ''}</span>
          {assessment ? <span>{assessment.store.label}</span>
            : product.badges.map(badge => <span key={badge}>{badge}</span>)}
        </p>
        {!!assessment?.excluded.length && <p className="jd-product-check text-danger">需求不符：{assessment.excluded.join('；')}</p>}
        {!!assessment?.issues.length && <p className="jd-product-check text-muted">待核实：{assessment.issues.join('；')}</p>}
        <p className="jd-product-promotions">
          {product.promotions.length ? `优惠：${product.promotions.join('；')}` : '未采集到优惠文字，请到原站确认'}
        </p>
      </div>
      <div className="jd-product-price">
        <span className="jd-product-price-label">页面展示价</span>
        <strong>{product.priceText || '价格未取得'}</strong>
        {product.priceNote && <span className="jd-product-price-note">{product.priceNote}</span>}
        {product.referencePriceText && <span className="jd-product-reference">页面对照价：{product.referencePriceText}</span>}
      </div>
    </li>
  );
}
