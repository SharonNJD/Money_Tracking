// App state, persisted to localStorage on this device only.
import { defaultState, normalizeState, todayISO } from './logic.js';

const KEY = 'money-tracker:v1';
const listeners = new Set();
let state = null;
let onSaveError = () => {};

export function init({ currency, onError }) {
  onSaveError = onError ?? onSaveError;
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    /* storage blocked: run in memory */
  }
  if (raw) {
    try {
      state = normalizeState(JSON.parse(raw));
    } catch (err) {
      console.error('Saved data could not be read; keeping a copy and starting fresh.', err);
      try {
        localStorage.setItem(`${KEY}:unreadable:${Date.now()}`, raw);
      } catch {
        /* nothing more we can do */
      }
    }
  }
  state ??= defaultState({ today: todayISO(), currency });
  return state;
}

export function get() {
  return state;
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    // Ask iOS/Safari not to evict our data under storage pressure.
    navigator.storage?.persist?.().catch(() => {});
  } catch (err) {
    onSaveError(err);
  }
}

function emit() {
  for (const fn of listeners) fn(state);
}

export function update(mutate) {
  mutate(state);
  persist();
  emit();
}

export function replace(next) {
  state = next;
  persist();
  emit();
}

// Re-render without changing data (view-only state such as filters changed).
export function refresh() {
  emit();
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function category(id) {
  return state.categories.find((c) => c.id === id);
}

export function activeCategories() {
  return state.categories.filter((c) => !c.archived);
}
