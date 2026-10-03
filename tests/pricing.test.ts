import { expect, test } from 'claude-code/testing';
import { modelPrice, requestCost } from '../hooks/prices.js';
import { addRequest, emptyLedger, costInfo, indicators, DEFAULTS, projectList, resetText } from '../hooks/lib.js';

const response = { model: 'claude-opus-5-5-20260901', input_tokens: 1000, output_tokens: 100,
  cache_creation_input_tokens: 2000, cache_read_input_tokens: 5000 };

test('prices disjoint input, output and cache categories, including Opus 5.5 cache discount', () => {
  expect(Number(requestCost(response).toFixed(6))).toBe(0.017);
  expect(Number(requestCost(response, '1h').toFixed(6))).toBe(0.023);
});

test('dated ids map to the exact generation and unknown models are not guessed', () => {
  expect(modelPrice('claude-opus-5-5-20260901')).toEqual([4, 20, 5, 8, 0.2]);
  expect(modelPrice('claude-opus-5')).toEqual([5, 25, 6.25, 10, 0.5]);
  expect(modelPrice('opus')).toBe(null);
  expect(modelPrice('claude-opus-5-9')).toBe(null);
  expect(requestCost({ ...response, input_tokens: -1 })).toBe(null);
});

test('deduplicates responses across reloads and tracks unknown models as partial', () => {
  const once = addRequest(emptyLedger(), 'request1', response, '5m');
  const twice = addRequest(once, 'request1', response, '5m');
  expect(twice.requests).toBe(1);
  const mixed = addRequest(twice, 'request2', { ...response, model: 'unlisted-model' }, '5m');
  expect(costInfo({}, mixed).partial).toBe(true);
  expect(mixed.unpriced).toBe(1);
  const missing = addRequest(once, 'request3', null, '5m');
  expect(costInfo({}, missing).partial).toBe(true);
  expect(missing.unpriced).toBe(1);
});

test('prefers the engine ledger so resumed history and actual billing modes count', () => {
  const ledger = addRequest(emptyLedger(), 'request1', response, '5m');
  expect(costInfo({ cost: { usd: 12.3 } }, ledger)).toEqual({ usd: 12.3, source: 'Claude Code', partial: false });
  expect(costInfo({}, emptyLedger()).usd).toBe(null);
});

test('distinguishes unavailable measurements from genuine zero use and honors each switch', () => {
  const unavailable = indicators({}, DEFAULTS, emptyLedger(), 0);
  expect(unavailable[0].text).toBe('Contexto —');
  const known = indicators({ context: { percent: 0, tokens: 0, window: 200000 }, rateLimits: [{ kind: 'five_hour', percentUsed: 0 }] }, DEFAULTS, emptyLedger(), 0);
  expect(known[0].text).toBe('Contexto 0% · 0/200.0k');
  expect(known[1].text).toBe('Sessão 0%');
  expect(indicators({}, { context: false, session: false, weekly: false, cost: false }, emptyLedger(), 0)).toEqual([]);
});

test('deduplicates Windows projects by path and excludes projectless chats', () => {
  const rows = [
    { cwd: 'C:\\Projects\\Demo', updatedAt: 1 },
    { cwd: 'c:/projects/demo', updatedAt: 2 },
    { cwd: 'C:\\Chats\\one', projectless: true, updatedAt: 3 },
  ];
  expect(projectList(rows)).toEqual([rows[1]]);
  expect(resetText('invalid', 0)).toBe('');
  expect(resetText('1970-01-01T01:05:00Z', 0)).toBe(' · renova em 1h 5m');
});
