import { expect, mock, test } from 'claude-code/testing';
import { register } from '../hooks/register.js';

const ID = '11111111-1111-4111-8111-111111111111';
const CWD = 'C:\\Projects\\Demo';
const usage = { context: { percent: 42, tokens: 84000, window: 200000 },
  rateLimits: [{ kind: 'five_hour', percentUsed: 23 }, { kind: 'seven_day', percentUsed: 61 }], cost: { usd: 1.2345 } };
const footer = { plugin: 'kadenais-style', component: 'SessionMode', requestId: 'mode', props: { modes: ['Default'] } } as const;

function fixture(on, seed: Record<string, unknown> = {}) {
  const saved = new Map<string, unknown>(Object.entries(seed));
  const identity = { id: ID };
  const commands: string[] = [];
  const renders: any[] = [];
  mock.clock(on, { now: 1_791_046_800_000 });
  on('store.get', ($, e) => ({ value: saved.get(e.key) }));
  on('store.set', ($, e) => { saved.set(e.key, e.value); return { value: undefined }; });
  on('session.id', () => ({ value: identity.id }));
  on('session.turns', () => ({ value: 0 }));
  on('session.usage', () => ({ value: usage }));
  on('session.start', () => ({ cwd: CWD }));
  on('classic.SessionStart', () => ({}));
  on('command.register', ($, e) => { commands.push(e.name); return { value: { command: e.name } }; });
  on('ui.render', ($, e) => {
    renders.push(e);
    // The engine reads modes. Do not substitute a constant tree that ignores props.
    return { type: 'Box', props: { flexDirection: 'row' }, children:
      e.props.modes.map(text => ({ type: 'Text', props: {}, children: [text] })) };
  });
  on('session.measure', ($, e) => ({ changed: e.changed }));
  on('prompt.submit', ($, e) => ({ text: e.text }));
  on('turn.complete', () => ({ text: '' }));
  return { saved, commands, renders, identity };
}

test('passes all four measurements to the native footer without plugin buttons', async ($, on) => {
  const f = fixture(on);
  await $.session.start({ cwd: CWD, surface: 'desktop', isInteractive: true });
  const ui = await $.ui.mount({ ...footer, surface: 'desktop' });
  for (const text of ['Default', 'Contexto 42%', 'Sessão 23%', 'Semana 61%', 'API ≈ US$ 1.2345'])
    expect(await ui.find({ type: 'Text', text })).toBeDefined();
  expect(await ui.find({ type: 'Button' })).toBeUndefined();
  expect(f.commands).toEqual([]);
  expect(f.renders[f.renders.length - 1].props.modes).toEqual(
    ['Default', 'Contexto 42%', 'Sessão 23%', 'Semana 61%', 'API ≈ US$ 1.2345']);
});

test('native configuration is used by the registered footer hook, without custom panels', async () => {
  for (let mask = 0; mask < 16; mask++) {
    const keys = ['context', 'session', 'weekly', 'cost'];
    const options = Object.fromEntries(keys.map((key, index) => [key, Boolean(mask & (1 << index))]));
    let render: any;
    const registrations: any[] = [];
    register((event, matcher, handler) => {
      registrations.push({ event, matcher });
      if (event === 'ui.render') render = handler;
    }, options);
    const input = { component: 'SessionMode', props: { modes: ['Default'] } };
    const result = await render({}, input, async e => e);
    const labels = ['Contexto —', 'Sessão —', 'Semana —', 'API ≈ —'];
    expect(result.props.modes).toEqual(['Default', ...labels.filter((label, index) => options[keys[index]])]);
    expect(input.props.modes).toEqual(['Default']);
    expect(registrations.filter(r => r.event === 'ui.render')).toEqual(
      [{ event: 'ui.render', matcher: { component: 'SessionMode' } }]);
    expect(registrations.some(r => r.event === 'command.run')).toBe(false);
  }
});

test('updates quota measurements and keeps unavailable data distinct from zero', async ($, on) => {
  fixture(on);
  await $.session.measure({ context: { window: 200000, percent: 90 }, rateLimits: [{ kind: 'five_hour', percentUsed: 99 }], changed: ['context', 'rateLimits'] });
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...footer, surface });
    for (const text of ['Contexto 90%', 'Sessão 99%', 'Semana —', 'API ≈ —'])
      expect(await ui.find({ type: 'Text', text })).toBeDefined();
    expect(await ui.find({ type: 'Button' })).toBeUndefined();
    await ui.unmount();
  }
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
