import { expect, test } from 'claude-code/testing';
import { fontSize, svgBar } from '../hooks/bar.js';
import { indicators, DEFAULTS, emptyLedger } from '../hooks/lib.js';

const icons = Object.fromEntries(['context', 'session', 'weekly', 'cost'].map(key =>
  [key, '<svg><circle cx="12" cy="12" r="8"/></svg>']));
const items = indicators({ context: { tokens: 84000, window: 200000 },
  rateLimits: [{ kind: 'five_hour', percentUsed: 3 }, { kind: 'seven_day', percentUsed: 66 }],
  cost: { usd: 0.41 } }, DEFAULTS, emptyLedger());

test('defaults to an 18px row and scales icons and spacing with the configured type size', () => {
  const tiny = svgBar(items, undefined, icons);
  const larger = svgBar(items, 20, icons);
  expect(tiny.height).toBe(18);
  expect(tiny.width < 360).toBe(true);
  expect(larger.height).toBe(28);
  expect(larger.width > tiny.width).toBe(true);
  expect(larger.alt).toBe(tiny.alt);
  for (const value of [undefined, '20', NaN, Infinity]) expect(fontSize(value)).toBe(10);
  expect(fontSize(1)).toBe(8);
  expect(fontSize(100)).toBe(20);
});

test('wraps a narrow band without shrinking or dropping measurements', () => {
  const drawing = svgBar(items, 10, icons, 180);
  expect(drawing.width <= 180).toBe(true);
  expect(drawing.height > 18).toBe(true);
  for (const value of ['84.000 tokens', '5h 3%', '7d 66%', '≈ US$ 0,41'])
    expect(drawing.alt).toContain(value);
  expect(drawing.source).toContain('font-size="10"');
});

test('escapes sub-cent prices as text inside valid SVG markup', () => {
  const small = indicators({ cost: { usd: 0.000001 } }, { ...DEFAULTS, context: false, session: false, weekly: false }, emptyLedger());
  const drawing = svgBar(small, 10, icons);
  expect(drawing.source).toContain('US$ &lt;0,01');
  expect(drawing.source.includes('US$ <0,01')).toBe(false);
  expect(drawing.alt).toContain('US$ <0,01');
});
