import { mkdir, readFile, writeFile, lstat } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const evidenceRoot = process.env.PRICE_EVIDENCE_DIR || fileURLToPath(new URL('../data/price-evidence/', import.meta.url));
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function validEvidenceId(id) { return typeof id === 'string' && idPattern.test(id); }
export function validateEvidencePng(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 45 || bytes.length > 8 * 1024 * 1024
    || !bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
    || bytes.toString('ascii', 12, 16) !== 'IHDR' || bytes.toString('ascii', bytes.length - 8, bytes.length - 4) !== 'IEND') throw new Error('Invalid evidence PNG');
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (!width || !height || width > 3000 || height > 3000 || width * height > 4000000) throw new Error('Evidence image too large');
}

/** Immutable server-owned capture and metadata. Never accepts an image URL/path from the HTTP client. */
export async function storePriceEvidence(bytes, product, { sourceUrl, observedAt, root = evidenceRoot } = {}) {
  validateEvidencePng(bytes);
  if (!Number.isFinite(Date.parse(observedAt))) throw new Error('Missing capture time');
  const source = new URL(sourceUrl);
  if (source.protocol !== 'https:' || source.hostname !== 'search.jd.com') throw new Error('Invalid source');
  const id = randomUUID();
  const evidence = { id, imageUrl: `/api/price-evidence/${id}.png`, sku: product.sku,
    productUrl: product.url, title: product.title, priceText: product.priceText, priceNote: product.priceNote,
    shop: product.shop, promotions: product.promotions, sourceUrl: source.href, observedAt,
    sha256: createHash('sha256').update(bytes).digest('hex'), captureKind: 'product-card' };
  await mkdir(root, { recursive: true, mode: 0o700 });
  await writeFile(path.join(root, `${id}.png`), bytes, { flag: 'wx', mode: 0o600 });
  await writeFile(path.join(root, `${id}.json`), JSON.stringify(evidence), { flag: 'wx', mode: 0o600 });
  return evidence;
}

export async function readPriceEvidence(id, root = evidenceRoot) {
  if (!validEvidenceId(id)) throw new Error('Invalid evidence ID');
  const filename = path.join(root, `${id}.png`);
  if (!(await lstat(filename)).isFile()) throw new Error('Missing evidence');
  const [bytes, json] = await Promise.all([readFile(filename), readFile(path.join(root, `${id}.json`), 'utf8')]);
  const meta = JSON.parse(json);
  if (meta.id !== id || meta.sha256 !== createHash('sha256').update(bytes).digest('hex')) throw new Error('Evidence integrity check failed');
  validateEvidencePng(bytes);
  return bytes;
}
