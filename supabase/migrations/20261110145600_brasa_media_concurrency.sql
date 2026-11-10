-- Serialize publication/archive to preserve active associations under concurrency.
create or replace function public.brasa_publish_product_media(p_document jsonb,p_actor text) returns jsonb
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
      select * into candidate from public.brasa_product_assets where id=asset_id for update;
      if not found or candidate.product_id<>pid or candidate.kind<>kind or candidate.url is distinct from asset_url or candidate.archived_at is not null then raise exception 'Asset does not belong to this product or is archived'; end if;
    elsif asset_url is not null then
      select * into candidate from public.brasa_product_assets where url=asset_url for update;
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
create or replace function public.brasa_archive_product_asset(p_id uuid) returns boolean
language plpgsql set search_path='' as $$
begin
  perform 1 from public.brasa_product_assets where id=p_id for update;
  if exists(select 1 from public.brasa_product_media where image_asset_id=p_id or model_asset_id=p_id or usdz_asset_id=p_id) then
    raise exception 'Detach and save the product before archiving this asset';
  end if;
  update public.brasa_product_assets set archived_at=coalesce(archived_at,now()) where id=p_id;
  return found;
end $$;

