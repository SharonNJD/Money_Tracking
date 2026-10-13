import { h } from '../dom.js';

export function topbar(title, action = null) {
  return h('header', { class: 'topbar' }, h('h1', { class: 'topbar-title' }, title), action);
}

// Usable chart width: the content column minus gutters and card padding.
export function chartWidth() {
  const column = Math.min(document.documentElement.clientWidth, 640);
  return Math.max(260, Math.floor(column - 32 - 32));
}
