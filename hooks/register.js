import { FEATURES, LABELS, DEFAULTS, PANE, safeText, emptyLedger, addRequest, costInfo,
  indicators, projectList, isProjectless, folderName } from './lib.js';
import { PRICE_DATE, PRICE_SOURCE } from './prices.js';

let tab = 'settings';
let ledger = emptyLedger();
let sessionId = '';
let metadata = null;
let usage = null;
let errorMessage = '';
let writes = Promise.resolve();

async function preferences($) {
  const prefs = { ...DEFAULTS };
  for (const feature of FEATURES) {
    const saved = await $.store.get('pref:' + feature);
    if (typeof saved === 'boolean') prefs[feature] = saved;
  }
  return prefs;
}

async function refresh($) {
  usage = await $.session.usage();
  $.ui.invalidate('ui.render');
}

async function recentItems($) {
  const keys = (await $.store.keys()).filter(k => k.startsWith('recent:'));
  const rows = [];
  for (const key of keys) {
    const row = await $.store.get(key);
    if (row && typeof row.cwd === 'string' && typeof row.id === 'string' && Number.isFinite(row.updatedAt)) rows.push(row);
  }
  return rows.sort((a, b) => b.updatedAt - a.updatedAt);
}

async function remember($, title) {
  const now = await $.clock.now();
  const cwd = await $.session.cwd();
  metadata = { id: sessionId, cwd, title: safeText(title || metadata?.title || folderName(cwd), 100),
    projectless: isProjectless(cwd), updatedAt: now, hasPrompt: metadata?.hasPrompt ?? false };
  await $.store.set('recent:' + sessionId, metadata);
}

async function loadSession($, title) {
  sessionId = await $.session.id();
  const saved = await $.store.get('cost:' + sessionId);
  ledger = saved && Array.isArray(saved.seen) && Number.isFinite(saved.usd) ? saved : emptyLedger();
  if (!saved) ledger.sinceActivation = (await $.session.turns()) > 0;
  metadata = await $.store.get('recent:' + sessionId) ?? null;
  await remember($, title);
  await refresh($);
}

async function openPane($, selected) {
  tab = selected;
  await $.ui.open({ id: PANE, title: "Kadenai's Style", focus: true, closeOnEscape: true, columns: 52 });
  $.ui.invalidate('ui.render');
}

async function notifyError($, error) {
  errorMessage = safeText(error?.message || error, 220);
  $.ui.invalidate('ui.render');
  await $.ui.toast('Não foi possível concluir: ' + errorMessage);
}

async function newChat($) {
  errorMessage = '';
  try {
    if ((await $.env.get('OS')) !== 'Windows_NT') throw new Error('O iniciador de chats sem projeto desta versão requer Windows.');
    const script = $.plugin.root + '/scripts/new-chat.ps1';
    const prepared = await $.process.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-File', script, '-PrepareOnly']);
    if (prepared.exitCode !== 0) throw new Error(prepared.stderr || prepared.stdout || 'Falha ao preparar a pasta.');
    const data = JSON.parse(prepared.stdout.trim());
    if (typeof data.path !== 'string') throw new Error('O iniciador não retornou a pasta da conversa.');
    await launchDesktop($, data.path);
  } catch (error) { await notifyError($, error); }
}

async function launchDesktop($, cwd, id) {
  const args = ['claude', '--desktop'];
  if (id) args.push('--resume', id);
  const out = await $.process.run(args, { cwd, timeoutMs: 30000 });
  if (out.exitCode !== 0) throw new Error(out.stderr || out.stdout || 'Claude Desktop não abriu a conversa.');
  await $.ui.toast(id ? 'Conversa solicitada no Desktop.' : 'Nova conversa solicitada no Desktop.');
}

function colored(value) {
  return Number.isFinite(value) && value >= 90 ? 'red' : Number.isFinite(value) && value >= 70 ? 'yellow' : 'cyan';
}

function indicatorRow($, e, prefs, now) {
  const { Box, Text, Button } = $.ui.resolve(e);
  return Box({ flexDirection: 'row', flexWrap: 'wrap', gap: 2, children: [
    ...indicators(usage, prefs, ledger, now).map(i => Text({ color: colored(i.value), children: i.text })),
    Button({ key: 'kadenai-settings', label: '⚙ Style', plain: true, onPress: () => openPane($, 'settings') }),
    Button({ key: 'kadenai-recents', label: 'Recentes', plain: true, onPress: () => openPane($, 'projects') }),
    Button({ key: 'kadenai-new-chat', label: '+ Chat livre', plain: true, onPress: () => newChat($) }),
  ] });
}

function switchRow($, e, feature, enabled) {
  const { Box, Text, Button } = $.ui.resolve(e);
  // The mods element table has no native Switch. Use a labeled two-state button.
  const control = Button({ key: 'toggle-' + feature, label: enabled ? '●━ ON' : 'OFF ━○',
    onPress: async () => {
      const current = await preferences($);
      await $.store.set('pref:' + feature, !current[feature]);
      $.ui.invalidate('ui.render');
    } });
  return Box({ flexDirection: 'row', justifyContent: 'space-between', gap: 2,
    children: [Text({ children: LABELS[feature] }), control] });
}

async function settingsPanel($, e, prefs) {
  const { Box, Text, Button, Link } = $.ui.resolve(e);
  const cost = costInfo(usage, ledger);
  const ttl = (await $.store.get('pref:cacheTTL')) === '1h' ? '1h' : '5m';
  return Box({ flexDirection: 'column', gap: 1, children: [
    Text({ bold: true, children: 'Sua barra, do seu jeito.' }),
    ...FEATURES.map(feature => switchRow($, e, feature, prefs[feature])),
    Text({ dimColor: true, children: 'As preferências são salvas para as próximas conversas.' }),
    Text({ children: 'Sessão = janela de 5 horas da conta; semana = cota semanal. “—” significa que o Claude ainda não informou o dado.' }),
    Text({ bold: true, children: 'Quanto esta conversa teria custado?' }),
    Text({ children: 'Fonte: ' + cost.source + '. ' + (cost.partial ? 'Total parcial desde a ativação ou com modelos sem preço.' : 'Estimativa em USD; não é uma cobrança da assinatura.') }),
    Text({ children: 'Preferimos o total do Claude Code, que inclui histórico e modalidades de cobrança. Sem esse total, somamos cada resposta por modelo, entrada, saída e cache.' }),
    Text({ dimColor: true, children: 'Tabela de reserva: ' + PRICE_DATE + ', API padrão/global. Não inclui Fast mode, ferramentas pagas no servidor, impostos ou tarifas de terceiros.' }),
    Button({ key: 'cache-ttl', label: 'Cache da estimativa de reserva: ' + ttl,
      onPress: async () => {
        await $.store.set('pref:cacheTTL', ttl === '5m' ? '1h' : '5m');
        $.ui.invalidate('ui.render');
      } }),
    Text({ dimColor: true, children: 'O TTL vale para respostas futuras na estimativa de reserva; a API de mods não informa o TTL por resposta.' }),
    Link({ href: PRICE_SOURCE, label: 'Preços oficiais da API' }),
    Button({ key: 'refresh', label: 'Atualizar indicadores', onPress: () => refresh($) }),
  ] });
}

async function recentsPanel($, e, projects) {
  const { Box, Text, Button } = $.ui.resolve(e);
  const all = await recentItems($);
  const rows = (projects ? projectList(all) : all).slice(0, 30);
  return Box({ flexDirection: 'column', gap: 1, children: [
    Button({ key: 'new-chat-panel', label: '+ Nova conversa sem projeto', onPress: () => newChat($) }),
    Text({ dimColor: true, children: 'Histórico local das conversas em que este mod esteve ativo. A sidebar principal do Desktop não é editável pela API.' }),
    ...(rows.length ? rows.map(row => Box({ flexDirection: 'column', children: [
      Button({ key: 'recent-' + row.id, label: safeText(projects ? folderName(row.cwd) : row.title, 80),
        onPress: async () => {
          try {
            // Reopening a project opens its folder. Reopening a chat resumes its id.
            if (!projects && row.id === await $.session.id()) { await $.ui.close(PANE); return; }
            await launchDesktop($, row.cwd, projects ? undefined : row.id);
          } catch (error) { await notifyError($, error); }
        } }),
      Text({ dimColor: true, children: safeText(row.projectless ? 'Conversa sem projeto' : row.cwd, 200) }),
    ] })) : [Text({ children: 'Seus recentes aparecerão aqui conforme você usar o mod.' })]),
  ] });
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    await loadSession($);
    await $.command.register({ name: 'kadenai', description: "Configurar Kadenai's Style", immediate: true });
    await $.command.register({ name: 'kadenai-recent', description: 'Abrir projetos e conversas recentes', immediate: true });
    await $.command.register({ name: 'kadenai-new', description: 'Nova conversa sem projeto no Desktop', immediate: true });
    return next(e);
  });

  on('classic.SessionStart', { source: ['clear', 'resume', 'fork'] }, async ($, e, next) => {
    await loadSession($, e.session_title);
    return next(e);
  });

  on('prompt.submit', async ($, e, next) => {
    // Keep only a short local title. No transcript or prompt is uploaded anywhere.
    const id = await $.session.id();
    if (id !== sessionId) await loadSession($);
    if (!metadata?.hasPrompt) {
      await remember($, e.text);
      metadata.hasPrompt = true;
      await $.store.set('recent:' + sessionId, metadata);
    } else await remember($);
    return next(e);
  });

  on('session.measure', async ($, e, next) => {
    usage = { context: e.context, rateLimits: e.rateLimits, cost: e.cost };
    $.ui.invalidate('ui.render');
    return next(e);
  });

  on('turn.step', async function* ($, e, next) {
    // Bind accounting to the request's conversation, even if a host switches
    // sessions before a pending subagent response finishes.
    const requestSessionId = await $.session.id();
    const result = yield* next(e);
    if (result.usage || result.stopReason) {
      // Serialize concurrent subagent completions; account at request level,
      // never add turn.complete totals (which would double-count tool loops).
      const id = e.turnId + ':' + (e.agentId || 'main') + ':' + e.index;
      const tracking = writes.then(async () => {
        const saved = await $.store.get('cost:' + requestSessionId);
        const previous = requestSessionId === sessionId ? ledger
          : saved && Array.isArray(saved.seen) && Number.isFinite(saved.usd) ? saved : emptyLedger();
        const ttl = (await $.store.get('pref:cacheTTL')) === '1h' ? '1h' : '5m';
        const recorded = addRequest(previous, id, result.usage, ttl);
        await $.store.set('cost:' + requestSessionId, recorded);
        if (requestSessionId === sessionId) ledger = recorded;
        if (await $.session.id() === requestSessionId) await refresh($);
      });
      writes = tracking.catch(() => {});
      try { await tracking; } catch (error) { errorMessage = 'Falha ao registrar estimativa: ' + safeText(error?.message, 120); }
    }
    return result;
  });

  on('turn.complete', async ($, e, next) => {
    if (!e.agentId) { await remember($); await refresh($); }
    return next(e);
  });

  // SessionMode is the documented footer site on Desktop and terminal.
  // Preserve Claude's mode controls once, then append our configurable row.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const original = await next(e);
    const prefs = await preferences($);
    const now = await $.clock.now();
    const { Box } = $.ui.resolve(e);
    return Box({ flexDirection: 'column', gap: 1, children: [original, indicatorRow($, e, prefs, now)] });
  });

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e);
    const prefs = await preferences($);
    return Box({ flexDirection: 'column', gap: 1, paddingX: 1, children: [
      Text({ bold: true, color: 'cyan', children: "Kadenai's Style" }),
      Box({ flexDirection: 'row', flexWrap: 'wrap', gap: 1, children:
        [['settings', 'Indicadores'], ['projects', 'Projetos'], ['chats', 'Conversas']].map(([name, label]) =>
          Button({ key: 'tab-' + name, label: (tab === name ? '● ' : '') + label,
            onPress: () => { tab = name; $.ui.invalidate('ui.render'); } })) }),
      errorMessage ? Text({ color: 'red', children: errorMessage }) : null,
      tab === 'settings' ? await settingsPanel($, e, prefs) : await recentsPanel($, e, tab === 'projects'),
    ].filter(Boolean) });
  });

  on('command.run', { command: 'kadenai' }, async ($) => { await openPane($, 'settings'); return {}; });
  on('command.run', { command: 'kadenai-recent' }, async ($) => { await openPane($, 'projects'); return {}; });
  on('command.run', { command: 'kadenai-new' }, async ($) => { await newChat($); return {}; });
}
