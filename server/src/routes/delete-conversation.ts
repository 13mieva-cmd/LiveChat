import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from '../db.js';
import { requireOperator } from '../auth.js';
import { broadcast } from '../ws.js';

const snapshot=z.object({lastActivityAt:z.string().datetime({offset:true}),closedAt:z.string().datetime({offset:true})});
export async function deleteConversationRoutes(app:FastifyInstance):Promise<void>{
  app.delete('/conversations/:id',{preHandler:requireOperator},async(request,reply)=>{
    const params=z.object({id:z.string().uuid()}).safeParse(request.params),body=snapshot.safeParse(request.body);
    if(!params.success||!body.success)return reply.code(400).send({error:'Обновите диалог перед удалением'});
    const id=params.data.id;
    const result=await sql.begin(async tx=>{
      const [row]=await tx`SELECT id,status,(date_trunc('milliseconds',last_activity_at)=${body.data.lastActivityAt}::timestamptz AND date_trunc('milliseconds',closed_at)=${body.data.closedAt}::timestamptz) AS unchanged FROM conversations WHERE id=${id} FOR UPDATE`;
      if(!row)return 'missing';
      if(row.status!=='closed'||row.unchanged!==true)return 'changed';
      const [queue]=await tx`SELECT to_regclass('lc_push_jobs') AS relation`;
      if(queue?.relation)await tx`DELETE FROM lc_push_jobs j USING messages m WHERE j.message_id=m.id::text AND m.conversation_id=${id}`;
      await tx`DELETE FROM conversations WHERE id=${id}`;
      return 'deleted';
    });
    if(result==='missing')return reply.code(404).send({error:'Диалог уже удалён или не найден'});
    if(result==='changed')return reply.code(409).send({error:'Диалог изменился или снова открыт. Проверьте переписку и подтвердите удаление заново.'});
    broadcast('operators',{type:'conversation_deleted',conversationId:id});
    return {ok:true,conversationId:id};
  });
}
