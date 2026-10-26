(() => {
if(document.querySelector('[data-livechat-actions-style]'))return;
const helperSource=document.currentScript?.src;
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
if(shadow){const rounded=document.createElement('style');rounded.textContent='@media(max-width:650px){.launcher{width:calc(100% - 16px)!important;margin:0 auto!important;border-radius:999px!important;white-space:normal;overflow-wrap:anywhere}}';shadow.append(rounded);}
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
