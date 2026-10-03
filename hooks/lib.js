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

export function tokenCount(value) {
  return Number.isFinite(value) && value >= 0
    ? Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '—';
}

export function resetCountdown(resetsAt, now) {
  if (typeof resetsAt !== 'string' || !Number.isFinite(now)) return null;
  const reset = Date.parse(resetsAt);
  if (!Number.isFinite(reset)) return null;
  // Round up: a window with a few seconds remaining has not reset yet.
  const totalMinutes = Math.max(0, Math.ceil((reset - now) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? hours + 'h' + (minutes ? ' ' + minutes + 'min' : '') : minutes + 'min';
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

export function indicators(usage, prefs, ledger, now) {
  const result = [];
  const context = usage?.context ?? {};
  if (prefs.context) result.push({ key: 'context', label: 'Contexto', value: context.tokens, text:
    tokenCount(context.tokens) + ' tokens' });
  for (const [key, kind, label, short] of [['session', 'five_hour', 'Sessão (5 horas)', '5h'], ['weekly', 'seven_day', 'Semana', '7d']]) {
    if (!prefs[key]) continue;
    const window = usage?.rateLimits?.find(w => w.kind === kind);
    const remaining = key === 'session' ? resetCountdown(window?.resetsAt, now) : null;
    result.push({ key, label, value: window?.percentUsed,
      text: short + ' ' + percent(window?.percentUsed) + (remaining === null ? '' : ' (' + remaining + ')') });
  }
  if (prefs.cost) {
    const cost = costInfo(usage, ledger);
    const amount = cost.usd === null ? '—' : cost.usd > 0 && cost.usd < 0.01
      ? '<0,01' : cost.usd.toFixed(2).replace('.', ',');
    result.push({ key: 'cost', label: 'Custo equivalente de API', value: cost.usd, partial: cost.partial,
      text: '≈ US$ ' + amount + (cost.partial ? '*' : '') });
  }
  return result;
}
