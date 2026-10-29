(() => {
  const key = 'livechat-operator-theme';
  let value = 'light';
  let button = null;
  try { if (localStorage.getItem(key) === 'dark') value = 'dark'; } catch {}
  function apply(next, save = false) {
    value = next === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = value;
    document.documentElement.style.colorScheme = value;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = value === 'dark' ? '#10141d' : '#f3f5fa';
    if (button) {
      button.textContent = value === 'dark' ? '☀︎' : '☾';
      button.title = value === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему';
      button.setAttribute('aria-pressed', String(value === 'dark'));
    }
    if (save) { try { localStorage.setItem(key, value); } catch {} }
  }
  function mount() {
    const logout = document.querySelector('#logout');
    if (!logout || document.querySelector('#theme-toggle')) return;
    button = document.createElement('button');
    button.id = 'theme-toggle';
    button.type = 'button';
    button.setAttribute('aria-label', 'Тёмная тема');
    button.onclick = () => apply(value === 'dark' ? 'light' : 'dark', true);
    logout.before(button);
    apply(value);
  }
  apply(value);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
  window.addEventListener('storage', event => { if (event.key === key) apply(event.newValue); });
})();
