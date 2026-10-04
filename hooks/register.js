import { emptyLedger, addRequest, indicators, footerText, FEATURES } from './lib.js';
import { BAND_BACKGROUND, TEXT_COLOR, svgBar } from './bar.js';
import { configuration, configurationKey, savedOptions, configCommand, settingText } from './config.js';

let ledger = emptyLedger();
let sessionId = '';
let usage = null;
let writes = Promise.resolve();
let countdown;

function startCountdown($, settings) {
  if (!settings.session) {
    countdown?.cancel();
    countdown = undefined;
  } else if (!countdown) {
    countdown = $.clock.every(60000, async () => {
      if (usage?.rateLimits?.some(window => window.kind === 'five_hour' && window.resetsAt))
        await updateDisplay($, settings);
    });
  }
}

async function updateDisplay($, settings) {
  // The native pinned line has room for labels; SessionMode is capped at 24ch.
  $.ui.status(settings.position === 'embaixo'
    ? footerText(usage, settings, await $.clock.now()) || undefined : undefined);
  $.ui.invalidate('ui.render');
}

async function refresh($, settings) {
  usage = await $.session.usage();
  await updateDisplay($, settings);
}

async function loadSession($, settings) {
  sessionId = await $.session.id();
  const saved = await $.store.get('cost:' + sessionId);
  ledger = saved && Array.isArray(saved.seen) && Number.isFinite(saved.usd) ? saved : emptyLedger();
  if (!saved) ledger.sinceActivation = (await $.session.turns()) > 0;
  await refresh($, settings);
}

async function registerCommand($) {
  await $.command.register({ name: 'kadenai-style', description: "Configure Kadenai's Style: posição, tamanho e indicadores.",
    argumentHint: '[acima | embaixo | tamanho N | indicador on/off]', immediate: true });
}

// In SDK/Desktop print sessions the engine's app state can omit plugin /config
// rows. Save the same native pluginConfigs option, rather than a second store.
async function saveOption($, id, key, value) {
  for (const source of ['policy', 'flag']) {
    const locked = savedOptions(await $.settings.read({ source }), id);
    if (locked[key] !== undefined) return { deny: 'Essa opção está definida por ' + source + '.' };
  }
  const configured = await $.env.get('CLAUDE_CONFIG_DIR');
  const homeDirectory = configured ? undefined : await $.env.get('USERPROFILE') || await $.env.get('HOME');
  const directory = configured || (homeDirectory && homeDirectory + '/.claude');
  if (!directory) return { deny: 'O Claude não informou o diretório das configurações.' };
  const path = directory.replace(/[\\/]$/, '') + '/settings.json';
  try {
    const original = await $.fs.exists(path) ? await $.fs.read(path) : '{}';
    const settings = JSON.parse(original);
    if (!settings || typeof settings !== 'object' || Array.isArray(settings))
      return { deny: 'O arquivo de configurações não contém um objeto JSON.' };
    const configs = settings.pluginConfigs || {};
    const entry = configs[id] || {};
    const updated = { ...settings, pluginConfigs: { ...configs,
      [id]: { ...entry, options: { ...entry.options, [key]: value } } } };
    // Refuse a stale merge if another mod/settings dialog wrote in the meantime.
    if (await $.fs.exists(path) && await $.fs.read(path) !== original)
      return { deny: 'As configurações mudaram durante a gravação. Tente novamente.' };
    await $.fs.write(path, JSON.stringify(updated, null, 2) + '\n');
    return { value };
  } catch {
    return { deny: 'Não foi possível ler ou salvar as configurações do Claude. O valor não foi alterado.' };
  }
}

// Prefer the native writer; both paths use the Plugins tab's saved options.
async function configure($, args, settings) {
  const rows = await $.config.list();
  const ownRows = rows.filter(row => row.key.startsWith('kadenais-style.'));
  const id = configurationKey($.plugin.root);
  const values = ownRows.length ? Object.fromEntries(ownRows
    .map(row => [row.key.slice('kadenais-style.'.length), row.value]))
    : savedOptions(await $.settings.read(), id);
  Object.assign(settings, configuration({ ...settings, ...values }));
  const command = configCommand(args, settings);
  if (command.text !== undefined) return command.text;
  const row = ownRows.find(row => row.key === 'kadenais-style.' + command.key);
  const result = row ? await $.config.set({ key: row.key, value: command.value })
    : await saveOption($, id, command.key, command.value);
  if (result.deny !== undefined) return 'Não foi possível alterar: ' + result.deny;
  settings[command.key] = result.value;
  return settingText(command.key, result.value) + '. Salvo nas configurações do plugin.';
}

export function register(on, options = {}) {
  const settings = configuration(options);
  let icons;

  on('session.start', async ($, e, next) => {
    await registerCommand($);
    await loadSession($, settings);
    startCountdown($, settings);
    return next(e);
  });

  on('classic.SessionStart', { source: ['clear', 'resume', 'fork'] }, async ($, e, next) => {
    await registerCommand($);
    await loadSession($, settings);
    startCountdown($, settings);
    return next(e);
  });

  on('prompt.submit', async ($, e, next) => {
    if (await $.session.id() !== sessionId) await loadSession($, settings);
    return next(e);
  });

  on('session.measure', async ($, e, next) => {
    usage = { context: e.context, rateLimits: e.rateLimits, cost: e.cost };
    await updateDisplay($, settings);
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
        if (await $.session.id() === requestSessionId) await refresh($, settings);
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
    if (!e.agentId) await refresh($, settings);
    return next(e);
  });

  on('command.run', { command: 'kadenai-style' }, async ($, e) => {
    const text = await configure($, e.args, settings);
    startCountdown($, settings);
    await updateDisplay($, settings);
    return { text };
  });

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (settings.position === 'embaixo') return next(e);
    const items = indicators(usage, settings, ledger, await $.clock.now());
    if (e.props.hasSurvey || !items.length) return next(e);
    const { Box, Text, Svg } = $.ui.resolve(e);
    let content;
    if (e.surface === 'desktop') {
      // Read only our four bundled icons, once per module load.
      icons ??= Promise.all(FEATURES.map(async key =>
        [key, await $.fs.read(`${$.plugin.root}/assets/${key}.svg`)])).then(Object.fromEntries);
      const drawing = svgBar(items, settings.size, await icons, e.props.bodyColumns * 8);
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
