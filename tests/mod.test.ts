import { expect, mock, test } from 'claude-code/testing';

const ID = '11111111-1111-4111-8111-111111111111';
const CWD = 'C:\\Projects\\Demo';
const usage = { context: { percent: 42, tokens: 84000, window: 200000 },
  rateLimits: [{ kind: 'five_hour', percentUsed: 23 }, { kind: 'seven_day', percentUsed: 61 }], cost: { usd: 1.2345 } };
const pane = { plugin: 'kadenais-style', component: 'Pane', requestId: 'kadenais-style',
  viewport: { columns: 140, rows: 50, isFullscreen: true },
  props: { title: "Kadenai's Style", isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } } as const;
const footer = { plugin: 'kadenais-style', component: 'SessionMode', requestId: 'mode', props: { modes: ['Default'] } } as const;

function fixture(on, seed: Record<string, unknown> = {}) {
  const saved = new Map<string, unknown>(Object.entries(seed));
  const commands: string[] = [];
  mock.clock(on, { now: 1_791_046_800_000 });
  mock.env(on, { OS: 'Windows_NT' });
  on('store.get', ($, e) => ({ value: saved.get(e.key) }));
  on('store.set', ($, e) => { saved.set(e.key, e.value); return { value: undefined }; });
  on('store.keys', () => ({ value: [...saved.keys()] }));
  on('store.delete', ($, e) => { saved.delete(e.key); return { value: undefined }; });
  on('session.id', () => ({ value: ID }));
  on('session.cwd', () => ({ value: CWD }));
  on('session.turns', () => ({ value: 0 }));
  on('session.usage', () => ({ value: usage }));
  on('session.start', () => ({ cwd: CWD }));
  on('classic.SessionStart', () => ({}));
  on('command.register', ($, e) => { commands.push(e.name); return { value: { command: e.name } }; });
  on('ui.open', () => ({ value: { isPlaced: true } }));
  on('ui.close', () => ({ value: undefined }));
  on('ui.toast', () => ({ value: undefined }));
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['Claude mode retained'] }));
  on('session.measure', ($, e) => ({ changed: e.changed }));
  on('prompt.submit', ($, e) => ({ text: e.text }));
  on('turn.complete', () => ({ text: '' }));
  return { saved, commands };
}

test('registers commands and draws all four real measurements in the Desktop footer', async ($, on) => {
  const f = fixture(on);
  await $.session.start({ cwd: CWD, surface: 'desktop', isInteractive: true });
  expect(f.commands).toEqual(['kadenai', 'kadenai-recent', 'kadenai-new']);
  const ui = await $.ui.mount({ ...footer, surface: 'desktop' });
  expect(await ui.find({ type: 'Text', text: 'Claude mode retained' })).toBeDefined();
  expect(await ui.find({ type: 'Text', text: 'Contexto 42% · 84.0k/200.0k' })).toBeDefined();
  expect(await ui.find({ type: 'Text', text: 'Sessão 23%' })).toBeDefined();
  expect(await ui.find({ type: 'Text', text: 'Semana 61%' })).toBeDefined();
  expect(await ui.find({ type: 'Text', text: 'API ≈ US$ 1.2345' })).toBeDefined();
});

test('all switches persist and turn their indicator off in both surfaces', async ($, on) => {
  const f = fixture(on);
  await $.session.start({ cwd: CWD, surface: 'desktop', isInteractive: true });
  for (const surface of ['desktop', 'terminal'] as const) {
    const settings = await $.ui.mount({ ...pane, surface });
    const bar = await $.ui.mount({ ...footer, surface });
    for (const key of ['context', 'session', 'weekly', 'cost']) await settings.press({ key: 'toggle-' + key });
    const expected = surface === 'terminal';
    for (const key of ['context', 'session', 'weekly', 'cost']) expect(f.saved.get('pref:' + key)).toBe(expected);
    for (const text of [/^Contexto /, /^Sessão /, /^Semana /, /^API ≈ /]) {
      if (expected) expect(await bar.find({ type: 'Text', text })).toBeDefined();
      else expect(await bar.find({ type: 'Text', text })).toBeUndefined();
    }
    await settings.unmount(); await bar.unmount();
  }
});

test('restores persisted choices after clear and keeps buttons available when indicators are hidden', async ($, on) => {
  fixture(on, { 'pref:context': false, 'pref:session': false, 'pref:weekly': false, 'pref:cost': false });
  await $.classic.SessionStart({ source: 'clear' });
  const ui = await $.ui.mount({ ...footer, surface: 'desktop' });
  expect(await ui.find({ type: 'Text', text: /^Contexto / })).toBeUndefined();
  expect(await ui.find({ key: 'kadenai-settings' })).toBeDefined();
});

test('updates live quota measurements without inventing unavailable weekly data', async ($, on) => {
  fixture(on);
  await $.session.measure({ context: { window: 200000, percent: 90 }, rateLimits: [{ kind: 'five_hour', percentUsed: 99 }], changed: ['context', 'rateLimits'] });
  const ui = await $.ui.mount({ ...footer, surface: 'desktop' });
  expect(await ui.find({ type: 'Text', text: 'Semana —' })).toBeDefined();
  expect(await ui.find({ type: 'Text', text: 'Sessão 99%' })).toBeDefined();
  expect((await ui.find({ type: 'Text', text: 'Contexto 90%' })).props.color).toBe('red');
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
});

test('first prompt becomes a local title and later prompts do not overwrite it', async ($, on) => {
  const f = fixture(on);
  await $.session.start({ cwd: CWD, surface: 'desktop', isInteractive: true });
  await $.prompt.submit({ text: 'Planejar viagem' });
  await $.prompt.submit({ text: 'Segundo assunto' });
  expect((f.saved.get('recent:' + ID) as any).title).toBe('Planejar viagem');
});

test('project and chat tabs read shared recent items from other sessions', async ($, on) => {
  fixture(on, { 'recent:other': { id: 'other', cwd: 'C:\\Projects\\Second', title: 'Outra conversa', updatedAt: 10, projectless: false } });
  await $.session.start({ cwd: CWD, surface: 'desktop', isInteractive: true });
  const ui = await $.ui.mount({ ...pane, surface: 'desktop' });
  await ui.press({ key: 'tab-projects' });
  expect(await ui.find({ key: 'recent-other' })).toBeDefined();
  await ui.press({ key: 'tab-chats' });
  expect((await ui.find({ key: 'recent-other' })).props.label).toBe('Outra conversa');
});

test('projectless action prepares a folder and requests Desktop without sending a prompt', async ($, on) => {
  fixture(on);
  const calls: any[] = [];
  on('process.run', ($, e) => {
    calls.push(e);
    return { value: { exitCode: 0, stdout: e.argv[0] === 'powershell.exe' ? JSON.stringify({ path: 'C:\\Chats\\new' }) : 'Opened', stderr: '' } };
  });
  await $.command.run({ command: 'kadenai-new', args: '' });
  expect(calls.length).toBe(2);
  expect(calls[0].argv).toContain('-PrepareOnly');
  expect(calls[1].argv).toEqual(['claude', '--desktop']);
  expect(calls[1].init.cwd).toBe('C:\\Chats\\new');
});

test('launch failures are shown and never reported as success', async ($, on) => {
  const f = fixture(on);
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: 'Falha de teste' } }));
  await $.command.run({ command: 'kadenai-new', args: '' });
  const ui = await $.ui.mount({ ...pane, surface: 'desktop' });
  expect(await ui.find({ type: 'Text', text: 'Falha de teste' })).toBeDefined();
  expect(f.saved.has('recent:created')).toBe(false);
});
