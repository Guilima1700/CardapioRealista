// Server-side, explicitly invoked asset import. Never prints credentials.
import { loadEnvConfig } from '@next/env';
import { readFile, writeFile } from 'node:fs/promises';
import { productSchema } from '../src/lib/validation';
import type { Product, ProductAsset, Catalog } from '../src/lib/types';
const stageFile = '.tools/ready-demo-stage.json';
const actor = 'brasa-licensed-demo-import';
const q = (s: string) => "'" + s.replaceAll("'", "''") + "'";
const json = (v: unknown) => q(JSON.stringify(v)) + '::jsonb';
async function main() {
  if (!process.argv.includes('--stage') && !process.argv.includes('--publish')) {
    console.log('Use --stage para enviar os arquivos e gerar SQL revisável; aplique o SQL antes de --publish. Execute com node --conditions=react-server --import tsx.');
    return;
  }
  loadEnvConfig(process.cwd());
  process.env.ASSET_BACKEND = 'supabase';
  const { uploadProductAsset, publishProductMedia } = await import('../src/lib/server/assets');
  if (process.argv.includes('--publish')) {
    const stage = JSON.parse(await readFile(stageFile, 'utf8')) as { products: Product[] };
    for (const product of stage.products) {
      await publishProductMedia(productSchema.parse(product), actor);
      console.log(JSON.stringify({ published: product.id }));
    }
    return;
  }
  const base = process.env.BRASA_IMPORT_URL || 'https://cardapio-realista.vercel.app';
  const response = await fetch(base + '/api/catalog');
  if (!response.ok) throw new Error('Catálogo indisponível.');
  const catalog: Catalog = await response.json();
  await writeFile('.tools/ready-demo-catalog-before.json', JSON.stringify(catalog, null, 2));
  let checkpoint: Record<string, ProductAsset> = {};
  try { checkpoint = JSON.parse(await readFile('.tools/ready-demo-uploads.json', 'utf8')); } catch (e: any) { if(e.code !== 'ENOENT') throw e; }
  async function upload(file: string, id: string, name: string) {
    const key = id + ':' + file;
    if (checkpoint[key]) return checkpoint[key];
    const asset = await uploadProductAsset(new File([new Uint8Array(await readFile(file))], file.split('/').pop()!), id, name, actor);
    checkpoint[key] = asset;
    await writeFile('.tools/ready-demo-uploads.json', JSON.stringify(checkpoint, null, 2));
    return asset;
  }
  const products: Product[] = [], sql = ['begin;'];
  for (const original of catalog.products) {
    if (original.id.startsWith('demo-')) continue;
    const image = await upload('public/demo-food/photos/' + original.id + '.jpg', original.id, original.name);
    const product = productSchema.parse({ ...original, image: image.url, imageAssetId: image.id });
    products.push(product);
    // Fail the whole transaction if another administrator changed an image meanwhile.
    sql.push(`do $$ begin if not exists(select 1 from public.menu_items where id=${q(original.id)} and data->>'image' in (${q(original.image)},${q(image.url)})) then raise exception 'Concurrent image change'; end if; end $$;`);
    sql.push(`update public.menu_items set data=data||${json({image:image.url,imageAssetId:image.id})} where id=${q(original.id)};`);
  }
  sql.push(`insert into public.menu_categories values('cafeteria',${json({id:'cafeteria',name:'Cafeteria',icon:'sweet',position:5})}) on conflict(id) do nothing;`);
  for (const item of [
    {id:'demo-croissant',name:'Croissant artesanal',source:'croissant',categoryId:'cafeteria',price:1890,width:18,description:'Croissant de massa folhada. Produto demonstrativo para apresentação de 3D e AR; receita e preço ilustrativos.',ingredients:'Receita demonstrativa: farinha de trigo, manteiga, leite e ovos.',credit:'Modelo demonstrativo: Croissant — Greg Zaal e Dario Barresi / Poly Haven, CC0. Texturas incorporadas e escala ajustada para apresentação; não é o produto de um restaurante contratado.'},
    {id:'demo-bolo-chocolate',name:'Bolo de chocolate e morangos',source:'strawberry_chocolate_cake',categoryId:'desserts',price:8990,width:24,description:'Bolo inteiro com cobertura de chocolate e morangos. Produto demonstrativo; receita, porção e preço ilustrativos.',ingredients:'Receita demonstrativa: chocolate, morangos, farinha, leite e ovos.',credit:'Modelo demonstrativo: Strawberry Chocolate Cake — Kuutti Siitonen / Poly Haven, CC0. Texturas incorporadas e escala ajustada para apresentação; não é o produto de um restaurante contratado.'},
  ]) {
    if (catalog.products.some(p=>p.id===item.id)) continue;
    const model = await upload('public/demo-food/'+item.source+'.glb',item.id,item.name);
    const image = await upload('public/demo-food/previews/'+item.source+'.png',item.id,item.name);
    const product = productSchema.parse({id:item.id,name:item.name,description:item.description,ingredients:item.ingredients,categoryId:item.categoryId,price:item.price,image:image.url,imageAssetId:image.id,available:true,featured:true,badge:'Demo realista',allergens:['Glúten','Leite','Ovos'],prepMinutes:10,groups:[],modelUrl:model.url,modelAssetId:model.id,modelCredit:item.credit,model3dEnabled:true,arEnabled:true,modelPresentation:{cameraTheta:30,cameraPhi:60,cameraRadius:105,exposure:1,autoRotate:true,arScale:'fixed'}});
    products.push(product);
    sql.push(`insert into public.menu_items values(${q(product.id)},${q(product.categoryId)},${json(product)}) on conflict(id) do nothing;`);
  }
  sql.push('commit;');
  await writeFile('.tools/ready-demo-import.sql',sql.join('\n'));
  await writeFile(stageFile,JSON.stringify({base,products},null,2));
  console.log(JSON.stringify({staged:products.length,sql:'.tools/ready-demo-import.sql',checkpointedUploads:Object.keys(checkpoint).length}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
