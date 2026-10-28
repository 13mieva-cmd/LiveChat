const valid=id=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
const storageKey='livechat-push-target';
export function bindNavigation({isReady,openConversation,onError}){
  let pending=null,running=null,retryTimer=null,sequence=0;
  function fromUrl(){const url=new URL(location.href),query=url.searchParams.get('conversation'),hash=new URLSearchParams(url.hash.slice(1)).get('conversation');return valid(query)?query:valid(hash)?hash:null;}
  function remember(id){clearTimeout(retryTimer);pending=id?{id,version:++sequence,attempts:0}:null;try{if(id)sessionStorage.setItem(storageKey,id);else sessionStorage.removeItem(storageKey);}catch{}}
  function clearUrl(id){const url=new URL(location.href);if(url.searchParams.get('conversation')===id)url.searchParams.delete('conversation');if(new URLSearchParams(url.hash.slice(1)).get('conversation')===id)url.hash='';history.replaceState(null,'',url);}
  function resume(){if(running)return running;if(!pending||!isReady())return Promise.resolve(false);clearTimeout(retryTimer);running=(async()=>{try{while(pending&&isReady()){const target=pending;try{await openConversation(target.id);if(pending===target){remember(null);clearUrl(target.id);return true;}}catch(error){if(pending!==target)continue;onError(error);if(error.status===403||error.status===404){remember(null);clearUrl(target.id);}else if(error.status!==401&&++target.attempts<=5){retryTimer=setTimeout(()=>void resume(),Math.min(15000,1000*2**target.attempts));}return false;}}return false;}finally{running=null;}})();return running;}
  function receive(id){if(!valid(id))return Promise.resolve(false);remember(id);const url=new URL(location.href);url.searchParams.set('conversation',id);url.hash='conversation='+id;history.replaceState(null,'',url);return resume();}
  const initial=fromUrl();if(initial)remember(initial);else{try{const stored=sessionStorage.getItem(storageKey);if(valid(stored))remember(stored);}catch{}}
  function wake(){if(document.hidden)return;const id=fromUrl();if(id&&id!==pending?.id)void receive(id);else{if(pending)pending.attempts=0;void resume();}}
  window.addEventListener('hashchange',wake);window.addEventListener('popstate',wake);window.addEventListener('pageshow',wake);window.addEventListener('focus',wake);window.addEventListener('online',wake);document.addEventListener('visibilitychange',wake);
  navigator.serviceWorker?.addEventListener('message',event=>{if(event.data?.type!=='open_conversation'||!valid(event.data.conversationId))return;const ready=isReady(),id=event.data.conversationId;void receive(id).then(opened=>{try{event.ports?.[0]?.postMessage({accepted:opened||!ready,queued:!ready});}catch{}}).catch(onError);});
  return {resume};
}
