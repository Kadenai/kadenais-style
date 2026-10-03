import { preferences, emptyLedger, addRequest, footerText } from './lib.js';

let ledger = emptyLedger();
let sessionId = '';
let usage = null;
let writes = Promise.resolve();

async function refresh($) {
  usage = await $.session.usage();
  $.ui.invalidate('ui.render');
}

async function loadSession($) {
  sessionId = await $.session.id();
  const saved = await $.store.get('cost:' + sessionId);
  ledger = saved && Array.isArray(saved.seen) && Number.isFinite(saved.usd) ? saved : emptyLedger();
  if (!saved) ledger.sinceActivation = (await $.session.turns()) > 0;
  await refresh($);
}

export function register(on, options = {}) {
  const prefs = preferences(options);

  on('session.start', async ($, e, next) => {
    await loadSession($);
    return next(e);
  });

  on('classic.SessionStart', { source: ['clear', 'resume', 'fork'] }, async ($, e, next) => {
    await loadSession($);
    return next(e);
  });

  on('prompt.submit', async ($, e, next) => {
    if (await $.session.id() !== sessionId) await loadSession($);
    return next(e);
  });

  on('session.measure', async ($, e, next) => {
    usage = { context: e.context, rateLimits: e.rateLimits, cost: e.cost };
    $.ui.invalidate('ui.render');
    return next(e);
  });

  on('turn.step', async function* ($, e, next) {
    // Keep a pending subagent response attached to its original conversation.
    const requestSessionId = await $.session.id();
    const result = yield* next(e);
    if (result.usage || result.stopReason) {
      const id = e.turnId + ':' + (e.agentId || 'main') + ':' + e.index;
      // Serialize concurrent completions and count requests, never turn totals.
      const tracking = writes.then(async () => {
        const saved = await $.store.get('cost:' + requestSessionId);
        const previous = requestSessionId === sessionId ? ledger
          : saved && Array.isArray(saved.seen) && Number.isFinite(saved.usd) ? saved : emptyLedger();
        const recorded = addRequest(previous, id, result.usage, '5m');
        await $.store.set('cost:' + requestSessionId, recorded);
        if (requestSessionId === sessionId) ledger = recorded;
        if (await $.session.id() === requestSessionId) await refresh($);
      });
      // Accounting failure must not break an otherwise successful model response.
      writes = tracking.catch(() => {});
      try { await tracking; } catch {
        if (requestSessionId === sessionId) {
          ledger = { ...ledger, sinceActivation: true };
          $.ui.invalidate('ui.render');
        }
      }
    }
    return result;
  });

  on('turn.complete', async ($, e, next) => {
    if (!e.agentId) await refresh($);
    return next(e);
  });

  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const text = footerText(usage, prefs, ledger);
    if (!text) return next(e);
    // Desktop ignores the native engine reference here. Draw actual text.
    const { Text } = $.ui.resolve(e);
    return Text({ children: [text] });
  });
}
