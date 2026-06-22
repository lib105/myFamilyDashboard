/**
 * dealExtractor.js
 * Utility to auto-extract and classify promotion info from raw message text.
 * This is an MVP local implementation. Future versions can replace this
 * with a real AI/NLP service or WeChat message parser.
 */

const CATEGORY_KEYWORDS = {
  flights: ['机票', '航班', '航空', '飞机', '起飞', '出发', '往返', '单程', '含税'],
  hotels: ['酒店', '民宿', '旅馆', '住宿', '早餐', '大床房', '套房', '晚'],
  packages: ['团', '套餐', '跟团', '自由行', '出游', '亲子游', '旅行社', '全包'],
  shopping: ['优惠', '折扣', '特价', '史低', '券', '满减', '到手价', '秒杀'],
};

const PRICE_PATTERNS = [
  /[￥¥]\s*(\d[\d,]*(?:\.\d+)?)/g,
  /(\d[\d,]*(?:\.\d+)?)\s*元/g,
  /(\d[\d,]*(?:\.\d+)?)\s*\/人/g,
  /(\d[\d,]*(?:\.\d+)?)\s*\/晚/g,
];

// DATE_PATTERNS reserved for future date extraction feature
// const DATE_PATTERNS = [...]

const TAG_KEYWORDS = [
  '机票', '酒店', '亲子', '特价', '史低', '优惠', '套餐', '团购',
  '大阪', '东京', '三亚', '北京', '上海', '香港', '澳门', '海南',
  '东航', '国航', '南航', '海南航空', '携程', '飞猪',
  '迪士尼', '环球影城', '水上乐园',
];

/**
 * Classify a message into a deal category based on keyword matching.
 */
function classifyCategory(text) {
  const scores = Object.entries(CATEGORY_KEYWORDS).map(([cat, keywords]) => ({
    category: cat,
    score: keywords.filter((kw) => text.includes(kw)).length,
  }));
  scores.sort((a, b) => b.score - a.score);
  return scores[0].score > 0 ? scores[0].category : 'packages';
}

/**
 * Extract the lowest price mentioned in the text.
 */
function extractPrice(text) {
  const prices = [];
  for (const pattern of PRICE_PATTERNS) {
    const re = new RegExp(pattern.source, 'g');
    let match;
    while ((match = re.exec(text)) !== null) {
      const num = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(num) && num > 0) prices.push(num);
    }
  }
  return prices.length > 0 ? Math.min(...prices) : null;
}

/**
 * Extract relevant tags from the text.
 */
function extractTags(text) {
  return TAG_KEYWORDS.filter((kw) => text.includes(kw));
}

/**
 * Generate a short title from the raw message text.
 */
function generateTitle(text, category) {
  const categoryLabels = {
    flights: '✈️ 机票特惠',
    hotels: '🏨 酒店优惠',
    packages: '🧳 旅游套餐',
    shopping: '🛍️ 购物优惠',
  };
  const label = categoryLabels[category] || '💰 促销信息';

  // Try to extract a destination or product name
  const destMatch = text.match(/[上北广深杭成重武苏宁天青厦海三][海京州圳州都庆汉州京门门岛厦亚]/);
  const dest = destMatch ? destMatch[0] : '';

  const firstLine = text.split(/[！。\n]/)[0];
  const shortLine = firstLine.length > 30 ? firstLine.slice(0, 30) + '…' : firstLine;

  return dest ? `${label} ${dest} - ${shortLine}` : `${label}: ${shortLine}`;
}

/**
 * Main extraction function. Takes raw message text and returns a deal object.
 */
export function extractDealFromMessage(rawMessage, source = '微信群') {
  const text = rawMessage.trim();
  if (!text) return null;

  const category = classifyCategory(text);
  const price = extractPrice(text);
  const tags = extractTags(text);
  const title = generateTitle(text, category);
  const now = new Date();

  return {
    id: `d_${Date.now()}`,
    source,
    category,
    title,
    description: text.length > 120 ? text.slice(0, 120) + '…' : text,
    price,
    originalPrice: null,
    currency: 'CNY',
    discount: null,
    validUntil: null,
    tags,
    rawMessage: text,
    createdAt: now.toISOString(),
    digestDate: now.toISOString().slice(0, 10),
    isBookmarked: false,
    status: 'active',
  };
}

/**
 * Group deals by digest date for daily digest view.
 */
export function groupDealsByDate(deals) {
  return deals.reduce((acc, deal) => {
    const date = deal.digestDate || deal.createdAt?.slice(0, 10) || 'unknown';
    if (!acc[date]) acc[date] = [];
    acc[date].push(deal);
    return acc;
  }, {});
}

/**
 * Get category display info.
 */
export function getCategoryInfo(category) {
  const map = {
    flights: { label: '机票', emoji: '✈️', color: '#4A90D9' },
    hotels: { label: '酒店', emoji: '🏨', color: '#27AE60' },
    packages: { label: '旅游套餐', emoji: '🧳', color: '#E67E22' },
    shopping: { label: '网购优惠', emoji: '🛍️', color: '#9B59B6' },
  };
  return map[category] || { label: '其他', emoji: '💰', color: '#95A5A6' };
}
