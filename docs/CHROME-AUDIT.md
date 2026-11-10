# Auditoria de funcionamento no Google Chrome — 10/11/2026

## Ambiente

Auditoria autorizada com Playwright e o **Google Chrome instalado, versão 157.0.8103.40**, via `channel: "chrome"`, em modo headless e com perfis de teste separados. O perfil pessoal, suas extensões e configurações não foram modificados. Desenvolvimento foi comparado com produção. Não foram usadas opções para desativar CORS, ORB, segurança da web ou restrições de câmera.

O servidor em `localhost:3000` estava recusando conexões na inspeção inicial. A versão compilada estava em `localhost:3003`; uma página já renderizada no VS Code não comprova que a porta 3000 continua atendendo. As origens/portas também têm cookies e armazenamento independentes.

## Falhas reproduzidas e correções

### Correção posterior: fundo desfocado sem a janela

O vídeo fornecido pelo usuário, de 24,8 segundos, confirmou a falha na porta 3000: por volta de 8,3 s e 18,6 s, o fundo escurecia/desfocava, mas o painel do modal não aparecia. Recarregar com Ctrl+Shift+R inicialmente não resolveu. No Chrome com perfil limpo, inclusive com janela visível e viewport 1920 × 945, o painel aparecia.

O componente compartilhado agora usa classes próprias (`brasa-dialog-layer`, `brasa-dialog-panel`, `brasa-dialog-close`), protegendo os painéis contra regras que atinjam seletores genéricos como `.modal`. O fundo com `backdrop-filter` foi movido para um pseudo-elemento separado, atrás do painel, com ordem explícita de camadas. A animação do fundo também ficou separada do conteúdo. O fluxo de foco, Escape, fechamento, responsividade e tela cheia foi mantido.

Uma reprodução controlada injetou apenas `.modal { display: none !important }` no navegador de teste. A versão anterior mostrou o fundo sem painel; a versão corrigida manteve o painel visível. Isso demonstra a proteção contra esse tipo de conflito, mas não identifica qual regra, extensão ou condição gráfica existia no perfil original. **Após o ajuste, o usuário confirmou que a janela voltou a aparecer no próprio Chrome.**

Foi acrescentado um teste de regressão em desktop e celular, com rolagem, personalização, adição à sacola e abertura do painel da mesa sob esse conflito de CSS. Os avisos Lit continuaram sendo emitidos no desenvolvimento; não foram filtrados nem usados como diagnóstico da falha visual.

O build com a correção também foi reiniciado na porta 3003 e passou pela conferência final de cardápio, carregamento real do GLB, rotação, zoom, tela cheia e sacola, sem erros ou avisos no console. Registro local: `.tools/chrome-production-modal-fix.json`.

| Problema observado | Causa | Correção |
| --- | --- | --- |
| Cliques ignorados durante o carregamento inicial | Controles do HTML SSR habilitados antes da hidratação e da carga dos dados | Controles dependentes de JavaScript aguardam hidratação; navegação administrativa aguarda também os dados. Login, cardápio e cozinha receberam a proteção. |
| Favoritos derrubavam a página com `includes is not a function` | JSON persistido aceito sem validar se era uma lista de IDs | Leitura validada e valores inválidos tratados sem apagar outros dados do navegador. |
| `SecurityError` com armazenamento bloqueado | Escritas não protegidas em `localStorage` | Operações de persistência protegidas; estado continua em React e a sacola informa que deve permanecer aberta. A chave de idempotência permanece em memória durante retentativas. |
| Adicionar item em HTTP não seguro derrubava a interface | `crypto.randomUUID` indisponível fora de contexto seguro | UUID v4 com `crypto.getRandomValues` como alternativa criptográfica, compartilhada pelos identificadores do cliente. Nenhum uso de `Math.random`. |
| Escape em tela cheia fechava também o produto | Atalho global do modal sempre chamava `onClose` | Escape sai primeiro da tela cheia, preservando o produto e suas opções. |
| Hidratação falhava com React #418 em outro fuso | Horários/datas renderizados no fuso implícito de cada ambiente | Acompanhamento e cozinha usam o fuso já configurado no restaurante; o relógio inicial da cozinha é fornecido pelo servidor. |
| Imagens de Smoked Bacon e Limonada bloqueadas por ORB | Duas URLs externas retornavam **404 e HTML**, em vez de imagem | Imagens demonstrativas válidas importadas para o Storage, e cópias locais incluídas no seed. Preços, adicionais, modelos e IDs preservados. |
| Requisição automática de ícone retornava 404 | Ausência de ícone declarado | Adicionado `src/app/icon.svg` pela convenção de metadata do Next. |
| Aviso de scroll durante navegação | CSS com `scroll-behavior: smooth` sem indicação ao Next | Declarado `data-scroll-behavior="smooth"` no elemento HTML. |

A estratégia para hidratação segue a [orientação do Playwright](https://playwright.dev/docs/navigations#hydration). O atributo de scroll segue a [orientação do Next.js](https://nextjs.org/docs/messages/missing-data-scroll-behavior).

## APIs, Storage e visualizador

O Chrome carregou o GLB real do Supabase com HTTP 200, `Content-Type: model/gltf-binary` e `Access-Control-Allow-Origin: *`. O modelo exibiu largura de 16 cm, rotação, zoom e restauração de câmera. Não foi necessário modificar políticas CORS ou RLS.

Também foram exercitados o formulário de login, consultas administrativas autenticadas, acervo, flags de AR, upload de GLTF autocontido, normalização para GLB e prévia pelo Storage. O arquivo criado pela auditoria foi arquivado sem publicar sua associação; o produto existente foi preservado. Um GLB deliberadamente inexistente produziu 404 e mensagem de erro, com nova tentativa e bloqueio de publicação pela interface. Esses erros provocados aparecem nos registros de teste e não foram filtrados do console.

O fluxo de pedidos continua usando os mesmos endpoints, produtos e regras de preço. Os testes de pedido e cozinha usam **banco SQLite novo e isolado**, definido pelo servidor de testes, sem inserir pedidos de auditoria na operação principal. Um teste confirma o caso de resposta perdida após o servidor registrar o pedido: a nova tentativa reutiliza a chave e mantém um único pedido. O cliente acompanha preparo, pronto e entrega.

## Executar as verificações

```powershell
npm run typecheck
npm test
npm run test:e2e
npm run test:chrome
npm run build
node scripts/check-viewer-build.mjs
```

`test:chrome` requer Google Chrome instalado. Usa a mesma infraestrutura isolada dos testes HTTP, em execução separada, e cobre bloqueio de scripts antes da hidratação, favoritos inválidos, tela cheia, GLTF, erro de modelo, storage bloqueado, retentativa idempotente, cozinha e fuso horário diferente. Os testes não simulam suporte espacial de AR.

Validação final após a correção dos modais: **19 testes unitários, 10 testes de integração HTTP e 7 testes no Google Chrome passaram**, sem testes ignorados. TypeScript também passou. A sequência de cozinha foi conferida por cliques reais nos botões, resposta PATCH, consulta do estado persistido e atualização automática da página do cliente.

O build final de produção passou. A inspeção dos 47 arquivos JavaScript emitidos encontrou os runtimes Lit, sem os marcadores de desenvolvimento examinados de Lit e React DOM. Após reiniciar esse build na porta 3003, a conferência adicional no Chrome passou nos seis cenários de cardápio/visualizador/sacola: **nenhum erro JavaScript, aviso de console, resposta HTTP de erro ou falha de requisição foi registrado**. O GLB público real do Supabase retornou 200 e carregou com controles de câmera ativos. Registro local: `.tools/chrome-production-final.json`.

Durante a execução a frio em `next dev`, foram observados recarregamentos de Fast Refresh que interrompiam o teste de cozinha. O teste prepara a rota dinâmica antes de abrir as duas páginas e aguarda a primeira consulta automática da cozinha. Essa preparação retorna 404 para um ID inexistente e não altera pedidos. Nenhuma lógica da aplicação foi removida para acomodar o teste.

Para confirmar a limitação de HTTP, o Chrome também foi executado com um hostname de teste resolvido para a máquina local. O navegador informou `isSecureContext=false` e `randomUUID` ausente; as proteções foram mantidas.

## Compatibilidade e limites

Os avisos Lit de desenvolvimento continuam classificados em [MODEL-VIEWER-WARNINGS.md](MODEL-VIEWER-WARNINGS.md). A produção é inspecionada separadamente para verificar a ausência do código de desenvolvimento dessas bibliotecas. Avisos do runner sobre cores e o aviso experimental de `node:sqlite` pertencem ao ambiente de teste/Node e não foram ocultados.

No Chrome desktop, `canActivateAR=false` apresentou a alternativa 3D, sem câmera simulada. HTTP por IP/nome de rede não substitui HTTPS para AR. HTTPS também não garante AR: é preciso suporte real do dispositivo, navegador e plataforma.

**Dependem de aparelhos físicos:** autorização/recusa de câmera, WebXR/ARCore, detecção de superfície, ancoragem na mesa, gestos e escala percebida em Android; Scene Viewer; Safari/Quick Look em iPhone/iPad e validação de USDZ próprio. Perfis pessoais com extensões, políticas corporativas ou drivers diferentes também podem demandar diagnóstico específico. As verificações feitas com perfil isolado não certificam essas configurações particulares.

## Imagens demonstrativas

As URLs quebradas foram reparadas por `scripts/repair-demo-images.ts`, que só substitui os dois endereços antigos conhecidos e preserva fotografias personalizadas. O backup anterior ficou em `.tools/image-repair-before.json`, ignorado pelo Git. Não há exclusão de arquivos originais.

- Hambúrguer: reaproveita a fotografia ilustrativa original já associada ao Brasa Classic na demonstração.
- Bebida cítrica: [Louis Hansel no Unsplash](https://unsplash.com/photos/lemonade-in-glass-on-the-table-x33agN5W5TI), disponível sob a [licença Unsplash](https://unsplash.com/license). Arquivo local: `public/images/demo-lemonade.jpg`.

Essas imagens são demonstrativas e devem ser substituídas pelas fotografias reais do restaurante na implantação comercial.
