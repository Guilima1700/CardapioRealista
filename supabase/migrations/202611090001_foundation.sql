-- One restaurant per database. All public operations go through the Next.js server.
create extension if not exists pgcrypto;
create table public.restaurant_settings(id integer primary key check(id=1),data jsonb not null);
create table public.menu_categories(id text primary key,data jsonb not null);
create table public.menu_items(id text primary key,category_id text not null references public.menu_categories(id),data jsonb not null,
  constraint item_price check ((data->>'price')::integer between 0 and 1000000),
  constraint item_identity check (data->>'id'=id and data->>'categoryId'=category_id));
create index menu_items_category_idx on public.menu_items(category_id);
create table public.restaurant_tables(id text primary key,token text unique not null,data jsonb not null,
  constraint table_identity check(data->>'id'=id and data->>'token'=token));
create table public.modifier_groups(id text not null,item_id text not null references public.menu_items(id) on delete cascade,name text not null,min_count integer not null check(min_count>=0),max_count integer not null check(max_count>=min_count),primary key(item_id,id));
create table public.modifiers(id text not null,item_id text not null,group_id text not null,name text not null,price integer not null check(price>=0),primary key(item_id,id),foreign key(item_id,group_id) references public.modifier_groups(item_id,id) on delete cascade);
create view public.item_variants with (security_invoker=true) as select m.* from public.modifiers m join public.modifier_groups g on g.item_id=m.item_id and g.id=m.group_id where g.max_count=1;
create table public.product_assets(id uuid primary key default gen_random_uuid(),product_id text not null references public.menu_items(id) on delete cascade,url text not null,kind text not null check(kind in ('image','model','usdz')),created_at timestamptz not null default now(),unique(product_id,kind));
create table public.staff_users(id uuid primary key references auth.users(id) on delete cascade,email text unique not null,role text not null check(role in ('admin','kitchen')),active boolean not null default true);
create sequence public.order_number_seq;
create table public.orders(
  id uuid primary key default gen_random_uuid(),number integer not null unique default nextval('public.order_number_seq'),
  tracking_token uuid not null unique,idempotency_key uuid not null unique,table_id text not null references public.restaurant_tables(id),
  status text not null check(status in ('received','confirmed','preparing','ready','delivered')),
  version integer not null check(version>0),total integer not null check(total>=0),created_at timestamptz not null default now(),data jsonb not null,
  constraint order_identity check(data->>'id'=id::text and data->>'status'=status and (data->>'version')::integer=version and (data->>'total')::integer=total)
);
create index orders_created_idx on public.orders(created_at desc);
create index orders_status_idx on public.orders(status,created_at);
create table public.order_items(id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id) on delete cascade,product_id text not null,quantity integer not null check(quantity between 1 and 20),unit_price integer not null check(unit_price>=0),data jsonb not null);
create index order_items_order_idx on public.order_items(order_id);
create index order_items_product_idx on public.order_items(product_id);
create table public.order_status_history(id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id) on delete cascade,status text not null check(status in ('received','confirmed','preparing','ready','delivered')),at timestamptz not null default now());
create index history_order_idx on public.order_status_history(order_id,at);
create table public.analytics_events(id uuid primary key default gen_random_uuid(),type text not null check(type in ('product_view','model_view','ar_start','add_to_cart','category_view')),product_id text references public.menu_items(id) on delete set null,category_id text references public.menu_categories(id) on delete set null,session_id uuid not null,created_at timestamptz not null default now());
create index analytics_date_idx on public.analytics_events(created_at desc);
create index analytics_product_idx on public.analytics_events(product_id,type,created_at);
create index analytics_category_idx on public.analytics_events(category_id,type,created_at);
create table public.integration_outbox(id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id),version integer not null,event_type text not null check(event_type in ('order.created','order.status_changed')),payload jsonb not null,created_at timestamptz not null default now(),processed_at timestamptz,attempts integer not null default 0 check(attempts>=0),unique(order_id,version));
create index outbox_pending_idx on public.integration_outbox(created_at) where processed_at is null;

create function public.sync_product_relations() returns trigger language plpgsql set search_path='' as $$
declare g jsonb; o jsonb;
begin
  delete from public.modifier_groups where item_id=new.id;
  for g in select value from jsonb_array_elements(coalesce(new.data->'groups','[]')) loop
    insert into public.modifier_groups values(g->>'id',new.id,g->>'name',(g->>'min')::int,(g->>'max')::int);
    for o in select value from jsonb_array_elements(g->'options') loop
      insert into public.modifiers values(o->>'id',new.id,g->>'id',o->>'name',(o->>'price')::int);
    end loop;
  end loop;
  delete from public.product_assets where product_id=new.id;
  if coalesce(new.data->>'image','')<>'' then insert into public.product_assets(product_id,url,kind) values(new.id,new.data->>'image','image'); end if;
  if coalesce(new.data->>'modelUrl','')<>'' then insert into public.product_assets(product_id,url,kind) values(new.id,new.data->>'modelUrl','model'); end if;
  if coalesce(new.data->>'usdzUrl','')<>'' then insert into public.product_assets(product_id,url,kind) values(new.id,new.data->>'usdzUrl','usdz'); end if;
  return new;
end $$;
create trigger sync_product after insert or update on public.menu_items for each row execute function public.sync_product_relations();

create function public.sync_order_relations() returns trigger language plpgsql set search_path='' as $$
declare i jsonb; h jsonb;
begin
  if tg_op='INSERT' then
    for i in select value from jsonb_array_elements(new.data->'items') loop
      insert into public.order_items(order_id,product_id,quantity,unit_price,data) values(new.id,i->>'productId',(i->>'quantity')::int,(i->>'unitPrice')::int,i);
    end loop;
    for h in select value from jsonb_array_elements(new.data->'history') loop
      insert into public.order_status_history(order_id,status,at) values(new.id,h->>'status',(h->>'at')::timestamptz);
    end loop;
  elsif old.status<>new.status then
    insert into public.order_status_history(order_id,status,at) values(new.id,new.status,(new.data->>'updatedAt')::timestamptz);
  end if;
  insert into public.integration_outbox(order_id,version,event_type,payload) values(new.id,new.version,case when tg_op='INSERT' then 'order.created' else 'order.status_changed' end,new.data-'trackingToken'-'idempotencyKey') on conflict(order_id,version) do nothing;
  return new;
end $$;
create trigger sync_order after insert or update on public.orders for each row execute function public.sync_order_relations();

-- Service-only transactional checkout. Prices and selections are rebuilt in PostgreSQL.
create function public.place_order(p_request jsonb) returns jsonb language plpgsql set search_path='' as $$
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
    items=items||jsonb_build_array(jsonb_build_object('productId',p->>'id','quantity',qty,'modifierIds',selections,'notes',coalesce(line->>'notes',''),'name',p->>'name','unitPrice',unit,'total',unit*qty,'modifiers',selected,'allergens',p->'allergens'));
  end loop;
  seq=nextval('public.order_number_seq'); initial_status=case when (cfg->>'sendImmediately')::boolean then 'confirmed' else 'received' end;
  history=jsonb_build_array(jsonb_build_object('status','received','at',at));
  if initial_status='confirmed' then history=history||jsonb_build_array(jsonb_build_object('status','confirmed','at',at)); end if;
  result=jsonb_build_object('id',order_id,'number',seq,'tableId',tbl->>'id','tableName',tbl->>'name','trackingToken',tracking,'idempotencyKey',p_request->>'idempotencyKey','createdAt',at,'updatedAt',at,'status',initial_status,'version',1,'total',total_value,'payment',p_request->>'payment','items',items,'history',history);
  insert into public.orders(id,number,tracking_token,idempotency_key,table_id,status,version,total,created_at,data) values(order_id,seq,tracking,(p_request->>'idempotencyKey')::uuid,tbl->>'id',initial_status,1,total_value,at,result);
  return result;
end $$;

create function public.advance_order(p_id uuid,p_status text,p_version integer) returns jsonb language plpgsql set search_path='' as $$
declare o public.orders%rowtype; expected text; result jsonb; at timestamptz=now();
begin
  select * into o from public.orders where id=p_id for update;
  if not found or o.version<>p_version then raise exception 'APP:Pedido atualizado por outra pessoa.'; end if;
  expected=case o.status when 'received' then 'confirmed' when 'confirmed' then 'preparing' when 'preparing' then 'ready' when 'ready' then 'delivered' else null end;
  if expected is null or p_status<>expected then raise exception 'APP:Transição de status inválida.'; end if;
  result=o.data||jsonb_build_object('status',p_status,'version',o.version+1,'updatedAt',at,'history',(o.data->'history')||jsonb_build_array(jsonb_build_object('status',p_status,'at',at)));
  update public.orders set status=p_status,version=o.version+1,data=result where id=p_id;
  return result;
end $$;

-- SECURITY DEFINER has a fixed empty search_path and exposes only a boolean.
create function public.is_staff() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.staff_users where id=auth.uid() and active)$$;
revoke all on all tables in schema public from anon,authenticated;
revoke all on all sequences in schema public from anon,authenticated;
revoke execute on function public.place_order(jsonb),public.advance_order(uuid,text,integer),public.sync_product_relations(),public.sync_order_relations() from public,anon,authenticated;
revoke execute on function public.is_staff() from public,anon;
grant execute on function public.is_staff() to authenticated,service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on function public.place_order(jsonb),public.advance_order(uuid,text,integer) to service_role;
do $$declare tbl text;begin foreach tbl in array array['restaurant_settings','menu_categories','menu_items','restaurant_tables','modifier_groups','modifiers','product_assets','staff_users','orders','order_items','order_status_history','analytics_events','integration_outbox'] loop execute format('alter table public.%I enable row level security',tbl);end loop;end$$;
grant select on public.orders to authenticated;
create policy staff_read_orders on public.orders for select to authenticated using(public.is_staff());
alter publication supabase_realtime add table public.orders;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('product-assets','product-assets',true,31457280,array['model/gltf-binary','model/vnd.usdz+zip','image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
-- Uploads use the service role only, after application authorization. No anonymous write policy.
