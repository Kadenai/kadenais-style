import { expect, mock, test } from 'claude-code/testing';
import { register } from '../hooks/register.js';

const ID = '11111111-1111-4111-8111-111111111111';
const CWD = 'C:\\Projects\\Demo';
const usage = { context: { percent: 42, tokens: 84000, window: 200000 },
  rateLimits: [{ kind: 'five_hour', percentUsed: 23 }, { kind: 'seven_day', percentUsed: 61 }], cost: { usd: 1.2345 } };
const band = { plugin: 'kadenais-style', component: 'AbovePrompt', requestId: 'band',
  props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 6 }, view: {} } } as const;

function fixture(on, seed: Record<string, unknown> = {}) {
  const saved = new Map<string, unknown>(Object.entries(seed));
  const identity = { id: ID };
  const commands: string[] = [];
  const renders: any[] = [];
  const reads: string[] = [];
  const statuses: (string | undefined)[] = [];
  const config: Record<string, any> = { context: true, session: true, weekly: true, cost: true, size: 10, position: 'acima' };
  const configWrites: any[] = [];
  const denials: Record<string, string> = {};
  const nativeConfig = { available: true };
  const files = new Map<string, string>();
  const sources: Record<string, any> = { policy: {}, flag: {} };
  const clock = mock.clock(on, { now: 1_791_046_800_000 });
  on('store.get', ($, e) => ({ value: saved.get(e.key) }));
  on('store.set', ($, e) => { saved.set(e.key, e.value); return { value: undefined }; });
  on('session.id', () => ({ value: identity.id }));
  on('session.turns', () => ({ value: 0 }));
  on('session.usage', () => ({ value: usage }));
  on('session.start', () => ({ cwd: CWD }));
  on('classic.SessionStart', () => ({}));
  on('command.register', ($, e) => { commands.push(e.name); return { value: { command: e.name } }; });
  on('config.list', () => ({ value: (nativeConfig.available ? Object.entries(config) : []).map(([key, value]) => ({
    key: 'kadenais-style.' + key, label: key,
    kind: typeof value === 'boolean' ? 'boolean' : typeof value === 'number' ? 'number' : 'choice',
    value, ...(key === 'position' ? { options: ['acima', 'embaixo'] } : {}),
    provider: { plugin: 'kadenais-style', tier: 'append' }, isLocked: false
  })) }));
  on('config.set', ($, e) => {
    if (denials[e.key]) return { deny: denials[e.key] };
    configWrites.push({ key: e.key, value: e.value });
    config[e.key.slice('kadenais-style.'.length)] = e.value;
    return { value: e.value };
  });
  on('ui.status', ($, e) => { statuses.push(e.text); return { value: undefined }; });
  on('settings.read', ($, e) => ({ value: sources[e.source || 'effective'] || {} }));
  on('env.get', ($, e) => ({ value: e.name === 'CLAUDE_CONFIG_DIR' ? 'C:/isolated' : undefined }));
  on('fs.exists', ($, e) => ({ value: files.has(e.path.split(/[\\/]/).at(-1)) }));
  on('fs.write', ($, e) => { files.set(e.path.split(/[\\/]/).at(-1), e.text); return { value: undefined }; });
  on('fs.read', ($, e) => {
    reads.push(e.path);
    const path = e.path.split(/[\\/]/).at(-1);
    if (files.has(path)) return { value: files.get(path) };
    return { value: '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="8"/></svg>' };
  });
  on('ui.render', ($, e) => {
    renders.push(e);
    return e.component === 'AbovePrompt'
      ? { type: 'Text', props: {}, children: ['Other mod'] } : { type: 'engine', ref: 0 };
  });
  on('session.measure', ($, e) => ({ changed: e.changed }));
  on('prompt.submit', ($, e) => ({ text: e.text }));
  on('turn.complete', () => ({ text: '' }));
  return { saved, commands, renders, identity, reads, clock, statuses, config, configWrites, denials,
    nativeConfig, files, sources };
}

test('draws a tiny SVG above the input, preserves other mods and reads icons only once', async ($, on) => {
  const f = fixture(on);
  await $.session.start({ cwd: CWD, surface: 'desktop', isInteractive: true });
  const ui = await $.ui.mount({ ...band, surface: 'desktop' });
  const svg = await ui.find({ type: 'Svg' });
  expect(svg).toBeDefined();
  expect(svg.props.height).toBe(18);
  for (const value of ['84.000 tokens', '5h 23%', '7d 61%', '≈ US$ 1,23'])
    expect(svg.props.alt).toContain(value);
  expect(svg.props.source).toContain('#212420');
  expect(svg.props.source).toContain('font-size="10"');
  expect(await ui.find({ type: 'Text', text: 'Other mod' })).toBeDefined();
  expect(await ui.find({ type: 'Button' })).toBeUndefined();
  expect(f.commands).toEqual(['kadenai-style']);
  await ui.unmount();
  const again = await $.ui.mount({ ...band, surface: 'desktop' });
  expect(await again.find({ type: 'Svg' })).toBeDefined();
  expect(f.reads.length).toBe(4);
  expect(f.reads.every(path => /[\\/]assets[\\/](context|session|weekly|cost)\.svg$/.test(path))).toBe(true);
  await again.unmount();
  const footer = await $.ui.mount({ plugin: 'kadenais-style', component: 'SessionMode',
    requestId: 'mode', surface: 'desktop', props: { modes: ['Default'] } });
  expect(await footer.find({ type: 'Svg' })).toBeUndefined();
});

test('each native switch removes its own indicator without custom panels', async () => {
  for (let mask = 0; mask < 16; mask++) {
    const keys = ['context', 'session', 'weekly', 'cost'];
    const options = Object.fromEntries(keys.map((key, index) => [key, Boolean(mask & (1 << index))]));
    const size = 8 + Math.round(mask * 12 / 15);
    let render: any;
    const registrations: any[] = [];
    register((event, matcher, handler) => {
      registrations.push({ event, matcher });
      if (event === 'ui.render') render = handler;
    }, { ...options, size });
    const input = { component: 'AbovePrompt', surface: 'desktop', props: { hasSurvey: false, bodyColumns: 80 } };
    const element = type => ({ children = [], ...props }) => ({ type, props, children });
    const $ = { plugin: { root: 'plugin' }, fs: { read: async () => '<svg><path d="M0 0h24"/></svg>' },
      clock: { now: async () => 1_791_046_800_000 },
      ui: { resolve: () => ({ Text: element('Text'), Box: element('Box'), Svg: element('Svg') }) } };
    const other = { type: 'Text', props: {}, children: ['Other mod'] };
    let fallbacks = 0;
    const result = await render($, input, async () => { fallbacks++; return other; });
    if (mask) {
      expect(result.children[0]).toEqual(other);
      const svg = result.children[1].children[0].children[0];
      expect(svg.type).toBe('Svg');
      expect(svg.props.height).toBe(size + 8);
      expect(svg.props.source).toContain('font-size="' + size + '"');
      for (const [index, label] of ['Contexto:', 'Sessão (5 horas):', 'Semana:', 'Custo equivalente de API:'].entries())
        expect(svg.props.alt.includes(label)).toBe(options[keys[index]]);
    } else {
      expect(result).toEqual(other);
    }
    expect(fallbacks).toBe(1);
    expect(registrations.filter(r => r.event === 'ui.render')).toEqual(
      [{ event: 'ui.render', matcher: { component: 'AbovePrompt' } }]);
    expect(registrations.filter(r => r.event === 'command.run')).toEqual(
      [{ event: 'command.run', matcher: { command: 'kadenai-style' } }]);
  }
});

test('the command moves indicators below the prompt without hiding Fables or losing the upper settings', async ($, on) => {
  const f = fixture(on);
  await $.session.start({ cwd: CWD, surface: 'desktop', isInteractive: true });
  const status = await $.command.run({ command: 'kadenai-style' });
  expect(status.text).toContain('Posição: acima');
  expect(status.text).toContain('/kadenai-style acima | embaixo');
  expect(f.configWrites).toEqual([]);
  await $.command.run({ command: 'kadenai-style', args: 'embaixo' });
  await $.session.measure({ ...usage, rateLimits: [
    { kind: 'five_hour', percentUsed: 23, resetsAt: new Date(f.clock.now() + 134 * 60000).toISOString() }
  ], changed: ['rateLimits'] });
  expect(f.statuses.at(-1)).toBe('Contexto: 84.000 | Sessão: 23% (2h14min)');
  expect(f.configWrites).toEqual([{ key: 'kadenais-style.position', value: 'embaixo' }]);
  const ui = await $.ui.mount({ ...band, surface: 'desktop' });
  expect(await ui.find({ type: 'Svg' })).toBeUndefined();
  expect(await ui.find({ type: 'Text', text: 'Other mod' })).toBeDefined();
  expect(await ui.find({ type: 'Button' })).toBeUndefined();
  expect(f.reads).toEqual([]);
  await $.command.run({ command: 'kadenai-style', args: 'posição acima' });
  expect(f.statuses.at(-1)).toBeUndefined();
  expect((await ui.find({ type: 'Svg' })).props.alt).toContain('Custo equivalente de API');
  expect(f.config.weekly).toBe(true);
  expect(f.config.cost).toBe(true);
  await ui.unmount();
});

test('command switches and size share native configuration and use its latest values', async ($, on) => {
  const f = fixture(on);
  await $.session.start({ cwd: CWD, surface: 'desktop', isInteractive: true });
  const ui = await $.ui.mount({ ...band, surface: 'desktop' });
  await $.command.run({ command: 'kadenai-style', args: 'tamanho 16' });
  expect((await ui.find({ type: 'Svg' })).props.height).toBe(24);
  await $.command.run({ command: 'kadenai-style', args: 'semana off' });
  expect((await ui.find({ type: 'Svg' })).props.alt.includes('Semana:')).toBe(false);
  await $.command.run({ command: 'kadenai-style', args: 'custo alternar' });
  expect((await ui.find({ type: 'Svg' })).props.alt.includes('Custo equivalente')).toBe(false);
  // Simulate a value last changed in the native Plugins tab, rather than the command.
  f.config.context = false;
  await $.command.run({ command: 'kadenai-style', args: 'contexto' });
  expect(f.config.context).toBe(true);
  await $.command.run({ command: 'kadenai-style', args: 'sessão off' });
  expect((await ui.find({ type: 'Svg' })).props.alt.includes('Sessão')).toBe(false);
  expect(f.configWrites.map(row => row.key)).toEqual(['kadenais-style.size', 'kadenais-style.weekly',
    'kadenais-style.cost', 'kadenais-style.context', 'kadenais-style.session']);
  await ui.unmount();
});

test('invalid commands and refused native writes leave settings intact', async ($, on) => {
  const f = fixture(on);
  await $.session.start({ cwd: CWD, surface: 'desktop', isInteractive: true });
  for (const args of ['tamanho 7', 'tamanho 21', 'tamanho 10px', 'tamanho 10.5', 'posição centro',
    'contexto maybe', 'semana on extra', 'desconhecido', '__proto__', 'constructor']) {
    const result = await $.command.run({ command: 'kadenai-style', args });
    expect(result.text.includes('Salvo')).toBe(false);
  }
  expect(f.configWrites).toEqual([]);
  f.denials['kadenais-style.position'] = 'Blocked by policy';
  const denied = await $.command.run({ command: 'kadenai-style', args: 'embaixo' });
  expect(denied.text).toContain('Blocked by policy');
  expect(f.config.position).toBe('acima');
  expect(f.statuses.at(-1)).toBeUndefined();
  const ui = await $.ui.mount({ ...band, surface: 'desktop' });
  expect(await ui.find({ type: 'Svg' })).toBeDefined();
  await ui.unmount();
});

test('the footer countdown updates while idle, respects its switches and keeps unknown values honest', async ($, on) => {
  const f = fixture(on);
  await $.session.start({ cwd: CWD, surface: 'desktop', isInteractive: true });
  await $.command.run({ command: 'kadenai-style', args: 'embaixo' });
  await $.session.measure({ ...usage, rateLimits: [
    { kind: 'five_hour', percentUsed: 23, resetsAt: new Date(f.clock.now() + 134 * 60000).toISOString() }
  ], changed: ['rateLimits'] });
  await f.clock.advance(60000);
  expect(f.statuses.at(-1)).toBe('Contexto: 84.000 | Sessão: 23% (2h13min)');
  await $.command.run({ command: 'kadenai-style', args: 'contexto off' });
  expect(f.statuses.at(-1)).toBe('Sessão: 23% (2h13min)');
  await $.command.run({ command: 'kadenai-style', args: 'sessao off' });
  expect(f.statuses.at(-1)).toBeUndefined();
  const before = f.statuses.length;
  await f.clock.advance(60000);
  expect(f.statuses.length).toBe(before);
  await $.command.run({ command: 'kadenai-style', args: 'sessao on' });
  await f.clock.advance(60000);
  expect(f.statuses.at(-1)).toBe('Sessão: 23% (2h11min)');
  await $.session.measure({ context: {}, rateLimits: [], changed: ['context', 'rateLimits'] });
  await $.command.run({ command: 'kadenai-style', args: 'contexto on' });
  expect(f.statuses.at(-1)).toBe('Contexto: — | Sessão: —');
});

test('when Desktop omits config rows, the command preserves unrelated native settings and saves its own option', async ($, on) => {
  const f = fixture(on);
  f.nativeConfig.available = false;
  const original = { theme: 'light', env: { UNRELATED: 'keep' }, pluginConfigs: {
    other: { options: { setting: 'keep' } }, 'kadenais-style@inline': {
      mcpServers: { example: { enabled: false } }, options: { cost: false, size: 16 }
    }
  } };
  f.files.set('settings.json', JSON.stringify(original));
  f.sources.effective = original;
  await $.session.start({ cwd: CWD, surface: 'desktop', isInteractive: true });
  const result = await $.command.run({ command: 'kadenai-style', args: 'embaixo' });
  expect(result.text).toContain('Salvo');
  expect(JSON.parse(f.files.get('settings.json'))).toEqual({ ...original, pluginConfigs: {
    ...original.pluginConfigs, 'kadenais-style@inline': {
      ...original.pluginConfigs['kadenais-style@inline'], options: { cost: false, size: 16, position: 'embaixo' }
    }
  } });
  expect(f.statuses.at(-1)).toBe('Contexto: 84.000 | Sessão: 23%');
  expect(f.configWrites).toEqual([]);
});

test('the Desktop fallback refuses managed options and malformed settings files', async ($, on) => {
  const f = fixture(on);
  f.nativeConfig.available = false;
  await $.session.start({ cwd: CWD, surface: 'desktop', isInteractive: true });
  for (const source of ['policy', 'flag']) {
    f.sources[source] = { pluginConfigs: { 'kadenais-style': { options: { position: 'acima' } } } };
    const result = await $.command.run({ command: 'kadenai-style', args: 'embaixo' });
    expect(result.text).toContain(source);
    expect(f.files.size).toBe(0);
    f.sources[source] = {};
  }
  f.files.set('settings.json', '{invalid JSON');
  const invalid = await $.command.run({ command: 'kadenai-style', args: 'embaixo' });
  expect(invalid.text).toContain('Não foi possível');
  expect(f.files.get('settings.json')).toBe('{invalid JSON');
  expect(f.statuses.at(-1)).toBeUndefined();
});

test('the five-hour countdown redraws while idle and follows a new reset timestamp', async ($, on) => {
  const f = fixture(on);
  const invalidations: string[] = [];
  on('ui.invalidate', ($, e, next) => { invalidations.push(e.event); return next(e); });
  await $.session.start({ cwd: CWD, surface: 'desktop', isInteractive: true });
  await $.classic.SessionStart({ source: 'resume' });
  const measured = { ...usage, rateLimits: [
    { kind: 'five_hour', percentUsed: 23, resetsAt: new Date(f.clock.now() + 134 * 60000).toISOString() },
    { kind: 'seven_day', percentUsed: 61, resetsAt: new Date(f.clock.now() + 7 * 86400000).toISOString() }
  ], changed: ['rateLimits'] as const };
  await $.session.measure(measured);
  const ui = await $.ui.mount({ ...band, surface: 'desktop' });
  expect((await ui.find({ type: 'Svg' })).props.alt).toContain('5h 23% (2h 14min)');
  expect((await ui.find({ type: 'Svg' })).props.alt).toContain('Semana: 7d 61%;');
  invalidations.length = 0;
  await f.clock.advance(60000);
  expect(invalidations).toEqual(['ui.render']);
  expect((await ui.find({ type: 'Svg' })).props.alt).toContain('5h 23% (2h 13min)');
  await $.session.measure({ ...measured, rateLimits: [
    { kind: 'five_hour', percentUsed: 0, resetsAt: new Date(f.clock.now() + 60000).toISOString() }
  ] });
  expect((await ui.find({ type: 'Svg' })).props.alt).toContain('5h 0% (1min)');
  await f.clock.advance(60000);
  expect((await ui.find({ type: 'Svg' })).props.alt).toContain('5h 0% (0min)');
  await $.session.measure({ ...measured, rateLimits: [{ kind: 'five_hour', percentUsed: 5 }] });
  expect((await ui.find({ type: 'Svg' })).props.alt).toContain('Sessão (5 horas): 5h 5%;');
  await ui.unmount();
});

test('updates quota measurements and keeps unavailable data distinct from zero', async ($, on) => {
  fixture(on);
  await $.session.measure({ context: { window: 200000, percent: 90 }, rateLimits: [{ kind: 'five_hour', percentUsed: 99 }], changed: ['context', 'rateLimits'] });
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...band, surface });
    const expected = ['— tokens', '5h 99%', '7d —', '≈ US$ —'];
    if (surface === 'desktop') {
      const svg = await ui.find({ type: 'Svg' });
      expect(svg).toBeDefined();
      for (const value of expected) expect(svg.props.alt).toContain(value);
    } else {
      expect(await ui.find({ type: 'Text', text: expected.join(' · ') })).toBeDefined();
    }
    expect(await ui.find({ type: 'Button' })).toBeUndefined();
    await ui.unmount();
  }
});

test('yields the band to native surveys without loading icons', async ($, on) => {
  const f = fixture(on);
  const ui = await $.ui.mount({ ...band, surface: 'desktop', props: { ...band.props, hasSurvey: true } });
  expect(await ui.find({ type: 'Svg' })).toBeUndefined();
  expect(await ui.find({ type: 'Text', text: 'Other mod' })).toBeDefined();
  expect(f.reads).toEqual([]);
});

test('streaming stays intact and cost counts requests once, including subagents', async ($, on) => {
  const f = fixture(on);
  on('turn.step', async function* ($, e) {
    yield { kind: 'text', index: 0, text: 'hello' };
    return { turnId: e.turnId, index: e.index, answer: 'hello', toolUses: [], stopReason: 'end_turn',
      usage: { model: 'claude-opus-5-5', input_tokens: 1000, output_tokens: 100, cache_creation_input_tokens: 2000, cache_read_input_tokens: 5000 } };
  });
  await $.session.start({ cwd: CWD, surface: 'desktop', isInteractive: true });
  for (const agentId of [undefined, 'subagent', undefined]) {
    const stream = $.turn.step({ turnId: 'turn1', index: 0, model: 'claude-opus-5-5', messageCount: 1, ...(agentId ? { agentId } : {}) });
    const first = await stream.next();
    expect(first.value.text).toBe('hello');
    let end = await stream.next();
    while (!end.done) end = await stream.next();
    expect(end.value.answer).toBe('hello');
  }
  const ledger = f.saved.get('cost:' + ID) as any;
  expect(ledger.requests).toBe(2);
  expect(Number(ledger.usd.toFixed(6))).toBe(0.034);
  expect([...f.saved.keys()].some(key => key.startsWith('recent:') || key.startsWith('pref:'))).toBe(false);
});

test('a response finishing after a session switch is charged to its original conversation', async ($, on) => {
  const f = fixture(on);
  on('turn.step', async function* ($, e) {
    yield { kind: 'text', index: 0, text: 'old response' };
    f.identity.id = '22222222-2222-4222-8222-222222222222';
    return { turnId: e.turnId, index: e.index, answer: 'old response', toolUses: [], stopReason: 'end_turn',
      usage: { model: 'claude-opus-5-5', input_tokens: 1000, output_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } };
  });
  await $.session.start({ cwd: CWD, surface: 'desktop', isInteractive: true });
  const stream = $.turn.step({ turnId: 'old-turn', index: 0, model: 'claude-opus-5-5', messageCount: 1 });
  let item = await stream.next();
  while (!item.done) item = await stream.next();
  expect((f.saved.get('cost:' + ID) as any).requests).toBe(1);
  expect(f.saved.has('cost:' + f.identity.id)).toBe(false);
});

test('resuming a conversation restores its cost without recording prompt titles or recent chats', async ($, on) => {
  const f = fixture(on, { ['cost:' + ID]: { usd: 2.5, requests: 1, unpriced: 0, seen: ['old'], models: {}, sinceActivation: false } });
  await $.classic.SessionStart({ source: 'resume' });
  await $.prompt.submit({ text: 'A private message' });
  expect((f.saved.get('cost:' + ID) as any).usd).toBe(2.5);
  expect([...f.saved.keys()]).toEqual(['cost:' + ID]);
});
