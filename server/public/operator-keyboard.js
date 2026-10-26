const app=document.querySelector('#app'),input=document.querySelector('#body'),messages=document.querySelector('#messages'),title=document.querySelector('#title');
const viewport=window.visualViewport,mobile=matchMedia('(max-width:650px)');
if(app&&input&&messages&&viewport){
  const style=document.createElement('style');style.textContent=`
@media(max-width:650px){
#app.keyboard-open>header{display:none}
#app.keyboard-open .workspace>main{position:relative}
#app.keyboard-open #mobile-back{display:block;width:92px;height:36px;min-height:36px;padding:7px 10px;border:0;font-size:12px;line-height:22px}
#app.keyboard-open #title{position:absolute;top:0;left:92px;right:0;height:36px;min-height:36px;padding:7px 10px 7px 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:22px;border-bottom:0}
#app.keyboard-open #composer>.composer-toolbar{display:none}
#app.keyboard-open #composer{padding:6px 8px}
#app.keyboard-open #messages{padding:8px 10px}
#app.keyboard-open .message{margin-bottom:8px}
#app.keyboard-open #composer .photo-compose-row #body{max-height:72px}
}
`;document.head.append(style);
  let normalHeight=Math.max(innerHeight,viewport.height),lastWidth=viewport.width,frame=0,keepEnd=false;
  function nearEnd(){return messages.scrollHeight-messages.scrollTop-messages.clientHeight<96;}
  function update(){frame=0;const focused=document.activeElement===input;if(Math.abs(viewport.width-lastWidth)>80){lastWidth=viewport.width;normalHeight=Math.max(innerHeight,viewport.height);}if(!focused&&!app.classList.contains('keyboard-open'))normalHeight=Math.max(normalHeight,innerHeight,viewport.height);const compact=mobile.matches&&app.classList.contains('mobile-chat')&&focused&&viewport.scale<1.1&&Math.max(normalHeight,innerHeight)-viewport.height>120;const changed=compact!==app.classList.contains('keyboard-open'),pinned=keepEnd||nearEnd();if(!changed)return;app.classList.toggle('keyboard-open',compact);if(title)title.title=title.textContent||'';if(compact){input.style.height='44px';input.style.height=Math.min(72,Math.max(44,input.scrollHeight))+'px';}else input.dispatchEvent(new Event('input'));if(pinned)requestAnimationFrame(()=>{messages.scrollTop=messages.scrollHeight;});keepEnd=false;}
  function schedule(){if(!frame)frame=requestAnimationFrame(update);}
  input.addEventListener('pointerdown',()=>{keepEnd=nearEnd();});input.addEventListener('focus',()=>{keepEnd=nearEnd();schedule();});input.addEventListener('blur',()=>{schedule();setTimeout(schedule,250);});
  viewport.addEventListener('resize',schedule);viewport.addEventListener('scroll',schedule);window.addEventListener('resize',schedule);window.addEventListener('pageshow',schedule);document.addEventListener('visibilitychange',schedule);
  const observer=new MutationObserver(schedule);observer.observe(app,{attributes:true,attributeFilter:['class','hidden']});schedule();
}
