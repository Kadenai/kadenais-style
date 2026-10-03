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
  mock.clock(on, { now: 1_791_046_800_000 });
  on('store.get', ($, e) => ({ value: saved.get(e.key) }));
  on('store.set', ($, e) => { saved.set(e.key, e.value); return { value: undefined }; });
  on('session.id', () => ({ value: identity.id }));
  on('session.turns', () => ({ value: 0 }));
  on('session.usage', () => ({ value: usage }));
  on('session.start', () => ({ cwd: CWD }));
  on('classic.SessionStart', () => ({}));
  on('command.register', ($, e) => { commands.push(e.name); return { value: { command: e.name } }; });
  on('fs.read', ($, e) => {
    reads.push(e.path);
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
  return { saved, commands, renders, identity, reads };
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
  expect(svg.props.source).toContain('#dd7654');
  expect(svg.props.source).toContain('font-size="10"');
  expect(await ui.find({ type: 'Text', text: 'Other mod' })).toBeDefined();
  expect(await ui.find({ type: 'Button' })).toBeUndefined();
  expect(f.commands).toEqual([]);
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
      ui: { resolve: () => ({ Text: element('Text'), Box: element('Box'), Svg: element('Svg') }) } };
    const other = { type: 'Text', props: {}, children: ['Other mod'] };
    let fallbacks = 0;
    const result = await render($, input, async () => { fallbacks++; return other; });
    if (mask) {
      expect(result.children[0].children[0]).toEqual(other);
      const svg = result.children[0].children[1];
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
    expect(registrations.some(r => r.event === 'command.run')).toBe(false);
  }
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
