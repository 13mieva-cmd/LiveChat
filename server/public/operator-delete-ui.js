(() => {
  const app = document.querySelector('#app');
  const title = document.querySelector('#title');
  if (!app || !title || document.querySelector('#closed-conversation-actions')) return;

  const bar = document.createElement('div');
  bar.id = 'closed-conversation-actions';
  bar.hidden = true;
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', 'Действия с завершённым диалогом');
  const label = document.createElement('span');
  label.textContent = 'Диалог завершён';
  bar.append(label);
  title.after(bar);

  const style = document.createElement('style');
  style.textContent = `
#closed-conversation-actions{display:flex;flex-shrink:0;align-items:center;justify-content:space-between;gap:12px;padding:10px 16px;background:#fff;border-bottom:1px solid #e2e7f0}
#closed-conversation-actions[hidden]{display:none!important}
#closed-conversation-actions>span{font-size:12px;color:#64748b}
#closed-conversation-actions #delete-dialog{flex:0 0 auto;min-height:44px;padding:10px 14px;border:1px solid #fecdd3;border-radius:12px;background:#fff1f2;color:#a32638;font-size:13px;white-space:nowrap;touch-action:manipulation}
#closed-conversation-actions #delete-dialog:disabled{opacity:.6;cursor:wait}
@media(max-width:650px){#closed-conversation-actions{padding:8px 12px;gap:8px}#closed-conversation-actions #delete-dialog{font-size:12px}}
`;
  document.head.append(style);

  const watched = new WeakSet();
  const observer = new MutationObserver(sync);
  function sync() {
    const button = document.querySelector('#delete-dialog');
    if (!button) return;
    if (button.parentElement !== bar) bar.append(button);
    if (!watched.has(button)) {
      watched.add(button);
      observer.observe(button, { attributes: true, attributeFilter: ['hidden', 'disabled'] });
    }
    const text = button.disabled ? 'Удаление…' : 'Удалить навсегда';
    if (button.textContent !== text) button.textContent = text;
    button.title = 'Удалить завершённый диалог без возможности восстановления';
    const hidden = button.hidden || app.hidden;
    if (bar.hidden !== hidden) bar.hidden = hidden;
  }
  observer.observe(document.body, { childList: true, subtree: true });
  observer.observe(app, { attributes: true, attributeFilter: ['hidden'] });
  sync();
})();
