export const COLOR = '#212420';
export const TEXT_COLOR = COLOR;
export const FONT = "'Anthropic Sans','Segoe UI Variable','Segoe UI',Arial,sans-serif";
// Desktop maps this native theme key to --cds-surface-1, the transcript surface.
export const BAND_BACKGROUND = 'memoryBackgroundColor';

export function fontSize(value) {
  return Number.isFinite(value) ? Math.max(8, Math.min(20, Math.round(value))) : 10;
}

function xml(text) {
  return String(text).replace(/[&<>"']/g, char =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
}

// A single SVG keeps the text and icons equally small, independent of host fonts.
export function svgBar(items, size, icons, availableWidth = Infinity) {
  const font = fontSize(size);
  const icon = font + 4;
  const rowHeight = icon + 4;
  const gap = Math.round(font * 1.4);
  const maxWidth = Number.isFinite(availableWidth) && availableWidth > 0 ? availableWidth : Infinity;
  let x = 1, y = 0, width = 0;
  const groups = [];
  for (const item of items) {
    const textWidth = Math.ceil(item.text.length * font * 0.6);
    const itemWidth = icon + 4 + textWidth;
    if (x > 1 && x + gap + itemWidth + 1 > maxWidth) {
      x = 1;
      y += rowHeight + 3;
    }
    if (x > 1) {
      groups.push(`<path d="M${x + gap / 2} ${y + 5}v${rowHeight - 10}" stroke="${COLOR}" opacity=".3"/>`);
      x += gap;
    }
    const drawing = icons[item.key].replace(/<svg\b[^>]*>|<\/svg>/g, '');
    groups.push(`<g transform="translate(${x} ${y + 2}) scale(${icon / 24})" fill="none" stroke="${COLOR}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${drawing}</g>`);
    groups.push(`<text x="${x + icon + 4}" y="${y + rowHeight / 2}" dominant-baseline="central" fill="${TEXT_COLOR}">${xml(item.text)}</text>`);
    x += itemWidth;
    width = Math.max(width, x + 1);
  }
  const height = items.length ? y + rowHeight : 0;
  const alt = items.map(item => item.label + ': ' + item.text + (item.partial ? ' (estimativa parcial)' : '')).join('; ');
  const source = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="${COLOR}" font-family="${FONT}" font-size="${font}" font-weight="600"><title>${xml(alt)}</title>${groups.join('')}</svg>`;
  return { source, alt, width, height };
}
