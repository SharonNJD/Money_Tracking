// Hand-rolled SVG charts: a column chart for spending over time and a donut for the category split.
// Colors come from CSS custom properties so light/dark mode swap in one place (see css/app.css).
import { svg } from './dom.js';

export function niceScale(maxValue, ticks = 4) {
  if (!(maxValue > 0)) return { max: ticks * 2500, step: 2500 };
  const raw = maxValue / ticks;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / magnitude;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * magnitude;
  return { max: Math.ceil(maxValue / step - 1e-9) * step, step };
}

// Rounded 4px data-end, square at the baseline.
function barPath(x, yTop, w, yBase) {
  const height = yBase - yTop;
  if (height <= 0) return '';
  const r = Math.min(4, w / 2, height);
  return `M${x},${yBase}V${yTop + r}A${r},${r} 0 0 1 ${x + r},${yTop}H${x + w - r}A${r},${r} 0 0 1 ${x + w},${yTop + r}V${yBase}Z`;
}

/**
 * Column chart, one series. Tapping a column selects it (the readout lives above the chart).
 * data: [{ label, tickLabel, cents }] oldest → newest.
 */
export function columnChart({ data, width, height = 200, color, selected, onSelect, budgetCents, formatValue, formatTick, ariaLabel }) {
  const maxValue = Math.max(0, ...data.map((d) => d.cents), budgetCents ?? 0);
  const { max: yMax, step } = niceScale(maxValue);
  const ticks = [];
  for (let v = 0; v <= yMax + 1e-6; v += step) ticks.push(v);

  const longestTick = Math.max(...ticks.map((v) => formatTick(v).length));
  const m = { top: 24, right: 4, bottom: 24, left: Math.min(64, 10 + longestTick * 6.6) };
  const plotW = Math.max(width - m.left - m.right, 40);
  const plotH = height - m.top - m.bottom;
  const baseY = m.top + plotH;
  const y = (v) => baseY - (v / yMax) * plotH;
  const band = plotW / data.length;
  const barW = Math.min(24, band * 0.6);

  const root = svg('svg', {
    class: 'chart-svg',
    width,
    height,
    viewBox: `0 0 ${width} ${height}`,
    role: 'group',
    'aria-label': ariaLabel,
  });

  for (const v of ticks) {
    const ty = Math.round(y(v)) + 0.5;
    if (v > 0) root.append(svg('line', { class: 'chart-grid', x1: m.left, x2: width - m.right, y1: ty, y2: ty }));
    root.append(svg('text', { class: 'chart-tick', x: m.left - 8, y: ty, 'text-anchor': 'end', 'dominant-baseline': 'middle' }, formatTick(v)));
  }

  const maxIndex = data.reduce((best, d, i) => (d.cents > data[best].cents ? i : best), 0);
  const labelEvery = Math.max(1, Math.ceil(40 / band));
  // Every n-th label counting back from the newest, plus the selected one (neighbours make room for it).
  const showLabel = (i) => i === selected || ((data.length - 1 - i) % labelEvery === 0 && Math.abs(i - selected) >= labelEvery);

  data.forEach((d, i) => {
    const cx = m.left + band * i + band / 2;
    const x = cx - barW / 2;
    const isSelected = i === selected;
    if (d.cents > 0) {
      const top = Math.min(y(d.cents), baseY - 2); // keep tiny amounts visible
      root.append(svg('path', { class: ['chart-bar', isSelected ? 'is-selected' : 'is-muted'], d: barPath(x, top, barW, baseY), fill: color }));
    }
    const showValue = d.cents > 0 && (isSelected || (i === maxIndex && Math.abs(i - selected) > 1));
    if (showValue) {
      root.append(svg('text', { class: ['chart-value', isSelected && 'is-selected'], x: cx, y: y(d.cents) - 7, 'text-anchor': 'middle' }, formatValue(d.cents)));
    }
    if (showLabel(i)) {
      root.append(svg('text', { class: ['chart-xlabel', isSelected && 'is-selected'], x: cx, y: height - 6, 'text-anchor': 'middle' }, d.tickLabel));
    }
  });

  root.append(svg('line', { class: 'chart-axis', x1: m.left, x2: width - m.right, y1: baseY + 0.5, y2: baseY + 0.5 }));

  if (budgetCents > 0) {
    const by = Math.round(y(budgetCents)) + 0.5;
    root.append(svg('line', { class: 'chart-budget', x1: m.left, x2: width - m.right, y1: by, y2: by }));
    root.append(svg('text', { class: 'chart-budget-label', x: m.left + 4, y: by - 5 }, `Budget ${formatTick(budgetCents)}`));
  }

  // Hit targets: the whole column band, axis labels included.
  data.forEach((d, i) => {
    root.append(
      svg('rect', {
        class: 'chart-hit',
        x: m.left + band * i,
        y: 0,
        width: band,
        height,
        tabindex: 0,
        role: 'button',
        'aria-pressed': String(i === selected),
        'aria-label': `${d.label}: ${formatValue(d.cents)}`,
        onclick: () => onSelect(i),
        onkeydown: (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(i);
          }
        },
      }),
    );
  });

  return root;
}

/**
 * Donut for part-to-whole. segments: [{ key, label, cents, color }], at most six.
 * A 2px surface gap separates segments.
 */
export function donutChart({ segments, size = 172, thickness = 24, centerValue, centerLabel, onSelect, ariaLabel }) {
  const r = (size - thickness) / 2;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  const total = segments.reduce((sum, s) => sum + s.cents, 0);
  const root = svg('svg', { class: 'donut', width: size, height: size, viewBox: `0 0 ${size} ${size}`, role: 'img', 'aria-label': ariaLabel });

  root.append(svg('circle', { class: 'donut-track', cx: c, cy: c, r, 'stroke-width': thickness }));
  const gap = segments.length > 1 ? 2 : 0;
  let offset = 0;
  for (const seg of segments) {
    const length = total ? (seg.cents / total) * circumference : 0;
    const dash = Math.max(length - gap, 0.75);
    root.append(
      svg('circle', {
        class: 'donut-seg',
        cx: c,
        cy: c,
        r,
        stroke: seg.color,
        'stroke-width': thickness,
        'stroke-dasharray': `${dash} ${circumference - dash}`,
        'stroke-dashoffset': -offset,
        transform: `rotate(-90 ${c} ${c})`,
        onclick: onSelect ? () => onSelect(seg.key) : null,
      }),
    );
    offset += length;
  }

  root.append(svg('text', { class: 'donut-value', x: c, y: c - 2, 'text-anchor': 'middle' }, centerValue));
  root.append(svg('text', { class: 'donut-label', x: c, y: c + 17, 'text-anchor': 'middle' }, centerLabel));
  return root;
}
