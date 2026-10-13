import * as store from './store.js';
import { guessCurrency, h } from './dom.js';
import { icon } from './icons.js';
import { currentRoute, navigate } from './router.js';
import { openAddChooser, openOnboarding } from './sheets.js';
import { toast } from './ui.js';
import { renderHome } from './views/home.js';
import { renderHistory } from './views/history.js';
import { renderCharts } from './views/charts.js';
import { renderSettings } from './views/settings.js';

const VIEWS = { home: renderHome, history: renderHistory, charts: renderCharts, settings: renderSettings };
const TABS = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'history', label: 'History', icon: 'history' },
  { id: 'add' },
  { id: 'charts', label: 'Charts', icon: 'chart' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

const app = document.getElementById('app');
let renderedRoute = null;

function tabbar(route) {
  return h(
    'nav',
    { class: 'tabbar', 'aria-label': 'Main' },
    TABS.map((tab) =>
      tab.id === 'add'
        ? h('button', { type: 'button', class: 'tab-add', 'aria-label': 'Add spending', onclick: openAddChooser }, icon('plus', 28))
        : h(
            'a',
            { class: 'tab', href: `#/${tab.id}`, 'aria-current': tab.id === route ? 'page' : null, onclick: (e) => { e.preventDefault(); navigate(tab.id); } },
            icon(tab.icon, 24),
            h('span', null, tab.label),
          ),
    ),
  );
}

function render() {
  const route = currentRoute();
  const sameRoute = route === renderedRoute;
  const scrollY = window.scrollY;
  app.replaceChildren(h('main', { class: `view view-${route}` }, VIEWS[route]()), tabbar(route));
  window.scrollTo(0, sameRoute ? scrollY : 0);
  renderedRoute = route;
}

store.init({
  currency: guessCurrency(),
  onError: () => toast('Couldn’t save — storage may be full or blocked.'),
});
store.subscribe(render);
window.addEventListener('hashchange', render);

// Dates drive the check-in card, so refresh when the app comes back to the foreground.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') render();
});
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (currentRoute() === 'charts') render();
  }, 150);
});

render();
if (!store.get().settings.onboarded) openOnboarding();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Offline support unavailable:', err));
}
