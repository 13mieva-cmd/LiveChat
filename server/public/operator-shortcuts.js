const $=s=>document.querySelector(s);
const nav=document.createElement('nav');nav.setAttribute('aria-label','Разделы панели');nav.style.cssText='display:flex;gap:14px;flex-wrap:wrap;padding:0 20px 16px';
for(const [title,url] of [['Сайты','settings.html'],['Быстрые ответы','replies.html']]){const a=document.createElement('a');a.textContent=title;a.href=url;a.style.color='#5145e5';nav.append(a);}
$('.inbox').insertBefore(nav,$('.inbox').firstChild);
const input=$('#body'),select=$('#templates'),form=$('#composer');
const hint=document.createElement('p');hint.style.cssText='font-size:12px;color:#64748b;margin:6px 0';hint.textContent='Команда шаблона: /hello → Tab. Текст вставляется без отправки.';hint.setAttribute('role','status');input.after(hint);
let library=[],loading=null;
async function reload(){const token=sessionStorage.getItem('livechat-operator');if(!token)return;const response=await fetch('/api/quick-replies',{headers:{Authorization:'Bearer '+token}});if(!response.ok)throw new Error('Не удалось загрузить команды шаблонов');library=await response.json();}
function refresh(){if(!loading)loading=reload().catch(e=>{hint.textContent=e.message;}).finally(()=>loading=null);return loading;}
function isCommand(){return /^\/[A-Za-z0-9_-]+$/.test(input.value.trim());}
function expand(){const command=input.value.trim();const allowed=new Set([...select.options].map(o=>o.value));const matches=library.filter(r=>r.shortcut===command&&allowed.has(r.id));if(matches.length!==1){hint.textContent=matches.length?'У команды несколько шаблонов. Выберите нужный в списке.':'Команда не найдена для этого сайта. Выберите шаблон в списке или измените текст.';return;}select.value=matches[0].id;select.dispatchEvent(new Event('change'));hint.textContent='Шаблон вставлен. Проверьте текст и нажмите «Отправить».';input.focus();}
input.addEventListener('focus',()=>{void refresh();});
input.addEventListener('keydown',event=>{if(event.key==='Tab'&&!event.shiftKey&&isCommand()){event.preventDefault();if(loading){hint.textContent='Команды загружаются. Нажмите Tab ещё раз после загрузки.';return;}expand();}});
form.addEventListener('submit',event=>{if(isCommand()){event.preventDefault();event.stopImmediatePropagation();if(!loading)expand();else hint.textContent='Дождитесь загрузки команд и нажмите Tab.';}},true);
for(const target of [$('#auth'),$('#noteform'),form])target.addEventListener('submit',event=>event.preventDefault(),true);
