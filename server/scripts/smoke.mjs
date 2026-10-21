import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import WebSocket from 'ws';

if(process.env.SMOKE_ALLOW_WRITE!=='1')throw new Error('Only run against a disposable test database with SMOKE_ALLOW_WRITE=1');
const base='http://localhost:3000',sockets=[];
async function api(path,options={}){const r=await fetch(base+'/api'+path,{...options,headers:{'Content-Type':'application/json',...options.headers}});assert.equal(r.ok,true,'HTTP request failed: '+path);return r.json();}
async function connect(params){const u=new URL('/ws',base);u.protocol='ws:';for(const [k,v] of Object.entries(params))u.searchParams.set(k,v);const ws=new WebSocket(u,{origin:base});sockets.push(ws);await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('Connection timeout')),5000);ws.once('open',()=>{clearTimeout(t);resolve();});ws.once('error',e=>{clearTimeout(t);reject(e);});});return ws;}
function next(ws,predicate){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{ws.off('message',handle);reject(new Error('Event timeout'));},5000);function handle(raw){const event=JSON.parse(raw.toString());if(predicate(event)){clearTimeout(timer);ws.off('message',handle);resolve(event);}}ws.on('message',handle);});}
try{
  const auth=await api('/auth/login',{method:'POST',body:JSON.stringify({email:process.env.OWNER_EMAIL,password:process.env.OWNER_PASSWORD})});
  const headers={Authorization:'Bearer '+auth.token};
  const sites=await api('/sites',{headers});assert.ok(sites.length>=2);
  const site=sites[0];await api('/sites/'+site.id,{method:'PATCH',headers,body:JSON.stringify({domain:'localhost',draftPreviewEnabled:false})});
  const init=await api('/widget/init',{method:'POST',headers:{Origin:base},body:JSON.stringify({siteKey:site.publicKey,pageUrl:base+'/smoke'})});
  const visitor=await connect({siteKey:site.publicKey,visitorToken:init.visitorToken});
  const operator=await connect({token:auth.token});
  const clientId=randomUUID();const incoming=next(operator,e=>e.type==='message'&&e.message.clientId===clientId);visitor.send(JSON.stringify({type:'message',clientId,body:'Smoke visitor message'}));const event=await incoming;
  const duplicate=next(visitor,e=>e.type==='message'&&e.message.clientId===clientId);visitor.send(JSON.stringify({type:'message',clientId,body:'Smoke visitor message'}));await duplicate;
  let detail=await api('/conversations/'+init.conversationId,{headers});assert.equal(detail.messages.filter(m=>m.clientId===clientId).length,1);
  const responseId=randomUUID(),replyEvent=next(visitor,e=>e.type==='message'&&e.message.clientId===responseId);
  const response=await api('/conversations/'+init.conversationId+'/messages',{method:'POST',headers,body:JSON.stringify({clientId:responseId,body:'Smoke operator reply'})});await replyEvent;
  const edited=next(visitor,e=>e.type==='message_updated'&&e.message.id===response.id);await api('/conversations/'+init.conversationId+'/messages/'+response.id,{method:'PATCH',headers,body:JSON.stringify({body:'Edited smoke reply'})});assert.equal((await edited).message.edited,true);
  const denied=await fetch(base+'/api/widget/init',{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost.evil.example'},body:JSON.stringify({siteKey:site.publicKey,pageUrl:'http://localhost.evil.example/'})});assert.equal(denied.status,403);
  detail=await api('/conversations/'+init.conversationId,{headers});assert.ok(detail.messages.some(m=>m.id===event.message.id));
  console.log('PASS: real messages, deduplication, editing and rejected foreign Origin');
}finally{for(const ws of sockets)ws.terminate();}
