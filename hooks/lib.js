import { requestCost } from './prices.js';

export const FEATURES = ['context', 'session', 'weekly', 'cost'];
export const LABELS = { context: 'Contexto', session: 'Sessão (5 h)', weekly: 'Semana', cost: 'Custo equivalente de API' };
export const DEFAULTS = { context: true, session: true, weekly: true, cost: true };
export const PANE = 'kadenais-style';

export function safeText(text, max = 160) {
  return String(text ?? '').replace(/[\x00-\x1f\x7f-\x9f]/g, ' ').slice(0, max);
}

export function compactNumber(value) {
  if (!Number.isFinite(value)) return '—';
  return value >= 1_000_000 ? (value / 1_000_000).toFixed(1) + 'M'
    : value >= 1000 ? (value / 1000).toFixed(1) + 'k' : String(Math.round(value));
}

export function percent(value) {
  return Number.isFinite(value) ? value.toFixed(value % 1 ? 1 : 0) + '%' : '—';
}

export function resetText(iso, now) {
  if (!iso || !Number.isFinite(now)) return '';
  const date = Date.parse(iso);
  if (!Number.isFinite(date)) return '';
  const minutes = Math.ceil((date - now) / 60000);
  if (minutes <= 0) return ' · aguardando atualização';
  if (minutes >= 1440) return ' · renova em ' + Math.floor(minutes / 1440) + 'd ' + Math.floor(minutes % 1440 / 60) + 'h';
  if (minutes >= 60) return ' · renova em ' + Math.floor(minutes / 60) + 'h ' + (minutes % 60) + 'm';
  return ' · renova em ' + minutes + 'm';
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
  if (prefs.context) result.push({ key: 'context', value: context.percent, text:
    'Contexto ' + percent(context.percent) + (Number.isFinite(context.tokens) ? ' · ' + compactNumber(context.tokens) + '/' + compactNumber(context.window) : '') });
  for (const [key, kind, label] of [['session', 'five_hour', 'Sessão'], ['weekly', 'seven_day', 'Semana']]) {
    if (!prefs[key]) continue;
    const window = usage?.rateLimits?.find(w => w.kind === kind);
    result.push({ key, value: window?.percentUsed, text: label + ' ' + percent(window?.percentUsed) + resetText(window?.resetsAt, now) });
  }
  if (prefs.cost) {
    const cost = costInfo(usage, ledger);
    result.push({ key: 'cost', text: 'API ≈ ' + (cost.usd === null ? '—' : 'US$ ' + cost.usd.toFixed(4)) + (cost.partial ? ' (parcial)' : '') });
  }
  return result;
}

export function projectList(recents) {
  const sorted = [...recents].sort((a, b) => b.updatedAt - a.updatedAt);
  const seen = new Set();
  return sorted.filter(r => {
    if (r.projectless || !r.cwd) return false;
    const key = /^[A-Za-z]:/.test(r.cwd) ? r.cwd.replace(/\\/g, '/').toLowerCase() : r.cwd;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function isProjectless(cwd) {
  return /[\\/]Kadenai Chats[\\/][^\\/]+$/i.test(cwd);
}

export function folderName(cwd) {
  return safeText(cwd.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || cwd, 80);
}
