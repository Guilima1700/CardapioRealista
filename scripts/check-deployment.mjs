// Read-only production checks: no orders, users, or analytics are created.
import assert from 'node:assert/strict';
const input = process.argv[2];
assert.ok(input, 'Uso: node scripts/check-deployment.mjs https://seu-site [token-da-mesa]');
const base = new URL(input);
assert.equal(base.protocol, 'https:', 'A implantação pública precisa usar HTTPS.');
const token = process.argv[3];
async function get(path, options) {
  return fetch(new URL(path, base), { signal: AbortSignal.timeout(30000), ...options });
}
const catalogURL = '/api/catalog' + (token ? '?mesa=' + encodeURIComponent(token) : '');
const response = await get(catalogURL);
assert.equal(response.status, 200, 'Catálogo indisponível');
const catalog = await response.json();
assert.equal(catalog.backend, 'supabase', 'A publicação deve usar o banco persistente Supabase.');
assert.ok(catalog.products.length > 0, 'Nenhum produto publicado.');
if (token) assert.equal(catalog.tables.length, 1, 'QR Code não identifica uma mesa ativa.');
const page = await get('/' + (token ? '?mesa=' + encodeURIComponent(token) : ''));
assert.equal(page.status, 200, 'Página pública indisponível');
const html = await page.text();
assert.ok(html.includes('data-scroll-behavior'), 'HTML principal não foi renderizado.');
const policy = page.headers.get('permissions-policy') || '';
assert.ok(policy.includes('xr-spatial-tracking=(self)'), 'Política espacial ausente.');
assert.ok(policy.includes('camera=(self)'), 'Política de câmera ausente.');
for (const path of ['/api/admin', '/api/orders', '/api/assets?productId=brasa-classic']) {
  const r = await get(path);
  assert.equal(r.status, 401, 'API administrativa acessível sem login: ' + path);
}
const models = catalog.products.filter(p => p.modelUrl && p.model3dEnabled !== false);
const checked = await Promise.all(models.map(async p => {
  const url = new URL(p.modelUrl, base);
  assert.equal(url.protocol, 'https:', 'Modelo precisa usar HTTPS: ' + p.id);
  const r = await get(url, { headers: { Origin: base.origin } });
  assert.equal(r.status, 200, 'Modelo indisponível: ' + p.id);
  assert.match(r.headers.get('content-type') || '', /model\/gltf-binary|application\/octet-stream/, 'MIME inválido: ' + p.id);
  if (url.origin !== base.origin) assert.ok(['*', base.origin].includes(r.headers.get('access-control-allow-origin')), 'CORS inválido: ' + p.id);
  const bytes = Buffer.from(await r.arrayBuffer());
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF', 'GLB inválido: ' + p.id);
  assert.equal(bytes.readUInt32LE(4), 2, 'GLB deve usar versão 2: ' + p.id);
  assert.equal(bytes.readUInt32LE(8), bytes.length, 'GLB incompleto: ' + p.id);
  if (p.usdzUrl) assert.equal((await get(new URL(p.usdzUrl, base), {method:'HEAD'})).status, 200, 'USDZ indisponível: ' + p.id);
  return { product: p.id, bytes: bytes.length, iphone: p.usdzUrl ? 'USDZ próprio' : 'Conversão nativa pelo Model Viewer; testar no aparelho' };
}));
console.log(JSON.stringify({ok:true,site:base.origin,products:catalog.products.length,table:token ? catalog.tables[0].name : 'não verificada',models:checked,protectedAPIs:true,physicalAR:'pendente de teste no aparelho'}, null, 2));
