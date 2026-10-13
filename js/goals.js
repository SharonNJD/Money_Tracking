// Savings goals: a target, an optional deadline, and money put aside (or taken out) over time.
import * as store from './store.js';
import { goalProgress, newId, parseAmount, todayISO } from './logic.js';
import { centsToInput, dayMonth, h, money, percent } from './dom.js';
import { amountInput, closeSheet, emptyState, fieldRow, openSheet, toast } from './ui.js';
import { icon } from './icons.js';

const GOAL_EMOJI = ['✈️', '🏖️', '🚗', '🏠', '💍', '🎓', '💻', '📱', '🎁', '🛟', '🎸', '👶', '🐶', '🚲', '🎯'];

function goalLine(goal, p, cur) {
  if (p.reached) return 'Goal reached — well done!';
  if (p.overdue) return `Deadline passed · ${money(p.remainingCents, cur)} to go`;
  if (p.perWeekCents) return `Save ${money(p.perWeekCents, cur)}/week to make it by ${dayMonth(goal.deadline)}`;
  return `${money(p.remainingCents, cur)} to go`;
}

function goalMeter(p) {
  return h(
    'div',
    { class: ['meter', 'meter-goal', p.reached && 'is-reached'], role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(Math.min(p.ratio, 1) * 100) },
    h('div', { class: 'meter-fill', style: { width: `${Math.min(p.ratio, 1) * 100}%` } }),
  );
}

export function goalsSection() {
  const state = store.get();
  const cur = state.settings.currency;
  const today = todayISO();
  const header = h('div', { class: 'section-head' }, h('h2', null, 'Savings goals'), h('button', { type: 'button', class: 'link-btn', onclick: () => openGoalSheet() }, icon('plus', 16), 'New'));
  if (!state.goals.length) {
    return h(
      'section',
      { class: 'section' },
      header,
      h('div', { class: 'card' }, emptyState({ title: 'Saving for something?', text: 'Set a goal, like a trip or a new phone, and see how much to put aside each week.', action: h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => openGoalSheet() }, 'Add a goal') })),
    );
  }
  return h(
    'section',
    { class: 'section' },
    header,
    h(
      'div',
      { class: 'card list-card' },
      state.goals.map((g) => {
        const p = goalProgress(g, today);
        return h(
          'button',
          { type: 'button', class: 'goal-row', onclick: () => openGoalSheet(g) },
          h('div', { class: 'budget-row-top' }, h('span', { class: 'cat-dot cat-dot-total', 'aria-hidden': 'true' }, g.emoji), h('span', { class: 'budget-name' }, g.name, h('small', null, goalLine(g, p, cur))), h('span', { class: 'budget-amount' }, h('strong', null, money(p.savedCents, cur)), h('small', null, ` / ${money(g.targetCents, cur)}`))),
          goalMeter(p),
          h('div', { class: 'budget-row-bottom' }, h('span', { class: ['badge', p.reached && 'level-good'] }, p.reached ? icon('check', 14) : null, `${percent(Math.min(p.ratio, 1))} saved`)),
        );
      }),
    ),
  );
}

export function openGoalSheet(goal) {
  const state = store.get();
  const cur = state.settings.currency;
  const editing = Boolean(goal);
  const today = todayISO();

  const name = h('input', { class: 'input', type: 'text', maxlength: 40, placeholder: 'e.g. Trip to Japan', value: goal?.name ?? '', 'aria-label': 'Goal name' });
  const emoji = h('input', { class: 'input emoji-input', type: 'text', maxlength: 16, value: goal?.emoji ?? '🎯', 'aria-label': 'Emoji' });
  const { field: targetField, input: target } = amountInput({ currency: cur, value: centsToInput(goal?.targetCents), label: 'Target amount' });
  const deadline = h('input', { class: 'input', type: 'date', min: today, value: goal?.deadline ?? '', 'aria-label': 'Deadline (optional)' });
  const error = h('p', { class: 'form-error', role: 'alert' });

  const details = [
    h('div', { class: 'card form-card' }, fieldRow('Name', name), fieldRow('Emoji', emoji), fieldRow('By (optional)', deadline)),
    h('div', { class: 'emoji-grid' }, GOAL_EMOJI.map((e) => h('button', { type: 'button', class: 'emoji-btn', 'aria-label': `Use ${e}`, onclick: () => (emoji.value = e) }, e))),
    h('div', { class: 'form-section' }, h('span', { class: 'field-label' }, 'Target'), targetField),
  ];

  let body;
  let initial = null;
  if (editing) {
    const p = goalProgress(goal, today);
    const { field: moveField, input: move } = amountInput({ currency: cur, label: 'Amount to add or take out' });
    const moveMoney = (sign) => {
      const cents = parseAmount(move.value);
      if (!cents) {
        error.textContent = 'Enter an amount first.';
        move.focus();
        return;
      }
      store.update((s) => {
        s.goals.find((g) => g.id === goal.id).deposits.push({ id: newId(), date: today, cents: sign * cents });
      });
      const updated = store.get().goals.find((g) => g.id === goal.id);
      const reachedNow = goalProgress(updated, today).reached && !p.reached;
      closeSheet();
      toast(reachedNow ? `🎉 You reached “${goal.name}”!` : sign > 0 ? `Added ${money(cents, cur)} to ${goal.name}` : `Took ${money(cents, cur)} out of ${goal.name}`);
    };
    const history = [...goal.deposits].reverse().slice(0, 8);
    body = h(
      'div',
      { class: 'stack' },
      h('div', { class: 'card goal-summary' }, h('span', { class: 'goal-emoji', 'aria-hidden': 'true' }, goal.emoji), h('strong', { class: 'goal-saved' }, money(p.savedCents, cur)), h('span', { class: 'muted' }, `of ${money(goal.targetCents, cur)} · ${goalLine(goal, p, cur)}`), goalMeter(p)),
      h('div', { class: 'form-section' }, h('span', { class: 'field-label' }, 'Put money aside'), moveField, h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: () => moveMoney(1) }, icon('plus', 18), 'Add'), h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => moveMoney(-1) }, 'Take out'))),
      history.length
        ? h('div', { class: 'form-section' }, h('span', { class: 'field-label' }, 'History'), h('div', { class: 'card list-card' }, history.map((d) => h('div', { class: 'history-row' }, h('span', null, dayMonth(d.date)), h('span', { class: d.cents < 0 ? 'muted' : '' }, `${d.cents < 0 ? '−' : '+'}${money(Math.abs(d.cents), cur)}`)))))
        : null,
      h('div', { class: 'form-section' }, h('span', { class: 'field-label' }, 'Details')),
      ...details,
      error,
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-danger btn-block',
          onclick: () => {
            if (!confirm(`Delete the goal “${goal.name}”?`)) return;
            store.update((s) => {
              s.goals = s.goals.filter((g) => g.id !== goal.id);
            });
            closeSheet();
            toast('Goal deleted');
          },
        },
        icon('trash', 18),
        'Delete goal',
      ),
    );
  } else {
    const start = amountInput({ currency: cur, label: 'Already saved', placeholder: '0' });
    initial = start.input;
    body = h('div', { class: 'stack' }, ...details, h('div', { class: 'form-section' }, h('span', { class: 'field-label' }, 'Already saved (optional)'), start.field), error);
  }

  openSheet({
    title: editing ? goal.name : 'New goal',
    body,
    primaryLabel: editing ? 'Save' : 'Add',
    onPrimary: () => {
      const targetCents = parseAmount(target.value);
      if (!name.value.trim()) {
        error.textContent = 'Give your goal a name.';
        return false;
      }
      if (!targetCents) {
        error.textContent = 'Enter a target amount.';
        return false;
      }
      const fields = { name: name.value.trim(), emoji: emoji.value.trim() || '🎯', targetCents, deadline: deadline.value || null };
      store.update((s) => {
        if (editing) {
          Object.assign(s.goals.find((g) => g.id === goal.id), fields);
        } else {
          const startCents = parseAmount(initial.value);
          s.goals.push({ id: newId(), ...fields, deposits: startCents ? [{ id: newId(), date: today, cents: startCents }] : [], createdAt: today });
        }
      });
      toast(editing ? 'Saved' : 'Goal added');
      return true;
    },
  });
}
