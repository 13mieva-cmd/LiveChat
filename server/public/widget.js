(() => {
  const script = document.currentScript;
  const key = script?.dataset.siteKey;
  if (!key || document.querySelector('[data-livechat-host]')) return;
  const base = new URL(script.src).origin;
  const storageKey = 'livechat:' + key;
  const load = name => { try { return JSON.parse(localStorage.getItem(storageKey + name) || 'null'); } catch { return null; } };
  const save = (name, value) => { try { localStorage.setItem(storageKey + name, JSON.stringify(value)); } catch {} };
  let token = load(':token'), queue = load(':outbox') || [], history = [], socket, config, open = false, unread = 0, stopped = false, retry = 800, timer, typingTimer;
  const host = document.createElement('div');
  host.dataset.livechatHost = '';
  const root = host.attachShadow({mode:'open'});
  root.innerHTML = `<style>
  :host{all:initial;position:fixed;bottom:20px;right:20px;z-index:2147483000;font:14px/1.5 -apple-system,BlinkMacSystemFont,Arial,sans-serif;color:#182235;color-scheme:light;--accent:#4f46e5}
  *{box-sizing:border-box}button,textarea{font:inherit}button{cursor:pointer}button:focus-visible,textarea:focus-visible{outline:3px solid #f59e0b;outline-offset:3px}button{border:0}button:disabled{opacity:.55;cursor:default}
  .launcher{background:var(--accent);color:white;border-radius:22px;padding:17px 22px;box-shadow:0 12px 32px #18223530;font-weight:650}.badge{background:#ef4444;border-radius:20px;padding:2px 7px;margin-left:8px}
  .panel{width:min(380px,calc(100vw - 24px));height:min(600px,calc(100dvh - 100px));background:#fff;border:1px solid #e6eaf0;border-radius:24px;box-shadow:0 24px 80px #15234233;overflow:hidden;display:flex;flex-direction:column;margin-bottom:12px}.panel[hidden]{display:none}
  header{background:var(--accent);color:#fff;padding:20px;display:flex;align-items:center;gap:12px}.avatar{width:42px;height:42px;border-radius:15px;background:#ffffff25;display:grid;place-items:center;font-size:24px}.heading{flex:1;min-width:0}h2{font-size:17px;margin:0;overflow-wrap:anywhere}.sub{font-size:12px;opacity:.85}.icon{background:transparent;color:inherit;font-size:22px;padding:4px 8px}
  .messages{flex:1;overflow-y:auto;overscroll-behavior:contain;padding:18px;min-height:0;background:#f7f9fc}.bubble{max-width:88%;padding:11px 14px;margin:8px 0;background:white;border:1px solid #e5eaf1;border-radius:16px 16px 16px 4px;white-space:pre-wrap;overflow-wrap:anywhere}.mine{margin-left:auto;background:var(--accent);color:white;border:0;border-radius:16px 16px 4px 16px}.meta{display:block;font-size:10px;opacity:.7;margin-top:5px}.choices{display:grid;gap:8px;margin:12px 0}.choice{background:white;border:1px solid #d9deeb;border-radius:12px;padding:11px;text-align:left;color:var(--accent)}.error{font-size:12px;color:#b45309;padding:6px 16px;overflow-wrap:anywhere}.typing{min-height:23px;padding:2px 18px;font-size:12px;color:#64748b}
  form{display:flex;align-items:flex-end;gap:8px;padding:12px;border-top:1px solid #edf0f5}textarea{resize:none;min-width:0;flex:1;border:0;background:#f2f5f9;border-radius:12px;padding:12px;color:inherit;height:68px} .send{padding:12px;border-radius:12px;background:var(--accent);color:white}.foot{font-size:10px;text-align:center;color:#64748b;padding:0 12px 10px}
  @media(prefers-color-scheme:dark){.panel{background:#192333;border-color:#334155;color:#e2e8f0}.messages{background:#101827}.bubble,.choice{background:#243146;border-color:#394860;color:#e2e8f0}.mine{background:var(--accent)}textarea{background:#243146}form{border-color:#334155}}
  @media(max-width:480px){:host{right:12px!important;left:auto!important;bottom:12px!important}.panel{height:min(600px,calc(var(--viewport,100dvh) - 90px));width:calc(100vw - 24px);border-radius:20px}.launcher{float:right}}
  @media(prefers-reduced-motion:no-preference){.panel{animation:appear .18s ease-out}@keyframes appear{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}}
  </style><section class="panel" hidden role="dialog" aria-label="Чат поддержки"><header><span class="avatar" aria-hidden="true">↗</span><div class="heading"><h2>Поддержка</h2><div class="sub" role="status">Подключение…</div></div><button class="icon close" aria-label="Свернуть чат">−</button></header><div class="messages" role="log" aria-live="polite"></div><div class="typing" role="status"></div><div class="error" role="status"></div><form><textarea aria-label="Ваше сообщение" placeholder="Напишите ваш вопрос…" maxlength="4000"></textarea><button class="send" type="submit" aria-label="Отправить сообщение">↑</button></form><div class="foot">Не отправляйте пароли и данные банковских карт.</div></section><button class="launcher" aria-expanded="false">Написать нам<span class="badge" hidden>0</span></button>`;
  document.body.append(host);
  const $ = s => root.querySelector(s);
  const panel = $('.panel'), list = $('.messages'), input = $('textarea'), status = $('.sub'), error = $('.error');
  function toggle(value) { open = value; panel.hidden = !open; $('.launcher').setAttribute('aria-expanded',String(open)); if(open){unread=0;$('.badge').hidden=true;input.focus();list.scrollTop=list.scrollHeight;} }
  $('.launcher').onclick=()=>toggle(!open); $('.close').onclick=()=>toggle(false);
  root.addEventListener('keydown',e=>{if(e.key==='Escape'){toggle(false);$('.launcher').focus();}});
  function viewport(){host.style.setProperty('--viewport',(window.visualViewport?.height || innerHeight)+'px');if(window.visualViewport)host.style.transform=`translateY(-${Math.max(0,innerHeight-window.visualViewport.height-window.visualViewport.offsetTop)}px)`;}
  window.visualViewport?.addEventListener('resize',viewport);window.visualViewport?.addEventListener('scroll',viewport);viewport();
  function render(){
    list.replaceChildren();
    const add = (body,mine,meta) => {const item=document.createElement('div');item.className='bubble'+(mine?' mine':'');item.textContent=body;if(meta){const small=document.createElement('span');small.className='meta';small.textContent=meta;item.append(small);}list.append(item);};
    if(config)add(config.greeting,false);
    if(config && !history.some(m=>m.senderType==='visitor') && !queue.length){const choices=document.createElement('div');choices.className='choices';for(const b of (config.quickButtons || []).slice(0,3)){const button=document.createElement('button');button.className='choice';button.textContent=b.label;button.onclick=()=>send(b.message);choices.append(button);}list.append(choices);}
    for(const m of history){const time=new Date(m.createdAt).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});add(m.body,m.senderType==='visitor',time+(m.edited?' · Изменено':'')+(m.senderType==='visitor'?' · '+({read:'Прочитано',delivered:'Доставлено',sent:'На сервере'}[m.status] || 'На сервере'):''));}
    for(const m of queue)add(m.body,true,'Ожидает подтверждения · повторим при подключении');
    list.scrollTop=list.scrollHeight;
  }
  function transmit(data){if(socket?.readyState===WebSocket.OPEN){socket.send(JSON.stringify(data));return true;}return false;}
  function send(body){body=body.trim();if(!body)return;queue.push({type:'message',clientId:crypto.randomUUID(),body});save(':outbox',queue);input.value='';render();flush();}
  function flush(){for(const m of queue)transmit(m);}
  $('form').onsubmit=e=>{e.preventDefault();send(input.value);};
  input.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();send(input.value);}};
  let lastTyping=0; input.oninput=()=>{if(Date.now()-lastTyping>2000){transmit({type:'typing'});lastTyping=Date.now();}};
  function merge(m){const i=history.findIndex(x=>x.id===m.id);if(i>=0)history[i]={...history[i],...m};else history.push(m);queue=queue.filter(x=>x.clientId!==m.clientId);save(':outbox',queue);render();}
  async function init(){
    const response=await fetch(base+'/api/widget/init',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({siteKey:key,visitorToken:token || undefined,pageUrl:location.href,referrer:document.referrer || null,utm:Object.fromEntries([...new URLSearchParams(location.search)].filter(([k])=>k.startsWith('utm_')))})});
    const data=await response.json();if(!response.ok)throw new Error(data.error || 'Не удалось открыть чат');
    token=data.visitorToken;save(':token',token);config=data.site;history=data.messages;
    queue=queue.filter(m=>!history.some(h=>h.clientId===m.clientId));save(':outbox',queue);
    host.style.setProperty('--accent',/^#[0-9a-f]{6}$/i.test(config.color)?config.color:'#4f46e5');
    host.style.right=config.position==='left'?'auto':config.offsetX+'px';host.style.left=config.position==='left'?config.offsetX+'px':'auto';host.style.bottom=config.offsetY+'px';
    $('h2').textContent=config.headerTitle;render();
  }
  async function connect(){
    if(stopped)return;
    try{await init();const url=new URL('/ws',base);url.protocol=url.protocol==='https:'?'wss:':'ws:';url.searchParams.set('siteKey',key);url.searchParams.set('visitorToken',token);socket=new WebSocket(url);
      socket.onopen=()=>{retry=800;status.textContent='Соединение установлено';error.textContent='';flush();};
      socket.onmessage=e=>{let data;try{data=JSON.parse(e.data);}catch{return;}if(data.type==='message'){const fresh=!history.some(m=>m.id===data.message.id);merge(data.message);if(fresh&&data.message.senderType==='operator'&&!open){$('.badge').textContent=String(++unread);$('.badge').hidden=false;}}if(data.type==='message_updated')merge(data.message);if(data.type==='status_updated'){for(const m of history)if(data.messageIds.includes(m.id))m.status=data.status;render();}if(data.type==='typing'&&data.who==='operator'){$('.typing').textContent='Оператор печатает…';clearTimeout(typingTimer);typingTimer=setTimeout(()=>$('.typing').textContent='',3500);}if(data.type==='conversation_closed')error.textContent='Диалог завершён оператором.';};
      socket.onclose=()=>{status.textContent='Переподключение…';schedule();};socket.onerror=()=>socket.close();
    }catch(e){status.textContent='Нет соединения';error.textContent=e.message;schedule();}
  }
  function schedule(){clearTimeout(timer);timer=setTimeout(connect,retry+Math.random()*400);retry=Math.min(retry*2,15000);}
  const resend=setInterval(()=>{if(socket?.readyState===WebSocket.OPEN)flush();},10000);
  window.addEventListener('pagehide',()=>{stopped=true;clearTimeout(timer);clearInterval(resend);socket?.close();});
  window.addEventListener('pageshow',e=>{if(e.persisted){stopped=false;connect();}});
  connect();
})();
