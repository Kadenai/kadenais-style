import { preferences, emptyLedger, addRequest, indicators, FEATURES } from './lib.js';
import { BAND_BACKGROUND, TEXT_COLOR, fontSize, svgBar } from './bar.js';

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
  const size = fontSize(options.size);
  let icons;

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

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const items = indicators(usage, prefs, ledger);
    if (e.props.hasSurvey || !items.length) return next(e);
    const { Box, Text, Svg } = $.ui.resolve(e);
    let content;
    if (e.surface === 'desktop') {
      // Read only our four bundled icons, once per module load.
      icons ??= Promise.all(FEATURES.map(async key =>
        [key, await $.fs.read(`${$.plugin.root}/assets/${key}.svg`)])).then(Object.fromEntries);
      const drawing = svgBar(items, size, await icons, e.props.bodyColumns * 8);
      content = Svg(drawing);
    } else {
      content = Text({ color: TEXT_COLOR, children: [items.map(item => item.text).join(' · ')] });
    }
    // Keep other mods in the shared band; our tiny row stays closest to the input.
    const inherited = await next(e);
    if (e.surface !== 'desktop')
      return Box({ flexDirection: 'column', alignItems: 'center', children: [inherited, content].filter(Boolean) });
    // The native band paints gray behind its padding. Cover that padding inside
    // our render region with the transcript's own color, in light and dark mode.
    const band = Box({ flexDirection: 'column', alignItems: 'stretch', justifyContent: 'center', minHeight: 1,
      width: '100%', backgroundColor: BAND_BACKGROUND, children: [
        Box({ flexDirection: 'column', alignItems: 'center',
          marginX: -2, marginY: -2, paddingX: 2, paddingY: 2,
          backgroundColor: BAND_BACKGROUND, children: [content] })
      ] });
    // Production validation rejects minHeight above a native engine reference.
    // Keep next(e) beside our styled row, outside its custom styling.
    return Box({ flexDirection: 'column', alignItems: 'stretch', children: [inherited, band].filter(Boolean) });
  });
}
