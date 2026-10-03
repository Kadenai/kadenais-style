import { requestCost } from './prices.js';

export const FEATURES = ['context', 'session', 'weekly', 'cost'];
export const DEFAULTS = { context: true, session: true, weekly: true, cost: true };

export function preferences(options = {}) {
  return Object.fromEntries(FEATURES.map(key => [key,
    typeof options[key] === 'boolean' ? options[key] : DEFAULTS[key]]));
}

export function safeText(text, max = 160) {
  return String(text ?? '').replace(/[\x00-\x1f\x7f-\x9f]/g, ' ').slice(0, max);
}

export function percent(value) {
  return Number.isFinite(value) ? value.toFixed(value % 1 ? 1 : 0) + '%' : '—';
}

export function emptyLedger() {
  return { usd: 0, requests: 0, unpriced: 0, seen: [], models: {}, sinceActivation: false };
}

export function addRequest(ledger, id, usage, cacheTTL) {
  if (ledger.seen.includes(id)) return ledger;
  const cost = requestCost(usage, cacheTTL);
  const model = safeText(usage?.model || 'contagem indisponível', 100);
  const models = { ...ledger.models };
  models[model] = (models[model] ?? 0) + (cost ?? 0);
  return {
    ...ledger,
    usd: ledger.usd + (cost ?? 0),
    requests: ledger.requests + 1,
    unpriced: ledger.unpriced + (cost === null ? 1 : 0),
    seen: [...ledger.seen, id].slice(-512),
    models,
  };
}

export function costInfo(usage, ledger) {
  const usd = usage?.cost?.usd;
  // Claude Code's own ledger includes earlier turns, actual cache TTL and Fast mode.
  if (Number.isFinite(usd) && usd >= 0 && (usd > 0 || ledger.requests === 0)) {
    return { usd, source: 'Claude Code', partial: false };
  }
  if (ledger.requests === 0) return { usd: null, source: 'aguardando dados', partial: false };
  if (ledger.unpriced === ledger.requests) return { usd: null, source: 'contagem ou preço indisponível', partial: true };
  return { usd: ledger.usd, source: 'tabela oficial', partial: ledger.sinceActivation || ledger.unpriced > 0 };
}

export function indicators(usage, prefs, ledger) {
  const result = [];
  const context = usage?.context ?? {};
  if (prefs.context) result.push({ key: 'context', value: context.percent, text:
    'Contexto ' + percent(context.percent) });
  for (const [key, kind, label] of [['session', 'five_hour', 'Sessão'], ['weekly', 'seven_day', 'Semana']]) {
    if (!prefs[key]) continue;
    const window = usage?.rateLimits?.find(w => w.kind === kind);
    result.push({ key, value: window?.percentUsed, text: label + ' ' + percent(window?.percentUsed) });
  }
  if (prefs.cost) {
    const cost = costInfo(usage, ledger);
    result.push({ key: 'cost', value: cost.usd, partial: cost.partial,
      text: 'API ≈ ' + (cost.usd === null ? '—' : 'US$ ' + cost.usd.toFixed(4)) + (cost.partial ? ' (parcial)' : '') });
  }
  return result;
}

function compactUsd(usd, width) {
  if (usd === null) return '$—';
  if (usd === 0) return '$0';
  const candidates = [2, 1].map(decimals => '$' + usd.toFixed(decimals))
    .filter(text => Number(text.slice(1)) > 0);
  if (usd < 1) candidates.push(usd < 0.01 ? '<1¢' : Math.round(usd * 100) + '¢');
  if (Math.round(usd) > 0) candidates.push('$' + usd.toFixed(0));
  for (const [unit, scale] of [['k', 1e3], ['M', 1e6], ['B', 1e9], ['T', 1e12]]) {
    if (usd >= scale) for (const decimals of [1, 0])
      candidates.push('$' + (usd / scale).toFixed(decimals) + unit);
  }
  candidates.push('$' + usd.toExponential(0).replace('e+', 'e'));
  return candidates.find(text => text.length <= width) || candidates[candidates.length - 1];
}

export function footerText(usage, prefs, ledger) {
  const items = indicators(usage, prefs, ledger);
  const labels = { context: 'C', session: '5h', weekly: '7d' };
  const parts = items.filter(item => item.key !== 'cost').map(item =>
    labels[item.key] + (Number.isFinite(item.value) ? Math.round(item.value) + '%' : '—'));
  const cost = items.find(item => item.key === 'cost');
  if (cost) {
    const mark = cost.partial ? '*' : '';
    // This Desktop draws SessionMode in one line, capped at 24ch.
    const width = 24 - parts.join(' ').length - (parts.length ? 1 : 0) - mark.length;
    const price = compactUsd(cost.value, width);
    // The currency sign is already a separator when one more cell is needed.
    if (price.length > width && parts.length)
      return parts.join(' ') + compactUsd(cost.value, width + 1) + mark;
    parts.push(price + mark);
  }
  return parts.join(' ');
}
