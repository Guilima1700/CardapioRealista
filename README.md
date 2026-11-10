# Brasa · Cardápio 3D e operação do restaurante

Produto-base para **um restaurante por instalação**. Next.js App Router, React, TypeScript, Tailwind CSS, Google Model Viewer, Zod e Recharts. PostgreSQL/Supabase é o backend de implantação; SQLite permite demonstrar a operação sem credenciais externas. Não há tenants, cobrança de assinatura ou superadministrador.

**Implementação 3D/AR atual:** o Supabase conectado está configurado para arquivos e associações de mídia, com uploads reais, prévia administrativa, escala física e GLB público. Login e pedidos existentes continuam no SQLite. Consulte [operação, configuração e limites de homologação 3D/AR](docs/3D-AR.md). Não copie `.env.example` sobre o `.env.local` já configurado desta máquina.

## Executar a demonstração

Requer Node.js **22.13+** (usa `node:sqlite`) e npm.

```powershell
npm ci
Copy-Item .env.example .env.local
# Preencha SESSION_SECRET com pelo menos 32 caracteres aleatórios.
# Exemplo de geração (copie apenas para seu arquivo local):
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
npm run dev -- --hostname 127.0.0.1
```

Nesta entrega, `.env.local` já foi criado localmente com segredo aleatório e está ignorado pelo Git. Não o distribua entre clientes.

- Cardápio: `http://127.0.0.1:3000`
- Acesso da equipe: `/equipe`
- Administração: `/admin`
- Cozinha: `/cozinha`
- Credenciais **da demonstração SQLite**: `admin@brasa.local` / `Demo@2026!`
- Mesa de demonstração: `/?mesa=brasa-mesa-7-demo`

O administrador local é criado somente na primeira inicialização do banco. Alterar `DEMO_ADMIN_PASSWORD` depois disso não troca a senha já gravada. Para uma nova implantação, use um banco novo e credenciais exclusivas. Funcionários adicionais são criados na administração; o papel cozinha não acessa a gestão.

O banco fica em `data/brasa.sqlite`, com WAL e chaves estrangeiras. Carrinho e favoritos ficam no navegador; **pedidos, produtos, preços, equipe e eventos ficam no banco do servidor**. Os dados persistem após reiniciar. Não há pedidos ou métricas inventados no seed.

## Roteiro de apresentação

1. Entre em `/equipe` em outra aba e abra `/cozinha`. Ative o som por um clique.
2. No admin, abra **QR Codes**, informe um endereço acessível no celular e baixe ou imprima o QR da mesa.
3. No celular, escaneie o código. A mesa é vinculada pelo token do QR, sem conta do cliente.
4. Abra **Brasa Classic → Modelo 3D**, gire e amplie o modelo. Em um dispositivo compatível e HTTPS, use **Ver na minha mesa**.
5. Escolha pão, ponto, adicionais e observações. Adicione à sacola e revise itens, quantidade e pagamento com a equipe.
6. Confirme. O pedido recebe número único e aparece na cozinha.
7. Na cozinha: começar preparo → marcar como pronto → confirmar entrega. Acompanhe a mesma mudança na tela do cliente.
8. Mostre o gerenciamento de produtos, modelos, mesas e indicadores reais no admin.

No SQLite, cozinha e acompanhamento consultam o servidor a cada **2,5 segundos**. Na instalação Supabase há Realtime com reconciliação por consulta. Não há funcionamento offline para confirmar pedidos: se a rede cair, o carrinho é preservado e o envio pode ser repetido usando a mesma chave de idempotência.

## Configurar backend completo em um ambiente novo

Crie **um projeto Supabase separado para cada restaurante**. O frontend e as APIs também pertencem à instalação do cliente.

Esta seção descreve a opção de migrar toda a operação para Supabase em uma implantação nova. O projeto conectado nesta entrega utiliza o módulo de mídia descrito em [3D-AR.md](docs/3D-AR.md), preservando autenticação e pedidos existentes. Não execute indiscriminadamente `db push` sobre ele: a migration de fundação antiga não consta no histórico remoto.

1. Aplique `supabase/migrations/202611090001_foundation.sql` no SQL Editor do projeto, ou use o Supabase CLI com `supabase link --project-ref SEU_REF` e `supabase db push`.
2. Aplique `supabase/seed.sql` se quiser iniciar com o cardápio demonstrativo. Ele não apaga dados existentes. Para gerar tokens de mesa novos antes de uma nova implantação, rode `npx tsx scripts/seed-sql.ts` e aplique o arquivo gerado **apenas no banco novo**.
3. No painel Auth, crie o primeiro usuário administrador, com senha exclusiva.
4. Associe o usuário à equipe pelo SQL Editor:

```sql
insert into public.staff_users(id,email,role,active)
select id,email,'admin',true from auth.users
where email = 'administrador@seu-restaurante.com';
```

5. Desative cadastro público de usuários na configuração Auth do projeto hospedado. `supabase/config.toml` já faz isso no ambiente local do CLI.
6. Preencha as variáveis abaixo e reinicie/recompile o Next.js:

```dotenv
DATA_BACKEND=supabase
NEXT_PUBLIC_DATA_BACKEND=supabase
NEXT_PUBLIC_APP_URL=https://cardapio.seu-restaurante.com
SESSION_SECRET=SEGREDO_ALEATORIO_EXCLUSIVO_COM_32_OU_MAIS_CARACTERES
NEXT_PUBLIC_SUPABASE_URL=https://SEU_PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=CHAVE_PUBLICA_ANON
SUPABASE_SERVICE_ROLE_KEY=CHAVE_SECRETA_SOMENTE_NO_SERVIDOR
```

Nunca prefixe a service role com `NEXT_PUBLIC_`. Ela é usada exclusivamente nos módulos `server-only`, após autorização de cada API. A chave pública não concede leitura dos pedidos a visitantes anônimos. Realtime da cozinha usa JWT de um funcionário ativo e uma política RLS de leitura. Transações RPC de checkout e mudança de status são executáveis somente pela service role.

O bucket público `product-assets` é criado pela migration para imagens e modelos. Apenas o servidor autorizado envia arquivos. A URL pública é necessária para Scene Viewer e Quick Look; não use esse bucket para conteúdo privado.

**Verificação atual:** o módulo de mídia foi implantado via MCP e testado no Supabase real, incluindo Storage e RPCs de associação/arquivamento. O backend completo de pedidos em PostgreSQL é uma opção separada e não foi ativado. A ancoragem AR em aparelhos físicos ainda exige homologação em HTTPS.

## Produção e persistência

```powershell
npm ci
npm run typecheck
npm test
npm run test:e2e
npm run build
npm start -- --hostname 0.0.0.0
```

Use um host Node.js 22.13+ com HTTPS no proxy. Com Supabase, o estado persistente reside em PostgreSQL e Storage. Com SQLite, é obrigatório um volume persistente em `DATA_DIR`; não use filesystem efêmero de funções serverless. SQLite é voltado à demonstração e instalações de servidor único. Para operação comercial e múltiplas instâncias, configure Supabase.

Proteja as variáveis de ambiente, configure backup do PostgreSQL/Storage e faça uma restauração de ensaio. No SQLite, use backup consistente do SQLite ou pare o processo antes de copiar o banco, incluindo WAL quando aplicável; faça backup também de `data/uploads`. As URLs dos arquivos enviados são atendidas por uma rota própria, inclusive quando o upload acontece depois do build.

O limitador de tentativas do servidor é por processo. Em uma instalação pública com várias instâncias, aplique também limitação de tráfego no proxy/WAF ou armazenamento compartilhado. O proxy deve sobrescrever os cabeçalhos de IP encaminhado e preservar o Host correto. O acesso da equipe é protegido por cookie HttpOnly assinado, SameSite=Lax e Secure quando a URL configurada é HTTPS; sessões duram até oito horas e cada operação confirma se o funcionário permanece ativo.

## Variáveis

| Variável | Uso |
|---|---|
| `DATA_BACKEND` | `sqlite` ou `supabase`; seleção efetiva do servidor |
| `NEXT_PUBLIC_DATA_BACKEND` | Identificação pública do ambiente, se necessário |
| `NEXT_PUBLIC_APP_URL` | Origem pública e endereço inicial dos QR Codes |
| `SESSION_SECRET` | Assinatura de sessões; obrigatório em produção, mínimo 32 caracteres |
| `DEMO_ADMIN_EMAIL` | Administrador inicial do SQLite |
| `DEMO_ADMIN_PASSWORD` | Senha inicial SQLite; obrigatória na inicialização em produção |
| `DATA_DIR` | Diretório persistente SQLite e uploads; padrão `./data` |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave pública para Auth/Realtime |
| `SUPABASE_SERVICE_ROLE_KEY` | Acesso de servidor; nunca enviar ao navegador |
| `NEXT_DIST_DIR` | Diretório de build alternativo; testes usam `.next-e2e` |

## Organização

```text
src/app/                  Páginas App Router, APIs e rota de arquivos
src/components/           Cardápio, produto/3D, sacola, cozinha e gestão
src/lib/types.ts          Contratos de domínio e valores em centavos
src/lib/validation.ts     Validação Zod, preço e transições
src/lib/seed.ts           Catálogo inicial centralizado
src/lib/server/db.ts      Adaptadores persistentes SQLite / Supabase
src/lib/server/auth.ts    Login, papéis e sessão de equipe
src/lib/server/http.ts    Erros, origem, limites e tamanho do corpo
src/lib/use-live.ts       Realtime, reconexão e recuperação por consulta
supabase/migrations/      DDL, índices, constraints, RLS, RPC e Storage
supabase/seed.sql         Catálogo de demonstração para PostgreSQL
public/models/            Modelos GLB geométricos originais
scripts/                  Geração dos GLBs e seed SQL
tests/                    Regras de domínio e integração HTTP isolada
```

## Banco de dados

| Entidade | Responsabilidade |
|---|---|
| `restaurant_settings` | Uma única configuração, `id=1` |
| `restaurant_tables` | Mesas, tokens únicos, disponibilidade |
| `menu_categories` | Categorias e ordenação |
| `menu_items` | Produto, preço em centavos, opções, fotos e modelos |
| `modifier_groups`, `modifiers` | Projeções relacionais dos grupos/opções no PostgreSQL |
| `item_variants` | View das opções de escolha única (pão, tamanho, ponto etc.) |
| `product_assets` | Projeção de imagem, modelo e USDZ por produto |
| `orders` | Número único, mesa, chave idempotente, token de consulta, versão e snapshot |
| `order_items` | Snapshot do preço, ingredientes selecionados, quantidade e observações |
| `order_status_history` | Histórico persistente das transições |
| `staff_users` | Funcionários, papel e ativação; no Supabase referencia `auth.users` |
| `analytics_events` | Visualizações e interações reais, com sessão pseudônima |
| `integration_outbox` | Eventos duráveis, únicos por pedido/versão, para futuros adaptadores de impressão/PDV |

Produtos e configurações usam documentos JSON tipados; PostgreSQL mantém projeções de modificadores e arquivos por trigger. Pedidos preservam snapshots, portanto editar um produto não altera um pedido já confirmado. O SQLite guarda produtos/opções como JSON e tem tabelas próprias para pedidos, itens, histórico e eventos.

`place_order` bloqueia a configuração durante o checkout, lê preços atuais no banco, verifica disponibilidade/mesa/pagamento/opções e insere tudo na mesma transação. Idempotência tem constraint única. `advance_order` exige versão e próxima etapa; não permite retrocesso nem saltos. Toda alteração é registrada no histórico.

## Personalizar uma nova instalação

1. Prepare banco, domínio, Storage, credenciais e segredo próprios.
2. Entre em **Configurações** e ajuste nome, assinatura da marca, logo, cor, tipografia, foto principal, endereço, horário e fuso. Nome e assinatura são compartilhados pelo cardápio e acesso da equipe.
3. Configure categorias e posição; cadastre produtos com ingredientes, alérgenos, tempo, disponibilidade e preço.
4. Na aba **Personalizações** do produto, crie grupos obrigatórios/opcionais, quantidades mínimas/máximas e preços das opções. Tamanhos e variações usam grupos de escolha única. Para remover ingredientes, crie opções sem custo ou use observações.
5. Em **Arquivos & 3D**, envie imagens, GLB e USDZ ou associe URLs HTTPS. Ajuste os créditos e a descrição do modelo.
6. Cadastre mesas e gere os QR Codes do domínio correto. Os tokens do seed SQLite são demonstrativos; para uma instalação comercial use o seed Supabase com UUIDs novos ou crie mesas novas pelo admin.
7. Escolha confirmação imediata ou confirmação manual e habilite pagamento na mesa/no caixa.
8. Crie os funcionários e valide permissões. Faça um pedido completo pelo celular antes de apresentar/operar.

## Modelos 3D e AR

Os GLBs incluídos são **geometrias originais estilizadas**, geradas por `node scripts/generate-models.mjs`: burger simples, burger duplo e batatas. Não são fotogrametria nem reprodução fiel das fotografias. A personalização é funcional e **não muda esses modelos**. O seed associa os arquivos a alguns produtos para demonstrar o visualizador.

O modelo é carregado sob demanda ao abrir um produto com 3D habilitado. Model Viewer fornece órbita, zoom, rotação automática, tela cheia e os modos `webxr scene-viewer quick-look`. O botão de AR depende de `canActivateAR`, contexto seguro e carregamento do modelo. O desktop continua com 3D convencional. O Quick Look pode gerar USDZ a partir do GLB; para qualidade controlada no iOS, associe um USDZ validado.

Para modelos de produção: use metros, origem na base, escala física correta, materiais PBR, malhas e texturas otimizadas; procure manter cada GLB abaixo de 10 MB. O upload permite até 30 MB, aceita GLB, GLTF autocontido e USDZ, e normaliza a cena GLB. GLTF remoto é aceito por URL HTTPS, mas seus buffers e texturas precisam ser acessíveis por CORS. A calibração opcional e as restrições dos modelos comprimidos estão em [3D-AR.md](docs/3D-AR.md). Não há conversão automática de foto para modelo.

No celular, `127.0.0.1` aponta para o próprio telefone. Use um endereço acessível de rede para 3D; AR exige **HTTPS válido** e suporte real do aparelho. Teste Safari/iOS com Quick Look e Android compatível com Scene Viewer/WebXR. Não ignore intersticiais de certificado. Modelos externos devem permitir CORS e downloads pelos visualizadores nativos.

## Relatórios e pagamentos

Pedidos, ticket médio, unidades mais vendidas, visualizações, categorias, 3D, AR, mesas e horários são calculados a partir do banco no período selecionado. O relatório exporta CSV. O gráfico mostra até os últimos 30 dias do período; a consulta é limitada a 2.000 pedidos e 50.000 eventos recentes. Instalações maiores precisam de agregações paginadas/materializadas.

**Valor de pedidos não é faturamento recebido**. Não existe conciliação financeira nesta demonstração. A conversão exibida é vista → carrinho por sessões distintas, não uma atribuição de receita. Pagamento é no caixa/na mesa, sem captura de cartão. Uma integração online futura deve usar provedor real, pedidos de pagamento no servidor, assinatura de webhooks, idempotência e reconciliação; nunca confirmar pagamento pela resposta do navegador.

## Verificação

Para a auditoria com Google Chrome instalado, execute `npm run test:chrome`. Os cenários reproduzidos, as correções e os limites de validação física estão em [CHROME-AUDIT.md](docs/CHROME-AUDIT.md).

O diagnóstico dos avisos de Lit/Model Viewer e o ajuste de ciclo de vida estão em [MODEL-VIEWER-WARNINGS.md](docs/MODEL-VIEWER-WARNINGS.md). Após o build, `node scripts/check-viewer-build.mjs` verifica se o JavaScript de navegador contém os runtimes de produção, sem os marcadores de desenvolvimento do Lit e React DOM.

```powershell
npm run typecheck
npm test
npm run test:e2e
npm run build
```

Os testes de domínio verificam preços, adulteração de valores, quantidades, grupos obrigatórios, duplicações, disponibilidade, configuração e transições. Os testes de integração iniciam servidor próprio na porta 3100, diretório `.next-e2e` e um banco SQLite novo em `data/test-*`. Testam acesso público/administrativo, concorrência idempotente, cozinha, rastreamento, catálogo, uploads, analytics, papéis de equipe e confirmação manual. Não usam dados da demonstração principal.

## Limites e próximos serviços

- O módulo de mídia Supabase está configurado e verificado. AR físico depende de HTTPS e aparelhos Android/iOS para homologação final; o backend completo de pedidos Supabase não foi ativado nesta instalação.
- Não há pagamento online, emissão fiscal, PDV ou envio a impressora térmica nesta entrega. Nenhum botão simula essas operações.
- A integração futura de impressão/PDV deve consumir `integration_outbox` após commit. O contrato `src/lib/server/integrations.ts` define o adaptador; nenhum envio externo está ativado. Implemente deduplicação pelo ID do evento, retentativa e marcação de `processed_at` apenas após confirmação do dispositivo/PDV. Não imprima dentro da transação do pedido.
- Personalização visual modular de 3D depende de malhas/materiais produzidos para isso; os modelos atuais não são modulares.
- Fotos demonstrativas usam URLs do Unsplash; para cada cliente, envie fotos licenciadas e próprias no gerenciador. Não dependa de URLs externas para um acervo definitivo.
- Não há cancelamento/estorno nem alteração de itens depois da confirmação. Ajustes posteriores são tratados com a equipe; um fluxo de cancelamento auditado deve ser desenvolvido junto da política do restaurante.
