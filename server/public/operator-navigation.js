const valid=id=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
const storageKey='livechat-push-target';
export function bindNavigation({isReady,openConversation,onError}){
  let pending=null,running=false;
  const fromHash=()=>new URLSearchParams(location.hash.slice(1)).get('conversation');
  function remember(id){pending=id;try{if(id)sessionStorage.setItem(storageKey,id);else sessionStorage.removeItem(storageKey);}catch{}}
  async function resume(){if(running||!pending||!isReady())return;running=true;try{while(pending&&isReady()){const id=pending;try{await openConversation(id);if(pending===id)remember(null);}catch(error){if(error.status!==401&&pending===id)remember(null);onError(error);break;}}}finally{running=false;}}
  function receive(id){if(!valid(id))return;remember(id);const url=new URL(location.href);url.hash='conversation='+id;history.replaceState(null,'',url);void resume();}
  const initial=fromHash();if(valid(initial))remember(initial);else{try{const stored=sessionStorage.getItem(storageKey);if(valid(stored))pending=stored;}catch{}}
  window.addEventListener('hashchange',()=>{const id=fromHash();if(valid(id))receive(id);});
  navigator.serviceWorker?.addEventListener('message',event=>{if(event.data?.type!=='open_conversation'||!valid(event.data.conversationId))return;receive(event.data.conversationId);event.ports?.[0]?.postMessage({accepted:true});});
  return {resume};
}
