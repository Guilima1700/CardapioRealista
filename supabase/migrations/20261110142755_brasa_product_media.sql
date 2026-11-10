-- Additive media module. Does not move or modify existing orders/staff/catalog.
create table public.brasa_media_products(
  id text primary key check(length(id)<=100), name text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.brasa_product_assets(
  id uuid primary key, product_id text not null references public.brasa_media_products(id),
  kind text not null check(kind in ('image','model','usdz')), url text not null unique,
  bucket text not null default 'brasa-product-media' check(bucket='brasa-product-media'),
  object_path text not null unique, original_name text not null, byte_size integer not null check(byte_size>0 and byte_size<=31457280),
  mime text not null, sha256 text not null check(length(sha256)=64), dimensions jsonb,
  created_by text not null, created_at timestamptz not null default now(), archived_at timestamptz
);
create index brasa_assets_product_idx on public.brasa_product_assets(product_id,created_at desc);
create index brasa_assets_active_idx on public.brasa_product_assets(product_id) where archived_at is null;
create table public.brasa_product_media(
  product_id text primary key references public.brasa_media_products(id),
  image_asset_id uuid references public.brasa_product_assets(id), model_asset_id uuid references public.brasa_product_assets(id), usdz_asset_id uuid references public.brasa_product_assets(id),
  data jsonb not null, version integer not null default 1 check(version>0),
  updated_by text not null, updated_at timestamptz not null default now(),
  check(not coalesce((data->>'arEnabled')::boolean,false) or (coalesce((data->>'model3dEnabled')::boolean,false) and coalesce(data->>'modelUrl','')<>''))
);
create table public.brasa_media_request_nonces(id uuid primary key,expires_at timestamptz not null,created_at timestamptz not null default now());
create index brasa_media_nonces_expiry_idx on public.brasa_media_request_nonces(expires_at);
alter table public.brasa_media_products enable row level security;
alter table public.brasa_product_assets enable row level security;
alter table public.brasa_product_media enable row level security;
alter table public.brasa_media_request_nonces enable row level security;
revoke all on public.brasa_media_products,public.brasa_product_assets,public.brasa_product_media,public.brasa_media_request_nonces from anon,authenticated;
grant all on public.brasa_media_products,public.brasa_product_assets,public.brasa_product_media,public.brasa_media_request_nonces to service_role;

create function public.brasa_publish_product_media(p_document jsonb,p_actor text) returns jsonb
language plpgsql set search_path='' as $$
declare pid text=p_document->>'productId'; field text; asset_id uuid; asset_url text; kind text; candidate public.brasa_product_assets%rowtype;
  image_id uuid; model_id uuid; usdz_id uuid; result jsonb;
begin
  if pid is null or pid !~ '^[a-z0-9-]{1,100}$' then raise exception 'Invalid product'; end if;
  insert into public.brasa_media_products(id,name) values(pid,p_document->>'name')
    on conflict(id) do update set name=excluded.name,updated_at=now();
  perform 1 from public.brasa_media_products where id=pid for update;
  foreach field in array array['image','modelUrl','usdzUrl'] loop
    kind=case field when 'image' then 'image' when 'modelUrl' then 'model' else 'usdz' end;
    asset_url=nullif(p_document->>field,'');
    asset_id=nullif(p_document->>(case field when 'image' then 'imageAssetId' when 'modelUrl' then 'modelAssetId' else 'usdzAssetId' end),'')::uuid;
    if asset_id is not null then
      select * into candidate from public.brasa_product_assets where id=asset_id;
      if not found or candidate.product_id<>pid or candidate.kind<>kind or candidate.url is distinct from asset_url or candidate.archived_at is not null then raise exception 'Asset does not belong to this product or is archived'; end if;
    elsif asset_url is not null then
      select * into candidate from public.brasa_product_assets where url=asset_url;
      if found then
        if candidate.product_id<>pid or candidate.kind<>kind or candidate.archived_at is not null then raise exception 'Asset belongs to another product or is archived'; end if;
        asset_id=candidate.id;
      end if;
    end if;
    case kind when 'image' then image_id=asset_id; when 'model' then model_id=asset_id; else usdz_id=asset_id; end case;
  end loop;
  insert into public.brasa_product_media(product_id,image_asset_id,model_asset_id,usdz_asset_id,data,updated_by)
  values(pid,image_id,model_id,usdz_id,p_document,p_actor)
  on conflict(product_id) do update set image_asset_id=excluded.image_asset_id,model_asset_id=excluded.model_asset_id,usdz_asset_id=excluded.usdz_asset_id,data=excluded.data,version=public.brasa_product_media.version+1,updated_by=p_actor,updated_at=now()
  returning jsonb_build_object('ok',true,'version',version) into result;
  return result;
end $$;
create function public.brasa_archive_product_asset(p_id uuid) returns boolean
language plpgsql set search_path='' as $$
begin
  if exists(select 1 from public.brasa_product_media where image_asset_id=p_id or model_asset_id=p_id or usdz_asset_id=p_id) then
    raise exception 'Detach and save the product before archiving this asset';
  end if;
  update public.brasa_product_assets set archived_at=coalesce(archived_at,now()) where id=p_id;
  return found;
end $$;
revoke execute on function public.brasa_publish_product_media(jsonb,text),public.brasa_archive_product_asset(uuid) from public,anon,authenticated;
grant execute on function public.brasa_publish_product_media(jsonb,text),public.brasa_archive_product_asset(uuid) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('brasa-product-media','brasa-product-media',true,31457280,array['model/gltf-binary','model/vnd.usdz+zip','image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
-- Public URL downloads only. No anon/authenticated INSERT/UPDATE/DELETE policy.
-- Writes use the existing Brasa staff authorization + signed, scoped Edge requests.
-- Removing an association/archive does not delete binary objects or historical data.
