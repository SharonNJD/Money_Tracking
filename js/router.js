// Hash routes keep the current tab across reloads (#/history, #/charts, ...).
export const ROUTES = ['home', 'history', 'charts', 'settings'];

export function currentRoute() {
  const route = location.hash.replace(/^#\/?/, '');
  return ROUTES.includes(route) ? route : 'home';
}

export function navigate(route) {
  if (currentRoute() === route) return;
  location.hash = `#/${route}`;
}
