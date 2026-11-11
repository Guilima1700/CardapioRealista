-- Run through the Supabase SQL connector. Every fixture is rolled back.
begin;
do $$
declare sid uuid=gen_random_uuid(); host uuid=gen_random_uuid(); guest uuid=gen_random_uuid();
 state jsonb; saved jsonb; o jsonb; duplicate jsonb; rec uuid=gen_random_uuid(); action_id uuid=gen_random_uuid(); baseline integer; price integer;
begin
 select count(*) into baseline from public.orders;
 insert into public.experience_settings values(1,'{"dataMode":"demo"}',null) on conflict(id) do update set data=excluded.data;
 select (data->>'price')::integer into price from public.menu_items where id='brasa-classic';
 state=jsonb_build_object('id',sid,'tableId','table-7','status','editing','version',1,'ownerId',host,'joinClosed',false,'createdAt',now(),'expiresAt',now()+interval '1 hour','roundKey',gen_random_uuid(),'topic',encode(gen_random_bytes(32),'hex'),
 'participants',jsonb_build_array(jsonb_build_object('id',host,'name','HOST TESTE TRANSACIONAL','secretHash','host-test-hash','approved',true,'analyticsSessionId',gen_random_uuid()),jsonb_build_object('id',guest,'name','GUEST TESTE TRANSACIONAL','secretHash','guest-test-hash','approved',true,'analyticsSessionId',gen_random_uuid())),
 'items',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'version',1,'participantId',host,'productId','brasa-classic','quantity',1,'modifierIds',jsonb_build_array('brioche','medium'),'notes','TESTE ROLLBACK','price',1)),'orders','[]'::jsonb);
 insert into public.table_sessions values(sid,'table-7',true,1,now()+interval '1 hour',state);
 saved=public.brasa_save_group(sid,1,action_id,state||jsonb_build_object('status','review','reviewTotal',price));
 if (saved->>'version')::integer<>2 then raise exception 'CAS failed';end if;
 if public.brasa_save_group(sid,1,gen_random_uuid(),state) is not null then raise exception 'stale version accepted';end if;
 if public.brasa_save_group(sid,1,action_id,state)<>saved then raise exception 'mutation duplicate changed state';end if;
 begin perform public.brasa_group_checkout(sid,'guest-test-hash','cashier');raise exception 'guest checkout accepted';exception when others then if sqlerrm='guest checkout accepted' then raise;end if;end;
 o=public.brasa_group_checkout(sid,'host-test-hash','cashier');duplicate=public.brasa_group_checkout(sid,'host-test-hash','cashier');
 if o->>'id'<>duplicate->>'id' or (o->>'total')::integer<>price or o->'items'->0->>'participantName'<>'HOST TESTE TRANSACIONAL' or o->>'dataMode'<>'demo' then raise exception 'checkout snapshot/idempotency failed';end if;
 if (select count(*) from public.orders)<>baseline+1 then raise exception 'duplicate order';end if;
 if not exists(select 1 from public.order_items where order_id=(o->>'id')::uuid and data->>'participantName'='HOST TESTE TRANSACIONAL') then raise exception 'participant missing in kitchen line';end if;
 if o->>'status'='received' then o=public.advance_order((o->>'id')::uuid,'confirmed',(o->>'version')::integer);end if;
 o=public.advance_order((o->>'id')::uuid,'preparing',(o->>'version')::integer);
 o=public.advance_order((o->>'id')::uuid,'ready',(o->>'version')::integer);
 o=public.advance_order((o->>'id')::uuid,'delivered',(o->>'version')::integer);
 if (select data->>'status' from public.table_sessions where id=sid)<>'finished' then raise exception 'group order tracking failed';end if;
 insert into public.order_reviews values(gen_random_uuid(),(o->>'id')::uuid,'table-7',now(),'new',1,jsonb_build_object('food',1,'service',2,'wait',1,'hasProblem',true,'issues',jsonb_build_array('preparation_delay')));
 if (select count(*) from public.analytics_events where order_id=(o->>'id')::uuid and verified)<>3 then raise exception 'verified events missing';end if;
 begin insert into public.order_reviews values(gen_random_uuid(),(o->>'id')::uuid,'table-7',now(),'new',1,'{"food":5,"service":5,"wait":5}');raise exception 'duplicate review accepted';exception when unique_violation then null;end;
 insert into public.commercial_recommendations(id,fingerprint,data) values(rec,rec::text,jsonb_build_object('action','feature','source','demo','end',now()+interval '1 day','productId','brasa-classic'));
 begin perform public.brasa_recommendation_action(rec,1,gen_random_uuid(),'apply','test',false,'');raise exception 'unconfirmed commercial change';exception when others then if sqlerrm='unconfirmed commercial change' then raise;end if;end;
 perform public.brasa_recommendation_action(rec,1,gen_random_uuid(),'apply','test',true,'');
 if (select data->>'featured' from public.menu_items where id='brasa-classic')<>'true' or (select (data->>'price')::integer from public.menu_items where id='brasa-classic')<>price then raise exception 'unsafe recommendation mutation';end if;
 if (select count(*) from public.recommendation_actions where recommendation_id=rec)<>1 then raise exception 'audit missing';end if;
 if has_table_privilege('anon','public.table_sessions','select') or has_table_privilege('authenticated','public.order_reviews','select') or has_function_privilege('anon','public.brasa_group_checkout(uuid,text,text)','execute') then raise exception 'private data exposed';end if;
end $$;
rollback;
select 'PASS: transactional collective, checkout, kitchen, reviews, events, recommendations and grants' as result;
