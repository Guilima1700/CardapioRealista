-- Additive integrity and lookup indexes; existing orders retain their snapshots.
alter table public.orders add column group_session_id uuid references public.table_sessions(id);
create index orders_group_session_idx on public.orders(group_session_id) where group_session_id is not null;
create index reviews_table_date_idx on public.order_reviews(table_id,created_at);
create index analytics_table_date_idx on public.analytics_events(table_id,created_at);
create index analytics_order_idx on public.analytics_events(order_id) where order_id is not null;
create index recommendations_source_date_idx on public.commercial_recommendations((data->>'source'),created_at desc);
alter table public.table_sessions add constraint session_version_positive check(version>0),add constraint session_state_valid check(coalesce(data->>'status' in ('waiting','editing','review','sent','preparing','finished','closed','expired'),false)),add constraint session_arrays_valid check(coalesce(jsonb_typeof(data->'participants')='array' and jsonb_array_length(data->'participants') between 1 and 24 and jsonb_typeof(data->'items')='array' and jsonb_array_length(data->'items')<=30,false));
alter table public.order_reviews add constraint review_ratings_valid check(coalesce((data->>'food')::integer between 1 and 5 and (data->>'service')::integer between 1 and 5 and (data->>'wait')::integer between 1 and 5,false));
alter table public.order_reviews add constraint review_version_positive check(version>0);
alter table public.commercial_recommendations add constraint recommendation_version_positive check(version>0);

create or replace function public.brasa_group_checkout(p_id uuid,p_hash text,p_payment text) returns jsonb language plpgsql set search_path='' as $$
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
 update public.orders set data=r,group_session_id=s.id where id=(r->>'id')::uuid;
 update public.order_items oi set data=priced.value from jsonb_array_elements(r->'items') priced(value) where oi.order_id=(r->>'id')::uuid and oi.data=priced.value;
 update public.table_sessions set version=version+1,data=s.data||jsonb_build_object('status','sent','version',s.version+1,'orders',(s.data->'orders')||jsonb_build_array(r),'joinClosed',true) where id=s.id;
 return r;
end $$;

