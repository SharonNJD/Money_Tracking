// Choosing a category and (optionally) its type: big chips for forms, one grouped list for compact rows.
import * as store from './store.js';
import { h } from './dom.js';

export function findType(category, typeId) {
  return typeId ? category?.types.find((t) => t.id === typeId) ?? null : null;
}

// "☕ Coffee" if there's a type, otherwise "🍽️ Eating out".
export function itemLabel(categoryId, typeId) {
  const c = store.category(categoryId);
  if (!c) return 'Unknown';
  const t = findType(c, typeId);
  return t ? `${t.emoji} ${t.name}` : `${c.emoji} ${c.name}`;
}

const encode = (categoryId, typeId) => `${categoryId}|${typeId ?? ''}`;
const decode = (value) => {
  const [categoryId, typeId] = value.split('|');
  return { categoryId, typeId: typeId || null };
};

// One <select> grouping types under their category. iPhone shows it as a native scrolling picker.
export function groupedSelect({ categoryId, typeId, onChange, label = 'Category', className = 'select select-pill select-sm', extraCategory }) {
  const categories = store.activeCategories();
  if (extraCategory && !categories.includes(extraCategory)) categories.push(extraCategory);
  return h(
    'select',
    {
      class: className,
      'aria-label': label,
      value: encode(categoryId, typeId),
      onchange: (e) => onChange(decode(e.target.value)),
    },
    categories.map((c) =>
      h(
        'optgroup',
        { label: `${c.emoji} ${c.name}` },
        h('option', { value: encode(c.id, null) }, `${c.emoji} ${c.name}${c.types.length ? ' · general' : ''}`),
        c.types.map((t) => h('option', { value: encode(c.id, t.id) }, `${t.emoji} ${t.name} · ${c.name}`)),
      ),
    ),
  );
}

// Category chips, then the chosen category's types as smaller chips.
export function categoryTypePicker({ categoryId, typeId = null, onChange, extraCategory }) {
  let current = { categoryId, typeId };
  const typesHost = h('div', { class: 'type-chips-host' });
  const categories = store.activeCategories();
  if (extraCategory && !categories.includes(extraCategory)) categories.push(extraCategory);

  const renderTypes = () => {
    const c = store.category(current.categoryId);
    if (!c?.types.length) {
      typesHost.replaceChildren();
      return;
    }
    const chip = (t) =>
      h(
        'button',
        {
          type: 'button',
          class: 'type-chip',
          role: 'radio',
          'aria-checked': String((t?.id ?? null) === current.typeId),
          onclick: () => {
            current = { ...current, typeId: t?.id ?? null };
            renderTypes();
            onChange(current);
          },
        },
        t ? `${t.emoji} ${t.name}` : 'General',
      );
    typesHost.replaceChildren(h('div', { class: 'type-chips', role: 'radiogroup', 'aria-label': `${c.name} type` }, c.types.map(chip), chip(null)));
  };

  const buttons = categories.map((c) =>
    h(
      'button',
      {
        type: 'button',
        class: 'chip',
        role: 'radio',
        'aria-checked': String(c.id === current.categoryId),
        dataset: { id: c.id },
        onclick: () => {
          if (current.categoryId === c.id) return;
          current = { categoryId: c.id, typeId: null };
          for (const b of buttons) b.setAttribute('aria-checked', String(b.dataset.id === c.id));
          renderTypes();
          onChange(current);
        },
      },
      h('span', { class: 'chip-emoji', 'aria-hidden': 'true' }, c.emoji),
      h('span', { class: 'chip-label' }, c.name),
    ),
  );
  renderTypes();
  const el = h('div', { class: 'stack-sm' }, h('div', { class: 'chips', role: 'radiogroup', 'aria-label': 'Category' }, buttons), typesHost);
  // Lets callers move the selection, e.g. when auto-sort recognises what was typed.
  el.setValue = (next) => {
    current = { categoryId: next.categoryId, typeId: next.typeId ?? null };
    for (const b of buttons) b.setAttribute('aria-checked', String(b.dataset.id === current.categoryId));
    renderTypes();
  };
  return el;
}
