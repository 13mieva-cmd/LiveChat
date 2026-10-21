export type DraftEvent = {type:'draft';conversationId:string;sessionId:string;text:string};
type Session = {siteId:string;conversationId:string;consent:boolean;pending:string;lastSent:number;sendTimer:ReturnType<typeof setTimeout>|null;expiryTimer:ReturnType<typeof setTimeout>|null};

// emit must deliver only to authenticated operators; never log or persist events.
export class DraftGate {
  private enabled = new Set<string>();
  private sessions = new Map<string,Session>();
  constructor(private emit:(event:DraftEvent)=>void,private intervalMs=600,private ttlMs=15000) {}
  setSiteEnabled(siteId:string,enabled:boolean):void {
    if(enabled){this.enabled.add(siteId);return;}
    this.enabled.delete(siteId);
    for(const [id,s] of this.sessions)if(s.siteId===siteId){s.consent=false;this.clear(id);}
  }
  // sessionId, siteId and conversationId must come from authenticated server context.
  open(sessionId:string,siteId:string,conversationId:string):void {
    this.close(sessionId);
    this.sessions.set(sessionId,{siteId,conversationId,consent:false,pending:'',lastSent:0,sendTimer:null,expiryTimer:null});
  }
  consent(sessionId:string,allowed:boolean):boolean {
    const s=this.sessions.get(sessionId);
    if(!s)return false;
    s.consent=allowed&&this.enabled.has(s.siteId);
    if(!s.consent)this.clear(sessionId);
    return s.consent;
  }
  update(sessionId:string,text:unknown):boolean {
    const s=this.sessions.get(sessionId);
    if(!s||!s.consent||!this.enabled.has(s.siteId)||typeof text!=='string'||text.length>4000)return false;
    if(!text.trim()){this.clear(sessionId);return true;}
    s.pending=text;
    if(s.expiryTimer)clearTimeout(s.expiryTimer);
    s.expiryTimer=setTimeout(()=>{s.consent=false;this.clear(sessionId);},this.ttlMs);
    const delay=Math.max(0,this.intervalMs-(Date.now()-s.lastSent));
    if(!delay){this.flush(sessionId,s);}else if(!s.sendTimer){s.sendTimer=setTimeout(()=>this.flush(sessionId,s),delay);}
    return true;
  }
  private flush(id:string,s:Session):void {
    if(s.sendTimer)clearTimeout(s.sendTimer);s.sendTimer=null;
    if(this.sessions.get(id)!==s||!s.consent||!this.enabled.has(s.siteId)){s.pending='';return;}
    const text=s.pending;s.pending='';s.lastSent=Date.now();
    this.emit({type:'draft',conversationId:s.conversationId,sessionId:id,text});
  }
  clear(sessionId:string):void {
    const s=this.sessions.get(sessionId);if(!s)return;
    if(s.sendTimer)clearTimeout(s.sendTimer);if(s.expiryTimer)clearTimeout(s.expiryTimer);
    s.sendTimer=null;s.expiryTimer=null;s.pending='';
    this.emit({type:'draft',conversationId:s.conversationId,sessionId,text:''});
  }
  close(sessionId:string):void {this.clear(sessionId);this.sessions.delete(sessionId);}
  closeConversation(conversationId:string):void {for(const [id,s] of this.sessions)if(s.conversationId===conversationId)this.close(id);}
  dispose():void {for(const id of this.sessions.keys())this.close(id);this.enabled.clear();}
}
