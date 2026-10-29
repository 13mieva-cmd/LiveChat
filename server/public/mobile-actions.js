(() => {
if(document.querySelector('[data-livechat-actions-style]'))return;
const helperSource=document.currentScript?.src;
if(helperSource){void import(new URL('chat-photos.js',helperSource).href).catch(()=>{});void import(new URL('visitor-profile.js',helperSource).href).catch(()=>{});}
const style=document.createElement('style');style.dataset.livechatActionsStyle='';
style.textContent=`@media(max-width:650px){
[data-livechat-actions]{left:8px!important;right:8px!important;bottom:8px!important;width:auto!important;max-width:none!important;min-width:0!important;transform:none!important;translate:none!important;margin:0!important;border-radius:24px!important;box-sizing:border-box!important;padding:6px 6px max(6px,env(safe-area-inset-bottom))!important}
[data-livechat-actions-row]{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:6px!important;align-items:stretch!important;justify-content:stretch!important;width:100%!important;max-width:none!important;min-width:0!important;box-sizing:border-box!important}
[data-livechat-actions][data-livechat-actions-row]{width:auto!important}
[data-livechat-actions-cell]{min-width:0!important;width:100%!important;max-width:none!important;margin:0!important;box-sizing:border-box!important}
[data-livechat-actions-control]{display:flex!important;align-items:center!important;justify-content:center!important;gap:4px!important;min-width:0!important;width:100%!important;max-width:none!important;min-height:44px!important;margin:0!important;padding:8px 4px!important;border-radius:999px!important;font-size:12px!important;line-height:1.2!important;white-space:normal!important;text-align:center!important;box-sizing:border-box!important}
[data-livechat-actions-control] svg,[data-livechat-actions-control] img{max-width:18px!important;flex-shrink:0!important}
}`;document.head.append(style);
const shadow=document.querySelector('[data-livechat-host]')?.shadowRoot;
if(shadow){
  const rounded=document.createElement('style');
  rounded.textContent=`
:host{color-scheme:light;--lc-gradient:linear-gradient(115deg,#993ee6 0%,#7947f1 48%,#5758ff 100%)}
.panel{background:#fff!important;color:#202344;border:1px solid #e4e6f0;border-radius:22px;box-shadow:0 18px 60px #27234d30}
.panel>header{display:grid;grid-template-columns:minmax(0,1fr) 44px;gap:9px 8px;align-items:center;padding:17px 18px 25px;background:var(--lc-gradient);color:#fff}
.lc-brand{display:flex;align-items:center;gap:9px;min-width:0;font-size:25px;font-weight:750;line-height:1.15;letter-spacing:-1px}
.lc-brand svg{width:33px;height:33px;flex:none}
.panel>header .close{grid-column:2;grid-row:1;display:grid;place-items:center;width:44px;height:44px;padding:0;line-height:1;font-size:32px;border-radius:50%}
.panel>header .close:hover{background:#ffffff1c}
.panel>header .head{grid-column:1/-1;min-width:0}
.panel>header h2{display:flex;align-items:flex-start;gap:10px;font-size:15px;font-weight:400;line-height:1.4;overflow-wrap:anywhere}
.panel>header h2:before{content:'';display:block;width:11px;height:11px;margin-top:5px;flex:none;border-radius:50%;background:#d1d5e5}
.panel>header[data-connected] h2:before{background:#42d88d}
.panel>header .sub{font-size:10px;line-height:1.4;margin:3px 0 0 21px;opacity:.85}
.panel>.messages{position:relative;margin-top:-12px;border-radius:16px 16px 0 0;background:#fff!important;color:#202344;padding:18px 16px;scrollbar-width:thin;scrollbar-color:#c2c4d2 transparent}
.panel .bubble{position:relative;margin:10px 0 16px 40px;max-width:calc(100% - 48px);background:#f0f3fa;color:#202344;border:0;border-radius:16px;padding:12px 14px;font-size:14px;line-height:1.45}
.panel .bubble:not(.mine):before{content:'';position:absolute;left:-40px;top:4px;width:30px;height:30px;border-radius:50%;background:#eeebff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath d='M8 7h16a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H14l-6 4v-4a3 3 0 0 1-3-3V10a3 3 0 0 1 3-3Z' fill='none' stroke='%235347b9' stroke-width='2.5' stroke-linejoin='round'/%3E%3Cg fill='%235347b9'%3E%3Ccircle cx='11' cy='15' r='1.5'/%3E%3Ccircle cx='16' cy='15' r='1.5'/%3E%3Ccircle cx='21' cy='15' r='1.5'/%3E%3C/g%3E%3C/svg%3E") center/23px 23px no-repeat}
.panel .bubble.mine{margin-left:auto;margin-right:0;max-width:85%;background:var(--lc-gradient);color:#fff;border:0;border-radius:16px}
.panel .meta{font-size:10px;line-height:1.4;color:#7d849d;opacity:1;margin-top:7px}
.panel .mine .meta{color:#fff;opacity:.85;text-align:right}
.panel .choice{background:#f5f3ff;color:#5542bb;border:1px solid #e4dffc;border-radius:12px}
.panel>form{align-items:flex-end;gap:8px;padding:10px 16px;background:#fff!important;color:#202344;border-color:#e3e6f0}
.panel>form>textarea{background:#f4f6fb;color:#202344;border:1px solid #dce0ed;border-radius:13px;height:52px;padding:12px;font-size:16px;line-height:24px}
.panel>form>textarea::placeholder{color:#8990a6}
.panel>form>.send{display:grid;place-items:center;flex:0 0 46px;width:46px;height:46px;min-height:46px;padding:0;border-radius:50%;background:var(--lc-gradient);color:#fff;font-size:31px;line-height:1}
.panel>.profile-tools{padding:7px 18px 2px}
.panel>.profile-tools button{color:#7d849d}
.panel .photo-attach{align-self:center}
.panel>.foot{color:#858ba0;padding:0 14px 12px;font-size:10px}
.panel .error,.panel .typing{color:#64748b}
@media(max-width:650px){.launcher{width:calc(100% - 16px)!important;margin:0 auto!important;border-radius:999px!important;white-space:normal;overflow-wrap:anywhere}}
:host([data-mobile-open]) .panel{border-radius:0}
:host([data-mobile-open]) .panel>header{padding:8px 12px 21px;gap:3px 8px;min-height:0}
:host([data-mobile-open]) .lc-brand{font-size:22px}
:host([data-mobile-open]) .lc-brand svg{width:29px;height:29px}
:host([data-mobile-open]) .panel>header h2{font-size:14px}
:host([data-mobile-open]) .panel>header .sub{font-size:10px}
:host([data-mobile-open]) .panel>.messages{padding:14px 12px;-webkit-overflow-scrolling:touch;touch-action:pan-y}
:host([data-mobile-open]) .panel .bubble{font-size:15px;padding:10px 12px}
:host([data-mobile-open]) .panel>form{padding:8px 10px max(8px,env(safe-area-inset-bottom))}
:host([data-mobile-open]) .panel>form>textarea{height:44px;padding:9px 10px;line-height:24px}
:host([data-mobile-open]) .panel>form>.send{flex-basis:44px;width:44px;height:44px;min-height:44px;border-radius:50%}
:host([data-mobile-open]) .panel>.foot{padding:0 10px 5px;font-size:9px}
`;shadow.append(rounded);
  const header=shadow.querySelector('.panel>header');
  if(header&&!header.querySelector('.lc-brand')){
    const oldIcon=header.querySelector(':scope>span');if(oldIcon)oldIcon.remove();
    const brand=document.createElement('div');brand.className='lc-brand';brand.setAttribute('aria-label','LiveChat');
    brand.innerHTML='<svg viewBox="0 0 36 36" fill="none" aria-hidden="true" focusable="false"><path d="M10 5h17a6 6 0 0 1 6 6v12a6 6 0 0 1-6 6H15l-8 5v-7a6 6 0 0 1-4-6V11a6 6 0 0 1 7-6Z" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round"/><g fill="currentColor"><circle cx="11" cy="17" r="2"/><circle cx="18" cy="17" r="2"/><circle cx="25" cy="17" r="2"/></g></svg><span aria-hidden="true">LiveChat</span>';
    header.prepend(brand);
    const status=header.querySelector('.sub');
    if(status){const sync=()=>header.toggleAttribute('data-connected',status.textContent==='Соединение установлено');sync();new MutationObserver(sync).observe(status,{childList:true,characterData:true,subtree:true});}
  }
}
function embedContext(){if(!helperSource)return null;const origin=new URL(helperSource).origin;const embed=[...document.querySelectorAll('script[data-site-key]')].find(el=>el.src&&new URL(el.src).origin===origin);return embed?{origin,key:embed.dataset.siteKey}:null;}
async function launcherText(){if(!shadow)return;const context=embedContext();if(!context)return;const url=new URL('/api/widget/launcher',context.origin);url.searchParams.set('key',context.key);const response=await fetch(url,{cache:'no-store',credentials:'omit'});if(!response.ok)return;const data=await response.json();if(typeof data.launcherLabel!=='string'||!data.launcherLabel.trim()||data.launcherLabel.length>60)return;const button=shadow.querySelector('.launcher');if(!button)return;let text=[...button.childNodes].find(n=>n.nodeType===Node.TEXT_NODE);if(!text){text=document.createTextNode('');button.prepend(text);}text.textContent=data.launcherLabel+' ';window.dispatchEvent(new Event('resize'));}
void launcherText().catch(()=>{});
async function setupInvite(){
  const context=embedContext(),button=shadow?.querySelector('.launcher');if(!context||!button)return;
  const storageKey='livechat:'+context.key+':invitation-shown';let done=false,waiting=false,inviteTimer;
  try{done=sessionStorage.getItem(storageKey)==='1';}catch{}
  function finish(){done=true;waiting=false;clearTimeout(inviteTimer);try{sessionStorage.setItem(storageKey,'1');}catch{}}
  button.addEventListener('click',finish);shadow.addEventListener('pointerdown',e=>{if(e.isTrusted)finish();},{passive:true});shadow.addEventListener('keydown',e=>{if(e.isTrusted)finish();});
  if(button.getAttribute('aria-expanded')==='true'){finish();return;}if(done)return;
  const url=new URL('/api/widget/config',context.origin);url.searchParams.set('key',context.key);const response=await fetch(url,{cache:'no-store',credentials:'omit'});if(!response.ok)return;const config=await response.json();if(config.autoInviteEnabled!==true||done)return;const seconds=Number(config.autoInviteDelaySeconds);if(!Number.isInteger(seconds)||seconds<5||seconds>600)return;
  function invite(){if(done)return;if(document.hidden){waiting=true;return;}waiting=false;if(button.getAttribute('aria-expanded')==='true'||shadow.querySelector('.bubble.mine')||shadow.querySelector('textarea')?.value.trim()){finish();return;}const focused=document.activeElement;if(focused&&(focused.matches('input,textarea,select')||focused.isContentEditable)){finish();return;}if(!shadow.querySelector('.messages .bubble')){inviteTimer=setTimeout(invite,500);return;}finish();button.click();}
  document.addEventListener('visibilitychange',()=>{if(waiting&&!document.hidden)invite();});
  window.addEventListener('pagehide',()=>{clearTimeout(inviteTimer);waiting=false;});
  inviteTimer=setTimeout(invite,Math.max(0,seconds*1000-performance.now()));
}
void setupInvite().catch(()=>{});
let timer;
const name=el=>(el.textContent||'').replace(/\s+/g,' ').trim().toLowerCase();
function scan(){const groups=new Set();for(const control of document.querySelectorAll('a,button')){if(!/viber|вайбер/.test(name(control)))continue;for(let el=control.parentElement;el&&el!==document.body;el=el.parentElement){if(getComputedStyle(el).position==='fixed')groups.add(el);}}for(const bar of groups){if(bar.hasAttribute('data-livechat-actions'))continue;const controls=[...bar.querySelectorAll('a,button')];if(controls.length!==3)continue;const v=controls.find(el=>/viber|вайбер/.test(name(el))),t=controls.find(el=>/telegram|телеграм/.test(name(el))),o=controls.find(el=>/сделать\s+заказ/.test(name(el)));if(!v||!t||!o||new Set([v,t,o]).size!==3)continue;let row=v.parentElement;while(row&&row!==bar&&!([t,o].every(el=>row.contains(el))))row=row.parentElement;if(!row||![v,t,o].every(el=>row.contains(el)))continue;const branches=[v,t,o].map(el=>{while(el.parentElement!==row&&el.parentElement)el=el.parentElement;return el;});if(new Set(branches).size!==3||row.children.length!==3)continue;bar.setAttribute('data-livechat-actions','');row.setAttribute('data-livechat-actions-row','');for(const el of branches)el.setAttribute('data-livechat-actions-cell','');for(const el of [v,t,o])el.setAttribute('data-livechat-actions-control','');requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));}}
const observer=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(scan,150);});observer.observe(document.body,{childList:true,subtree:true});window.addEventListener('load',scan);window.addEventListener('resize',scan);scan();
})();
