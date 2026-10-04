import { preferences } from './lib.js';
import { fontSize } from './bar.js';

export function configuration(options = {}) {
  return { ...preferences(options), size: fontSize(options.size),
    position: options.position === 'embaixo' ? 'embaixo' : 'acima' };
}

export function configurationKey(root) {
  const cache = root.match(/[\\/]plugins[\\/]cache[\\/]([^\\/]+)[\\/]kadenais-style[\\/]/);
  return 'kadenais-style@' + (cache ? cache[1] : 'inline');
}

export function savedOptions(settings, id) {
  return { ...settings.pluginConfigs?.['kadenais-style']?.options, ...settings.pluginConfigs?.[id]?.options };
}

const fields = { contexto: 'context', context: 'context', sessao: 'session', session: 'session',
  semana: 'weekly', weekly: 'weekly', custo: 'cost', cost: 'cost',
  tamanho: 'size', size: 'size', posicao: 'position', position: 'position' };
const labels = { context: 'Contexto', session: 'Sessão', weekly: 'Semana', cost: 'Custo',
  size: 'Tamanho', position: 'Posição' };
const help = [
  '/kadenai-style acima | embaixo',
  '/kadenai-style tamanho 8–20',
  '/kadenai-style contexto | sessao | semana | custo [on | off | alternar]',
  'Sem on/off, o indicador alterna. Semana, custo e tamanho aplicam-se à faixa acima.'
].join('\n');

function normalized(value) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function settingText(key, value) {
  return labels[key] + ': ' + (typeof value === 'boolean' ? value ? 'ligado' : 'desligado'
    : key === 'size' ? value + ' px (faixa acima)' : value);
}

export function configCommand(args = '', current) {
  const words = normalized(args.trim()).split(/\s+/).filter(Boolean);
  if (!words.length || words.length === 1 && ['ajuda', 'help', 'status', 'config'].includes(words[0]))
    return { text: Object.entries(current).map(([key, value]) => settingText(key, value)).join('\n') + '\n\n' + help };
  if (words.length === 1 && ['acima', 'embaixo'].includes(words[0])) words.unshift('posicao');
  const key = Object.hasOwn(fields, words[0]) ? fields[words[0]] : undefined;
  if (!key || words.length > 2) return { text: 'Comando inválido.\n' + help };
  const input = words[1];
  let value;
  if (key === 'position') {
    if (!['acima', 'embaixo'].includes(input)) return { text: 'Posição: use acima ou embaixo.\n' + help };
    value = input;
  } else if (key === 'size') {
    if (!/^\d+$/.test(input || '') || Number(input) < 8 || Number(input) > 20)
      return { text: 'Tamanho: use um número inteiro entre 8 e 20.' };
    value = Number(input);
  } else {
    if (!input || ['alternar', 'toggle'].includes(input)) value = !current[key];
    else if (['on', 'ligar', 'ligado', 'true'].includes(input)) value = true;
    else if (['off', 'desligar', 'desligado', 'false'].includes(input)) value = false;
    else return { text: 'Use on, off ou alternar.\n' + help };
  }
  return { key, value };
}
