const $=s=>document.querySelector(s);
const labels={online:'🟢 На сайте',hidden:'🟡 Вкладка скрыта',reconnecting:'🟡 Проверяем связь',offline:'⚪ Не в сети'};
const make=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
const live=make('section');live.id='presence-list';$('#dialogs').before(live);
const head=make('div');head.id='presence-head';head.hidden=true;$('#title').after(head);
const card=make('section');card.id='presence-card';card.hidden=true;$('#details').before(card);
const style=make('style');style.textContent='#presence-list{margin:10px 0}#presence-list:empty{display:none}#presence-list h3{font-size:13px;margin:0 0 6px}#presence-list a{display:block;color:inherit;text-decoration:none;border:1px solid #8176bc55;border-radius:12px;padding:8px;margin:5px 0;font-size:12px;overflow-wrap:anywhere}#presence-list small{display:block;opacity:.8}#presence-head{flex-shrink:0;padding:6px 16px;font-size:12px;border-bottom:1px solid #8176bc33;overflow-wrap:anywhere}#presence-head a,#presence-card a{color:inherit;text-decoration:underline;overflow-wrap:anywhere}#presence-card{padding:10px 0;border-bottom:1px solid #8176bc33;font-size:12px}#presence-card p{margin:5px 0}#presence-card small{opacity:.75}#presence-head[hidden],#presence-card[hidden]{display:none!important}@media(max-width:650px){#presence-head{padding:5px 12px;font-size:11px}#presence-head a{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}';document.head.append(style);
let data=[],busy=false,fresh=false,version=0;
function selected(){for(const n of $('#details').querySelectorAll('small'))if(n.textContent==='Технический ID'){const id=n.nextElementSibling?.textContent;return /^[0-9a-f-]{36}$/i.test(id||'')?id:null;}return null;}
function pageLink(row){try{const url=new URL(row.url);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)return null;url.search='';url.hash='';const a=make('a',row.title||url.pathname);a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';a.title=url.href;return a;}catch{return null;}}
function last(row){const date=new Date(row.lastSeen);return Number.isFinite(date.getTime())?'Последняя связь: '+date.toLocaleString('ru-RU'):'';}
function paint(){
  if($('#app').hidden){live.replaceChildren();head.hidden=card.hidden=true;return;}
  live.replaceChildren();const active=fresh?data.filter(v=>v.state!=='offline'&&(!$('#site').value||v.siteId===$('#site').value)):[];
  if(active.length){live.append(make('h3','Сейчас на сайтах · '+active.length));for(const row of active.slice(0,30)){const link=make(row.conversationId?'a':'div');if(row.conversationId)link.href='#conversation='+encodeURIComponent(row.conversationId);link.append(make('strong',row.name||'Новый посетитель'),make('small',labels[row.state]+' · '+row.siteName),make('small',row.title||row.url));live.append(link);}}
  const id=selected();head.replaceChildren();card.replaceChildren();head.hidden=card.hidden=!id;if(!id)return;const row=data.find(v=>v.visitorId===id);
  if(!fresh||!row){const text=!fresh?'Нет актуальных данных о присутствии':'Данные о присутствии пока не получены';head.append(make('span',text));card.append(make('p',text));return;}
  head.append(make('span',labels[row.state]+' · '));const link=pageLink(row);if(link)head.append(link);
  card.append(make('p',labels[row.state]),make('small',last(row)),make('p',row.state==='offline'?'Последняя известная страница:':'Страница:'));const detail=pageLink(row);if(detail)card.append(detail);
  if(row.tabs.length>1){card.append(make('p','Открыто вкладок: '+row.tabs.length));for(const tab of row.tabs){const line=make('p',tab.visible?'Видимая: ':'Фоновая: '),a=pageLink(tab);if(a)line.append(a);card.append(line);}}
}
async function refresh(){if(busy||document.hidden)return;if($('#app').hidden){fresh=false;data=[];paint();return;}let token;try{token=sessionStorage.getItem('livechat-operator');}catch{}if(!token){fresh=false;paint();return;}busy=true;const id=selected(),v=version;try{const params=new URLSearchParams();if(id)params.set('visitorId',id);if($('#site').value)params.set('siteId',$('#site').value);const response=await fetch('/api/presence?'+params,{headers:{Authorization:'Bearer '+token},credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error('Presence unavailable');const result=await response.json();if(v!==version||id!==selected()||$('#app').hidden)return;data=Array.isArray(result.visitors)?result.visitors:[];fresh=true;}catch{if(v===version)fresh=false;}finally{busy=false;paint();}}
new MutationObserver(()=>{version++;fresh=false;paint();void refresh();}).observe($('#details'),{childList:true,subtree:true});
new MutationObserver(()=>{if($('#app').hidden){version++;data=[];fresh=false;paint();}else void refresh();}).observe($('#app'),{attributes:true,attributeFilter:['hidden']});
$('#site').addEventListener('change',()=>{version++;fresh=false;paint();void refresh();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});window.addEventListener('online',()=>void refresh());setInterval(()=>void refresh(),5000);void refresh();
