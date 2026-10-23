import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const legacyPath = fileURLToPath(new URL('../src/data/food/supermarketPrices.json', import.meta.url));

/** Audit-only legacy records. These rows are NOT verified live merchant prices. */
export function getSupermarketDatabase() {
  return fs.existsSync(legacyPath) ? JSON.parse(fs.readFileSync(legacyPath, 'utf8')) : { stores: [], prices: {} };
}

/** No legacy price/source label, timestamp or cache hit can certify the merchant attribution. */
export function checkCache() {
  return { cached: false, itemKey: null, itemData: null };
}

/** Disabled until real store/SKU/specification/evidence adapters exist; never invent food taxonomy. */
export function persistSupermarketPrices() {
  throw new Error('商超真实门店来源未核验，禁止将京东代购、估算价格或不同商品写成三家商超报价');
}
