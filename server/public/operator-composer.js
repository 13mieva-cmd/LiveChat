import './chat-photos.js';
import './operator-keyboard.js';
const form=document.querySelector('#composer'),input=document.querySelector('#body'),send=document.querySelector('#send'),cancel=document.querySelector('#cancel'),templates=document.querySelector('#templates');
if(form&&input&&send&&cancel&&templates){
  const toolbar=templates.parentElement;toolbar.classList.add('composer-toolbar');
  let row=form.querySelector('.photo-compose-row');if(!row){row=document.createElement('div');row.className='photo-compose-row';input.before(row);row.append(input);}
  const editActions=cancel.parentElement;editActions.classList.add('composer-edit-actions');row.append(send);
  const style=document.createElement('style');style.textContent=`
#composer>.composer-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:8px}
#composer #templates{flex:1 1 100px;width:0;min-width:0;min-height:40px;height:40px;border-radius:12px;padding:8px 10px;font-size:14px}
#composer #close{flex:0 0 auto;height:40px;min-height:40px;padding:0 12px;border:1px solid #e2e8f0;border-radius:12px;background:#f1f5f9;color:#475569;font-size:12px;line-height:1.2;white-space:nowrap}
#composer #close:hover{background:#e2e8f0}
#composer>.photo-compose-row{display:flex;align-items:flex-end;justify-content:flex-start;gap:8px;width:100%;min-width:0}
#composer .photo-compose-row #body{display:block;flex:1 1 0%;width:0;min-width:0;height:44px;min-height:44px;max-height:144px;margin:0;padding:10px 12px;border:1px solid #dce2ed;border-radius:12px;font-size:16px;line-height:22px;background:#f8fafc}
#composer>.photo-compose-row>.photo-attach{flex:0 0 40px;width:40px;min-width:40px;height:44px;min-height:44px;margin:0;border-radius:12px}
#composer #send{display:inline-flex;align-items:center;justify-content:center;flex:0 0 44px;width:44px;height:44px;min-height:44px;margin:0;padding:0;border:0;border-radius:12px;background:#5145e5;color:white;line-height:1;touch-action:manipulation}
#composer #send svg{display:block;width:22px;height:22px;pointer-events:none}
#composer #send:hover:not(:disabled){background:#4338ca}
#composer #send:disabled{opacity:.5;cursor:default}
#composer>.composer-edit-actions{justify-content:flex-start;margin-top:6px}
#composer #cancel{background:#f1f5f9;color:#475569;font-size:12px;min-height:40px;padding:8px 12px}
@media(max-width:650px){#composer #templates{font-size:16px}#composer .photo-compose-row #body{max-height:96px;resize:none}}
`;document.head.append(style);
  function paint(){const editing=!cancel.hidden,mode=editing?'save':'send';editActions.hidden=!editing;send.title=editing?'Сохранить изменения':'Отправить сообщение';send.setAttribute('aria-label',send.title);if(send.dataset.composerIcon===mode&&send.querySelector('svg'))return;send.dataset.composerIcon=mode;const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS('http://www.w3.org/2000/svg','path');for(const [key,value] of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'2','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',focusable:'false'}))svg.setAttribute(key,value);path.setAttribute('d',editing?'m5 12 4 4L19 6':'M12 19V5m-6 6 6-6 6 6');svg.append(path);send.replaceChildren(svg);}
  const observer=new MutationObserver(paint);observer.observe(cancel,{attributes:true,attributeFilter:['hidden']});observer.observe(send,{childList:true});paint();
}
