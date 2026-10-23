import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolveFliggyRequest } from '../src/agents/fliggyRequest.js';

const execFileAsync = promisify(execFile);
const directory = path.dirname(fileURLToPath(import.meta.url));
const BUNDLE_PATH = path.join(directory, 'lib/flyai-bundle.cjs');
const localEnv = path.resolve(directory, '../.env.fliggy.local');
if (!process.env.FLYAI_API_KEY && existsSync(localEnv)) process.loadEnvFile(localEnv);

export async function runFliggyCli(command, args = [], { apiKey = process.env.FLYAI_API_KEY, timeout = 30000 } = {}) {
  if (!apiKey) throw new Error('服务端未配置 FLYAI_API_KEY');
  let stdout;
  try {
    ({ stdout } = await execFileAsync(process.execPath, [BUNDLE_PATH, command, ...args], {
      env: { ...process.env, FLYAI_API_KEY: apiKey, FLYAI_JSON: '1' }, timeout, maxBuffer: 2 * 1024 * 1024,
    }));
  } catch (error) {
    // Never forward child-process errors containing env, raw stderr or credentials, even as a cause.
    // eslint-disable-next-line preserve-caught-error -- Intentionally redact the sensitive child-process error.
    throw new Error(error.killed ? '飞猪接口响应超时，请稍后重试' : '飞猪接口调用失败，请检查服务端密钥、额度或网络');
  }
  let result;
  try { result = JSON.parse(stdout.trim()); } catch { throw new Error('飞猪接口未返回有效 JSON'); }
  if (result?.isError || result?.error || result?.status !== 0) throw new Error('飞猪平台返回业务错误，未生成旅行报价');
  if (!Array.isArray(result?.data?.itemList)) throw new Error('飞猪结果格式异常，未生成旅行报价');
  return result;
}

const price = value => value === undefined || value === null || value === '' ? null : (/^[¥￥]/.test(String(value)) ? String(value) : `¥${value}`);
const safeLink = value => {
  try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'router.feizhu.com' ? url.href : undefined; } catch { return undefined; }
};
export function normalizeFliggyItems(items, type) {
  return items.flatMap((item, index) => {
    const info = item.info || item;
    if (type === 'flight' || type === 'train') {
      const segments = (item.journeys || []).flatMap(j => j.segments || []);
      if (!segments.length || segments.some(s => !s.marketingTransportNo || s.transportType !== (type === 'flight' ? '飞机' : '火车'))) return [];
      const first = segments[0];
      return [{ id: `${type}_${index}_${first.marketingTransportNo}`, type,
        title: segments.map(s => `${s.marketingTransportName || ''} ${s.marketingTransportNo}`).join(' / '),
        price: price(type === 'flight' ? item.ticketPrice : item.price), jumpUrl: safeLink(item.jumpUrl),
        totalDurationMinutes: item.totalDuration ?? null,
        journeys: item.journeys.map(journey => ({
          journeyType: journey.journeyType || null,
          totalDurationMinutes: journey.totalDuration ?? null,
          segments: (journey.segments || []).map(s => ({
            transportNo: s.marketingTransportNo, carrier: s.marketingTransportName || null,
            departureStation: s.depStationName || null, arrivalStation: s.arrStationName || null,
            departureDateTime: s.depDateTime || null, arrivalDateTime: s.arrDateTime || null,
            departureTerminal: s.depTerm || null, arrivalTerminal: s.arrTerm || null,
            seatClass: s.seatClassName || null, durationMinutes: s.duration ?? null,
          })),
        })),
      }];
    }
    // Reject off-category payloads, rather than displaying hotel promotions as flights/tickets.
    if (type === 'hotel' && !item.shId) return [];
    if (type === 'poi' && (!item.name || !Object.hasOwn(item, 'ticketInfo'))) return [];
    const title = info.title || item.name;
    if (!title) return [];
    return [{ id: info.pk || item.shId || item.id || String(index), title,
      price: price(type === 'poi' ? item.ticketInfo?.price : info.price),
      description: type === 'poi' ? [item.ticketInfo?.ticketName, item.address].filter(Boolean).join(' · ') : item.address,
      star: info.star, jumpUrl: safeLink(info.jumpUrl || item.detailUrl) }];
  }).slice(0, 10);
}

/** Exactly one category-specific tool per request. Never fall back to hotel/fast search on failure. */
export async function searchFliggyTravel(input, { run = runFliggyCli, now = new Date() } = {}) {
  const request = resolveFliggyRequest(input, now);
  if (request.error) return { items: [], clarification: request.error };
  const { type, query } = request;
  let command, args;
  if (type === 'flight' || type === 'train') {
    command = type === 'flight' ? 'search-flight' : 'search-train';
    args = ['--origin', request.origin, '--destination', request.destination, '--dep-date', request.depDate];
    if (request.backDate) args.push('--back-date', request.backDate);
  } else if (type === 'hotel') {
    command = 'search-hotel'; args = ['--dest-name', request.destName, '--key-words', request.keywords];
    if (request.checkInDate) args.push('--check-in-date', request.checkInDate);
    if (request.checkOutDate) args.push('--check-out-date', request.checkOutDate);
  } else if (type === 'poi') {
    command = 'search-poi'; args = ['--city-name', request.cityName];
    if (request.keyword) args.push('--keyword', request.keyword);
  } else {
    command = 'ai-search'; args = ['--query', query];
  }
  const result = await run(command, args);
  if (result?.status !== 0 || !Array.isArray(result?.data?.itemList)) throw new Error('飞猪平台查询失败，未生成旅行报价');
  const criteria = Object.fromEntries(['type', 'origin', 'destination', 'depDate', 'backDate', 'destName', 'checkInDate', 'checkOutDate', 'cityName']
    .filter(key => request[key] !== undefined).map(key => [key, request[key]]));
  return { type, query, criteria, items: normalizeFliggyItems(result.data.itemList, type), observedAt: now.toISOString() };
}

export const fliggyFastSearch = async (query) => (await searchFliggyTravel({ query })).items;
export const fliggySearchHotels = async (input) => (await searchFliggyTravel({ ...input, query: input.keywords || `${input.destName || ''}酒店`, type: 'hotel' })).items;
export const fliggySearchPoi = async (input) => (await searchFliggyTravel({ ...input, query: `${input.cityName || ''}${input.keyword || ''}门票`, type: 'poi' })).items;
