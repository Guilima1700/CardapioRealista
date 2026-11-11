-- One restaurant. Anonymous browser credentials stay hashed inside service-only state.
create table public.experience_settings(id integer primary key check(id=1),data jsonb not null,pin_hash text);
create table public.table_sessions(id uuid primary key,table_id text not null references public.restaurant_tables(id),active boolean not null default true,version integer not null default 1,expires_at timestamptz not null,data jsonb not null);
create unique index group_active_table_idx on public.table_sessions(table_id) where active;
create index group_expiry_idx on public.table_sessions(active,expires_at);
create table public.session_actions(session_id uuid not null references public.table_sessions(id),mutation_id uuid not null,primary key(session_id,mutation_id));
create table public.order_reviews(id uuid primary key,order_id uuid not null unique references public.orders(id),table_id text not null references public.restaurant_tables(id),created_at timestamptz not null,status text not null default 'new' check(status in ('new','analysis','handling','resolved')),version integer not null default 1,data jsonb not null);
create index reviews_created_idx on public.order_reviews(created_at,status);
create table public.commercial_recommendations(id uuid primary key,fingerprint text not null unique,status text not null default 'new' check(status in ('new','applied','ignored','resolved')),version integer not null default 1,created_at timestamptz not null default now(),data jsonb not null);
create table public.recommendation_actions(id uuid primary key,recommendation_id uuid not null references public.commercial_recommendations(id),actor text not null,action text not null,created_at timestamptz not null,data jsonb not null);
create index recommendation_actions_rec_idx on public.recommendation_actions(recommendation_id,created_at);
create table public.experience_rate_limits(key text primary key,count integer not null,expires_at bigint not null);
alter table public.analytics_events add column table_id text references public.restaurant_tables(id),add column order_id uuid references public.orders(id),add column metadata jsonb not null default '{}',add column verified boolean not null default false;
alter table public.analytics_events drop constraint analytics_events_type_check;
alter table public.analytics_events add constraint analytics_events_type_check check(type in ('menu_open','category_view','product_view','model_view','ar_start','product_customize','modifier_select','recommendation_view','recommendation_click','add_to_cart','remove_from_cart','checkout_start','order_confirmed','order_completed','review_submitted','group_join'));
create unique index verified_order_event_idx on public.analytics_events(order_id,type) where verified;
create index analytics_session_type_idx on public.analytics_events(session_id,type,created_at);
do $$declare t text;begin foreach t in array array['experience_settings','table_sessions','session_actions','order_reviews','commercial_recommendations','recommendation_actions','experience_rate_limits'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
end loop;end$$;

create function public.brasa_save_group(p_id uuid,p_version integer,p_mutation uuid,p_state jsonb) returns jsonb language plpgsql set search_path='' as $$
declare s public.table_sessions%rowtype; result jsonb;
begin
 select * into s from public.table_sessions where id=p_id for update;
 if not found or not s.active or s.expires_at<=now() then raise exception 'APP:Sessão encerrada ou expirada.'; end if;
 if exists(select 1 from public.session_actions where session_id=p_id and mutation_id=p_mutation) then return s.data; end if;
 if s.version<>p_version then return null; end if;
 result=p_state||jsonb_build_object('version',s.version+1);
 update public.table_sessions set version=s.version+1,data=result,active=coalesce(result->>'status','') not in ('closed','expired') where id=p_id;
 insert into public.session_actions values(p_id,p_mutation); return result;
end $$;

create function public.brasa_review_event() returns trigger language plpgsql set search_path='' as $$
declare o public.orders%rowtype;
begin
 select * into o from public.orders where id=new.order_id;
 insert into public.analytics_events(type,session_id,created_at,table_id,order_id,metadata,verified)
 values('review_submitted',coalesce(nullif(o.data->>'analyticsSessionId','')::uuid,o.id),new.created_at,new.table_id,new.order_id,jsonb_build_object('dataMode',coalesce(o.data->>'dataMode','production')),true)
 on conflict(order_id,type) where verified do nothing;
 return new;
end $$;
create trigger experience_review after insert on public.order_reviews for each row execute function public.brasa_review_event();

create function public.brasa_recommendation_action(p_id uuid,p_version integer,p_mutation uuid,p_action text,p_actor text,p_confirmed boolean,p_text text) returns boolean language plpgsql set search_path='' as $$
declare r public.commercial_recommendations%rowtype; rec jsonb; p jsonb; gs jsonb; opts jsonb; g jsonb; opt jsonb; result jsonb; st text; cfg jsonb; found_modifier boolean=false;
begin
 select * into r from public.commercial_recommendations where id=p_id for update;
 if not found then raise exception 'APP:Recomendação não encontrada.'; end if;
 if exists(select 1 from public.recommendation_actions where id=p_mutation and recommendation_id=p_id) then return true; end if;
 if r.version<>p_version then raise exception 'APP:Recomendação atualizada. Recarregue o painel.'; end if;
 rec=r.data;st=r.status;
 if p_action='apply' then
  if not p_confirmed then raise exception 'APP:Confirme a alteração antes de aplicar.'; end if;
  if st not in ('new','applied') then raise exception 'APP:Esta recomendação já foi encerrada.'; end if;
  select data into cfg from public.experience_settings where id=1;
  if rec->>'source'<>coalesce(cfg->>'dataMode','production') then raise exception 'APP:A fonte da recomendação deve corresponder ao modo atual da instalação.'; end if;
  if (rec->>'end')::timestamptz<now()-interval '7 days' then raise exception 'APP:Recomendação desatualizada. Gere uma análise recente.'; end if;
  if rec->>'action' in ('feature','description','modifier','pair') then
   select data into p from public.menu_items where id=rec->>'productId' for update;
   if p is null or not (p->>'available')::boolean then raise exception 'APP:Produto indisponível.'; end if;
   if rec->>'action'='feature' then p=p||'{"featured":true}'::jsonb;
   elsif rec->>'action'='description' then
    if length(trim(p_text)) not between 1 and 1000 then raise exception 'APP:Escreva a descrição (até 1.000 caracteres).'; end if;
    p=jsonb_set(p,'{description}',to_jsonb(trim(p_text)));
   elsif rec->>'action'='modifier' then
    gs='[]';for g in select value from jsonb_array_elements(p->'groups') loop
     opts='[]';for opt in select value from jsonb_array_elements(g->'options') loop
      if opt->>'id'=rec->>'modifierId' then opt=opt||'{"featured":true}'::jsonb;found_modifier=true;end if;
      opts=opts||jsonb_build_array(opt);
     end loop;gs=gs||jsonb_build_array(g||jsonb_build_object('options',opts));
    end loop;
    if not found_modifier then raise exception 'APP:Adicional não encontrado.'; end if;
    p=jsonb_set(p,'{groups}',gs);
   else
    if not exists(select 1 from public.menu_items where id=rec->>'relatedId' and (data->>'available')::boolean) then raise exception 'APP:Acompanhamento indisponível.'; end if;
    rec=rec||'{"publicEnabled":true}'::jsonb;
   end if;
   update public.menu_items set data=p where id=rec->>'productId';
  elsif rec->>'action'='campaign' then
   if length(trim(p_text)) not between 1 and 240 then raise exception 'APP:Escreva a mensagem da campanha (até 240 caracteres).'; end if;
   rec=rec||jsonb_build_object('publicEnabled',true,'campaignText',trim(p_text));
  else raise exception 'APP:Ação de recomendação inválida.';end if;
  st='applied';
 elsif p_action='ignore' then st='ignored';elsif p_action='resolve' then st='resolved';elsif p_action='disable' then rec=rec||'{"publicEnabled":false}'::jsonb;
 else raise exception 'APP:Operação inválida.';end if;
 if st in ('ignored','resolved') then rec=rec||'{"publicEnabled":false}'::jsonb;end if;
 update public.commercial_recommendations set data=rec,status=st,version=version+1 where id=p_id;
 insert into public.recommendation_actions values(p_mutation,p_id,p_actor,p_action,now(),jsonb_build_object('before',r.data,'after',rec,'status',st,'text',p_text));
 return true;
end $$;
revoke execute on function public.brasa_review_event(),public.brasa_recommendation_action(uuid,integer,uuid,text,text,boolean,text) from public,anon,authenticated;
grant execute on function public.brasa_review_event(),public.brasa_recommendation_action(uuid,integer,uuid,text,text,boolean,text) to service_role;

create function public.brasa_group_checkout(p_id uuid,p_hash text,p_payment text) returns jsonb language plpgsql set search_path='' as $$
declare s public.table_sessions%rowtype; m jsonb; line jsonb; member jsonb; lines jsonb='[]'; r jsonb; tbl jsonb; existing jsonb;
begin
 select * into s from public.table_sessions where id=p_id for update;
 if not found or not s.active or s.expires_at<=now() then raise exception 'APP:Sessão encerrada ou expirada.'; end if;
 select value into m from jsonb_array_elements(s.data->'participants') where value->>'secretHash'=p_hash and (value->>'approved')::boolean;
 if m is null or m->>'id'<>s.data->>'ownerId' then raise exception 'APP:Somente o responsável pode confirmar.'; end if;
 select data into existing from public.orders where idempotency_key=(s.data->>'roundKey')::uuid;
 if existing is not null then return existing; end if;
 if s.data->>'status'<>'review' then raise exception 'APP:Revise o pedido antes de confirmar.'; end if;
 select data into tbl from public.restaurant_tables where id=s.table_id;
 for line in select value from jsonb_array_elements(s.data->'items') loop
   select value into member from jsonb_array_elements(s.data->'participants') where value->>'id'=line->>'participantId' and (value->>'approved')::boolean;
   if member is null then raise exception 'APP:Participante inválido.'; end if;
   lines=lines||jsonb_build_array((line-'id'-'version')||jsonb_build_object('participantName',member->>'name','analyticsSessionId',member->>'analyticsSessionId'));
 end loop;
 r=public.place_order(jsonb_build_object('tableToken',tbl->>'token','idempotencyKey',s.data->>'roundKey','payment',p_payment,'items',lines,'analyticsSessionId',m->>'analyticsSessionId'));
 if (r->>'total')::integer<>(s.data->>'reviewTotal')::integer then raise exception 'APP:Os preços mudaram. Volte à edição e revise novamente.'; end if;
 r=r||jsonb_build_object('groupSessionId',s.id);
 update public.orders set data=r where id=(r->>'id')::uuid;
 update public.order_items oi set data=priced.value from jsonb_array_elements(r->'items') priced(value) where oi.order_id=(r->>'id')::uuid and oi.data=priced.value;
 update public.table_sessions set version=version+1,data=s.data||jsonb_build_object('status','sent','version',s.version+1,'orders',(s.data->'orders')||jsonb_build_array(r),'joinClosed',true) where id=s.id;
 return r;
end $$;

create function public.brasa_group_invalidate() returns trigger language plpgsql set search_path='' as $$
begin
 -- No names, items, credentials, prices, or identifiers in this notification.
 perform realtime.send(jsonb_build_object('version',new.version),'changed','group:'||(new.data->>'topic'),false);
 return new;
end $$;
create trigger group_invalidate after insert or update on public.table_sessions for each row execute function public.brasa_group_invalidate();

create function public.brasa_order_experiences() returns trigger language plpgsql set search_path='' as $$
declare et text; sid uuid; s public.table_sessions%rowtype; entries jsonb; next_status text;
begin
 et=case when tg_op='INSERT' then 'order_confirmed' when new.status='delivered' and old.status<>'delivered' then 'order_completed' else null end;
 if et is not null then
  sid=coalesce(nullif(new.data->>'analyticsSessionId','')::uuid,new.id);
  insert into public.analytics_events(type,session_id,created_at,table_id,order_id,metadata,verified) values(et,sid,case when et='order_confirmed' then new.created_at else (new.data->>'updatedAt')::timestamptz end,new.table_id,new.id,jsonb_build_object('dataMode',coalesce(new.data->>'dataMode','production')),true) on conflict(order_id,type) where verified do nothing;
 end if;
 if new.data->>'groupSessionId' is not null then
  select * into s from public.table_sessions where id=(new.data->>'groupSessionId')::uuid for update;
  if found and exists(select 1 from jsonb_array_elements(s.data->'orders') where value->>'id'=new.id::text) then
   select jsonb_agg(case when value->>'id'=new.id::text then new.data else value end) into entries from jsonb_array_elements(s.data->'orders');
   next_status=case when s.data->>'roundKey'=new.idempotency_key::text and s.data->>'status' not in ('closed','expired') then case new.status when 'preparing' then 'preparing' when 'ready' then 'preparing' when 'delivered' then 'finished' else 'sent' end else s.data->>'status' end;
   update public.table_sessions set version=version+1,data=data||jsonb_build_object('orders',entries,'status',next_status,'version',version+1) where id=s.id;
  end if;
 end if;
 return new;
end $$;
create trigger experience_order after insert or update on public.orders for each row execute function public.brasa_order_experiences();

create function public.brasa_experience_throttle(p_key text,p_until bigint) returns boolean language plpgsql set search_path='' as $$
declare n integer;
begin
 delete from public.experience_rate_limits where expires_at<(extract(epoch from now())*1000)::bigint;
 insert into public.experience_rate_limits values(p_key,1,p_until) on conflict(key) do update set count=public.experience_rate_limits.count+1 returning count into n;
 return n<=10;
end $$;
revoke execute on function public.brasa_save_group(uuid,integer,uuid,jsonb),public.brasa_group_checkout(uuid,text,text),public.brasa_group_invalidate(),public.brasa_order_experiences(),public.brasa_experience_throttle(text,bigint) from public,anon,authenticated;
grant execute on function public.brasa_save_group(uuid,integer,uuid,jsonb),public.brasa_group_checkout(uuid,text,text),public.brasa_group_invalidate(),public.brasa_order_experiences(),public.brasa_experience_throttle(text,bigint) to service_role;

-- Checkout metadata extension; pricing and transaction rules are preserved.
create or replace function public.place_order(p_request jsonb) returns jsonb language plpgsql set search_path='' as $$
declare cfg jsonb; tbl jsonb; p jsonb; line jsonb; g jsonb; opt jsonb; selected jsonb; selections jsonb; items jsonb='[]';
  unit integer; qty integer; total_value integer=0; chosen integer; result jsonb; existing public.orders%rowtype;
  order_id uuid=gen_random_uuid(); tracking uuid=gen_random_uuid(); seq integer; initial_status text; at timestamptz=now(); history jsonb;
begin
  select * into existing from public.orders where idempotency_key=(p_request->>'idempotencyKey')::uuid;
  if found then
    if not exists(select 1 from public.restaurant_tables where id=existing.table_id and token=p_request->>'tableToken') then raise exception 'APP:Chave de pedido inválida.'; end if;
    return existing.data;
  end if;
  select data into cfg from public.restaurant_settings where id=1 for update;
  -- Recheck after serializing concurrent attempts with the same idempotency key.
  select * into existing from public.orders where idempotency_key=(p_request->>'idempotencyKey')::uuid;
  if found then
    if not exists(select 1 from public.restaurant_tables where id=existing.table_id and token=p_request->>'tableToken') then raise exception 'APP:Chave de pedido inválida.'; end if;
    return existing.data;
  end if;
  if not (cfg->>'open')::boolean then raise exception 'APP:A casa está fechada para novos pedidos.'; end if;
  select data into tbl from public.restaurant_tables where token=p_request->>'tableToken' and (data->>'active')::boolean for share;
  if tbl is null then raise exception 'APP:Mesa inválida. Escaneie o QR Code novamente.'; end if;
  if not (cfg->'payments' ? (p_request->>'payment')) then raise exception 'APP:Pagamento indisponível.'; end if;
  if jsonb_array_length(p_request->'items') not between 1 and 30 then raise exception 'APP:Quantidade de itens inválida.'; end if;
  for line in select value from jsonb_array_elements(p_request->'items') loop
    select data into p from public.menu_items where id=line->>'productId' and (data->>'available')::boolean for share;
    if p is null then raise exception 'APP:Um produto está indisponível.'; end if;
    qty=(line->>'quantity')::integer;
    if qty not between 1 and 20 then raise exception 'APP:Quantidade inválida.'; end if;
    selections=line->'modifierIds'; selected='[]'; unit=(p->>'price')::integer;
    if jsonb_array_length(selections)<>(select count(distinct value) from jsonb_array_elements_text(selections)) then raise exception 'APP:Adicionais duplicados.'; end if;
    for g in select value from jsonb_array_elements(p->'groups') loop
      chosen=0;
      for opt in select value from jsonb_array_elements(g->'options') loop
        if selections ? (opt->>'id') then selected=selected||jsonb_build_array(opt); unit=unit+(opt->>'price')::int; chosen=chosen+1; end if;
      end loop;
      if chosen<(g->>'min')::int or chosen>(g->>'max')::int then raise exception 'APP:Revise as opções do produto.'; end if;
    end loop;
    if jsonb_array_length(selected)<>jsonb_array_length(selections) then raise exception 'APP:Adicional inválido.'; end if;
    total_value=total_value+unit*qty;
    items=items||jsonb_build_array(jsonb_build_object('productId',p->>'id','quantity',qty,'modifierIds',selections,'notes',coalesce(line->>'notes',''),'name',p->>'name','unitPrice',unit,'total',unit*qty,'modifiers',selected,'allergens',p->'allergens','participantId',line->>'participantId','participantName',line->>'participantName','analyticsSessionId',line->>'analyticsSessionId'));
  end loop;
  seq=nextval('public.order_number_seq'); initial_status=case when (cfg->>'sendImmediately')::boolean then 'confirmed' else 'received' end;
  history=jsonb_build_array(jsonb_build_object('status','received','at',at));
  if initial_status='confirmed' then history=history||jsonb_build_array(jsonb_build_object('status','confirmed','at',at)); end if;
  result=jsonb_build_object('id',order_id,'number',seq,'tableId',tbl->>'id','tableName',tbl->>'name','trackingToken',tracking,'idempotencyKey',p_request->>'idempotencyKey','createdAt',at,'updatedAt',at,'status',initial_status,'version',1,'total',total_value,'payment',p_request->>'payment','items',items,'history',history,'analyticsSessionId',p_request->>'analyticsSessionId','dataMode',coalesce((select data->>'dataMode' from public.experience_settings where id=1),'production'));
  insert into public.orders(id,number,tracking_token,idempotency_key,table_id,status,version,total,created_at,data) values(order_id,seq,tracking,(p_request->>'idempotencyKey')::uuid,tbl->>'id',initial_status,1,total_value,at,result);
  return result;
end $$;

