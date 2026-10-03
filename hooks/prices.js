// USD per million tokens. Snapshot checked against Anthropic on 2026-10-03.
// Explicit prices: Opus 5.5 cache hits are 0.05x, not the usual 0.1x.
export const PRICE_SOURCE = 'https://platform.claude.com/docs/en/about-claude/pricing';
export const PRICE_DATE = '2026-10-03';
export const PRICES = {
  'claude-opus-5-5': [4, 20, 5, 8, 0.2],
  'claude-opus-5': [5, 25, 6.25, 10, 0.5],
  'claude-opus-4-8': [5, 25, 6.25, 10, 0.5],
  'claude-opus-4-7': [5, 25, 6.25, 10, 0.5],
  'claude-opus-4-6': [5, 25, 6.25, 10, 0.5],
  'claude-opus-4-5': [5, 25, 6.25, 10, 0.5],
  'claude-opus-4-1': [15, 75, 18.75, 30, 1.5],
  'claude-opus-4': [15, 75, 18.75, 30, 1.5],
  'claude-sonnet-5-5': [2, 10, 2.5, 4, 0.2],
  'claude-sonnet-5': [2, 10, 2.5, 4, 0.2],
  'claude-sonnet-4-6': [3, 15, 3.75, 6, 0.3],
  'claude-sonnet-4-5': [3, 15, 3.75, 6, 0.3],
  'claude-sonnet-4': [3, 15, 3.75, 6, 0.3],
  'claude-haiku-4-5': [1, 5, 1.25, 2, 0.1],
  'claude-haiku-3-5': [0.8, 4, 1, 1.6, 0.08],
  'claude-fable-5-1': [10, 50, 12.5, 20, 0.25],
  'claude-fable-5': [10, 50, 12.5, 20, 1],
  'claude-mythos-5-1': [10, 50, 12.5, 20, 0.25],
  'claude-mythos-5': [10, 50, 12.5, 20, 1],
};

export function modelPrice(model) {
  if (typeof model !== 'string') return null;
  const id = model.toLowerCase().replace(/\./g, '-');
  // Match an exact id or its dated release, never guess an alias like "opus".
  const key = Object.keys(PRICES).sort((a, b) => b.length - a.length)
    .find(k => id === k || new RegExp('^' + k + '-\\d{8}$').test(id));
  return key ? PRICES[key] : null;
}

export function requestCost(usage, cacheTTL = '5m') {
  const p = modelPrice(usage?.model);
  if (!p) return null;
  const names = ['input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens'];
  if (names.some(k => !Number.isFinite(usage[k]) || usage[k] < 0)) return null;
  // These are disjoint counts in the Anthropic API; do not subtract cache tokens.
  return (usage.input_tokens * p[0] + usage.output_tokens * p[1]
    + usage.cache_creation_input_tokens * p[cacheTTL === '1h' ? 3 : 2]
    + usage.cache_read_input_tokens * p[4]) / 1_000_000;
}
