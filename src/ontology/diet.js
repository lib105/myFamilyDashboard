const DIET_KEYS = new Set(['饮食类型', '饮食偏好', '饮食禁忌', '饮食习惯', '饮食方式', '饮食限制', '饮食']);
const TYPES = new Map([
  ...['vegetarian', '素食', '素食者', '素食主义者', '吃素', '只吃素', '蛋奶素', '蛋奶素食'].map(v => [v, 'vegetarian']),
  ...['vegan', '纯素', '纯素食', '纯素食者', '纯素主义者', '纯素食主义者', '吃纯素', '只吃纯素', '严格素食'].map(v => [v, 'vegan']),
  ...['omnivore', '杂食', '荤素都吃', '不吃素', '不再吃素', '不再是素食主义者', '不是素食主义者', '非素食', '非素食主义者'].map(v => [v, 'omnivore']),
]);

/**
 * Returns a trimmed { key, value }; only exact dietary declarations under diet
 * keys become 饮食类型 with a vegetarian / vegan / omnivore value.
 * Food avoidance (including 不吃肉 / 不吃荤) and negating vegan alone do
 * not establish another diet.
 */
export function normalizeDietAttribute(key, value) {
  const attr = { key: String(key ?? '').trim(), value: String(value ?? '').trim() };
  if (!DIET_KEYS.has(attr.key)) return attr;
  const declaration = attr.value.toLowerCase().replace(/^(?:现在|目前|已经|开始|改为|改成|是)+/, '');
  const type = TYPES.get(declaration);
  return type ? { key: '饮食类型', value: type } : attr;
}

/** Reads canonical attributes first, otherwise exact legacy declarations. */
export function dietaryTypeFromAttributes(attributes = []) {
  let canonical;
  let legacy;
  for (const attr of attributes || []) {
    if (!attr || typeof attr !== 'object') continue;
    const normalized = normalizeDietAttribute(attr.key, attr.value);
    if (normalized.key !== '饮食类型' || !TYPES.has(normalized.value)) continue;
    if (attr.key === '饮食类型') canonical = normalized.value;
    else legacy = normalized.value;
  }
  return canonical || legacy;
}
