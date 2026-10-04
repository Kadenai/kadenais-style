import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// No model requests: exercise the same ui_render control request as Desktop.
// A ui.mount test alone does not apply the production engine-reference rules.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const parent = realpathSync(tmpdir());
const scratch = mkdtempSync(path.join(parent, 'kadenais-style-render-'));
const engine = process.env.CLAUDE_CODE_EXECUTABLE || 'claude';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function render(plugin, label, options = {}, commandArgs) {
  const config = path.join(scratch, label + '-config');
  const debug = path.join(scratch, label + '.log');
  const mcp = path.join(scratch, 'empty-mcp.json');
  mkdirSync(config);
  writeFileSync(path.join(config, 'settings.json'), JSON.stringify({
    pluginConfigs: { 'kadenais-style': { options } }
  }));
  writeFileSync(mcp, JSON.stringify({ mcpServers: {} }));
  const child = spawn(engine, ['--print', '--input-format', 'stream-json', '--output-format', 'stream-json',
    '--verbose', '--no-session-persistence',
    ...(Array.isArray(plugin) ? plugin : [plugin]).flatMap(root => ['--plugin-dir', root]),
    '--strict-mcp-config', '--mcp-config', mcp, '--debug-file', debug],
    { cwd: config, env: { ...process.env, CLAUDE_CONFIG_DIR: config }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let buffer = '', errors = '';
  const messages = [];
  const pending = new Map();
  const fail = error => { for (const waiter of pending.values()) waiter.reject(error); pending.clear(); };
  child.on('error', fail);
  child.on('close', code => fail(new Error(`Engine exited (${code}): ${errors.slice(-1500)}`)));
  child.stderr.on('data', data => { errors += data; });
  child.stdout.on('data', data => {
    buffer += data;
    while (buffer.includes('\n')) {
      const end = buffer.indexOf('\n');
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      let message;
      try { message = JSON.parse(line); } catch { continue; }
      messages.push(message);
      const id = message.response?.request_id;
      if (message.type === 'control_response' && pending.has(id)) {
        pending.get(id).resolve(message.response);
        pending.delete(id);
      }
      if (message.type === 'result' && pending.has('command')) {
        pending.get('command').resolve(message);
        pending.delete('command');
      }
    }
  });
  async function request(id, input) {
    let timer;
    try {
      const reply = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
      child.stdin.write(JSON.stringify({ type: 'control_request', request_id: id, request: input }) + '\n');
      return await Promise.race([reply, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Rendering request timed out: ' + id)), 30000);
      })]);
    } finally { clearTimeout(timer); pending.delete(id); }
  }
  try {
    const initialized = await request('initialize', { subtype: 'initialize' });
    assert.equal(initialized.subtype, 'success', initialized.error);
    await delay(600); // session.start can finish after the initialize response.
    if (commandArgs !== undefined) {
      let timer;
      try {
        const completion = new Promise((resolve, reject) => pending.set('command', { resolve, reject }));
        child.stdin.write(JSON.stringify({ type: 'user', message: {
          role: 'user', content: '/kadenai-style ' + commandArgs
        } }) + '\n');
        await Promise.race([completion, new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('Local command timed out')), 15000);
        })]);
      } finally { clearTimeout(timer); pending.delete('command'); }
    }
    const drawn = await request('band', { subtype: 'ui_render', surface: 'desktop',
      component: 'AbovePrompt', instance_id: 'regression-test', viewport: { columns: 100, rows: 30 },
      props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 80,
        scroll: { offset: 0, bodyRows: 6 }, view: {} } });
    assert.equal(drawn.subtype, 'success', drawn.error);
    await delay(600); // Let the debug sink flush the production validation verdict.
    return { ...drawn.response, messages, initialized: initialized.response,
      settings: JSON.parse(readFileSync(path.join(config, 'settings.json'), 'utf8')),
      log: readFileSync(debug, 'utf8') };
  } finally {
    child.stdin.end();
    child.kill();
    await delay(200);
  }
}

function nodes(tree) {
  if (!tree || typeof tree === 'string') return [];
  return [tree, ...(tree.children || []).flatMap(nodes)];
}

try {
  const bad = path.join(scratch, 'rejected');
  mkdirSync(path.join(bad, '.claude-plugin'), { recursive: true });
  mkdirSync(path.join(bad, 'hooks'));
  writeFileSync(path.join(bad, '.claude-plugin/plugin.json'), JSON.stringify({ name: 'render-regression', version: '1.0.0' }));
  writeFileSync(path.join(bad, 'hooks/hooks.json'), JSON.stringify({ modules: ['./register.js'] }));
  writeFileSync(path.join(bad, 'hooks/register.js'), `export function register(on) {
    on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
      const { Box, Text } = $.ui.resolve(e);
      return Box({ minHeight: 1, children: [await next(e), Text({ children: ['test'] })] });
    });
  }`);
  const rejected = await render(bad, 'rejected');
  assert.equal(rejected.tree.type, 'engine');
  assert.equal(rejected.rewritten, false);
  assert.match(rejected.log, /engine node under a Box with prop "minHeight"/);
  console.log('PASS: production validation catches the 0.3.1 regression.');

  const plugin = path.join(scratch, 'plugin');
  mkdirSync(path.join(plugin, '.claude-plugin'), { recursive: true });
  cpSync(path.join(repo, '.claude-plugin/plugin.json'), path.join(plugin, '.claude-plugin/plugin.json'));
  cpSync(path.join(repo, 'hooks'), path.join(plugin, 'hooks'), { recursive: true });
  mkdirSync(path.join(plugin, 'assets'));
  for (const name of ['context', 'session', 'weekly', 'cost'])
    cpSync(path.join(repo, 'assets', name + '.svg'), path.join(plugin, 'assets', name + '.svg'));
  const accepted = await render(plugin, 'accepted');
  const elements = nodes(accepted.tree);
  assert.equal(accepted.rewritten, true);
  assert.equal(accepted.tree.type, 'Box');
  assert.equal(elements.filter(node => node.type === 'engine').length, 1);
  assert.equal(elements.filter(node => node.type === 'Svg').length, 1);
  assert.equal(elements.some(node => node.type === 'Button'), false);
  const svg = elements.find(node => node.type === 'Svg');
  assert.equal(svg.props.height, 18);
  assert.match(svg.props.source, /font-weight="600"/);
  assert.doesNotMatch(accepted.log, /ui.render \(AbovePrompt\): a hook returned a tree that does not validate/);
  console.log('PASS: real Desktop protocol accepts the band and preserves its native drawing.');

  const footer = await render(plugin, 'footer', { position: 'embaixo' });
  assert.equal(nodes(footer.tree).some(node => node.type === 'Svg' || node.type === 'Button'), false);
  assert.equal(footer.tree.type, 'engine');
  assert.ok(footer.messages.some(message => JSON.stringify(message).includes('Contexto: — | Sessão: —')),
    'The engine must send the pinned footer text to Desktop.');
  assert.doesNotMatch(footer.log, /hook was skipped|a hook returned a tree that does not validate/);
  assert.ok(footer.initialized.commands.some(command => command.name === 'kadenai-style'),
    'The slash command must be registered with the native engine.');
  console.log('PASS: real Desktop protocol publishes the text footer and registers /kadenai-style.');

  const commanded = await render(plugin, 'commanded', {}, 'embaixo');
  assert.ok(commanded.messages.some(message => JSON.stringify(message).includes('Posição: embaixo. Salvo')),
    'The command must execute through the native dispatcher. ' + JSON.stringify({
      commands: commanded.initialized.commands.filter(command => command.name.includes('kadenai')),
      messages: commanded.messages.filter(message => message.subtype === 'ui_status'),
      hooks: commanded.log.split('\n').filter(line => /skipped|command.run|command-probe|config.set/.test(line)).slice(-20)
    }));
  assert.ok(Object.values(commanded.settings.pluginConfigs).some(config => config.options?.position === 'embaixo'),
    'The native writer must persist the selected position.');
  assert.equal(commanded.tree.type, 'engine');
  assert.ok(commanded.messages.some(message => message.type === 'result'
    && message.num_turns === 0 && message.duration_api_ms === 0), 'The command must not call a model.');
  assert.doesNotMatch(commanded.log, /hook was skipped|a hook returned a tree that does not validate/);
  console.log('PASS: /kadenai-style writes native settings and immediately switches the rendering.');
} finally {
  // Remove only our own freshly created directory in the resolved temp folder.
  const target = realpathSync(scratch);
  assert.equal(path.dirname(target), parent);
  assert.ok(path.basename(target).startsWith('kadenais-style-render-'));
  rmSync(target, { recursive: true, force: true });
}
