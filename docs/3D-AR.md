# Brasa — operação dos modelos 3D e AR

## Entrega e referência

O vídeo fornecido (26 segundos, 384 × 832) foi inspecionado por quadros ao longo de toda a duração e no encerramento. Ele mostra cardápio móvel, modelos realistas de refeições em destaque, fundo claro, câmera inclinada, rotação e informações do prato abaixo do visualizador. Esses princípios orientam a implementação. Não há nele uma sessão de câmera com ancoragem espacial demonstrada; a AR foi implementada pelos mecanismos nativos do Model Viewer, sem sobreposição simulada sobre vídeo.

Os três GLBs originais da demonstração são geométricos e ilustrativos, associados a quatro produtos. Não representam digitalização dos pratos. O crédito visível informa isso; adicionais alteram o pedido e o preço, sem alterar a geometria. Para o realismo do vídeo, forneça modelos produzidos por fotogrametria/modelagem, com licença e medidas verificadas. Uma fotografia convencional não é convertida em 3D pelo sistema.

## Cadastrar e publicar

1. Entre em `/equipe` com um administrador. Abra **Modelos 3D → Gerenciar arquivos** ou **Produtos → Arquivos & 3D**.
2. Envie a fotografia JPG, PNG ou WebP e o modelo GLB/GLTF. Cada arquivo aceita até 30 MB. O acervo é vinculado ao ID do produto existente.
3. Para GLTF, incorpore buffers e texturas em base64 antes do envio. O servidor o transforma em um único GLB. Arquivos com dependências externas são recusados com mensagem de orientação. URLs HTTPS externas continuam aceitas, desde que recursos e CORS funcionem nos visualizadores nativos.
4. Opcionalmente informe **Largura real ao enviar o modelo (cm)** antes do upload. O servidor mede os vértices, centraliza a cena e grava origem na base e escala em metros no GLB. Assim Scene Viewer recebe o arquivo calibrado, sem depender de transformações apenas no navegador. Sem largura informada, os metros originais são preservados. Modelos Draco/Meshopt ou com posições sparse devem vir calibrados da ferramenta 3D; o sistema recusa recalibração desses formatos em vez de estimar a largura. Dimensões de modelos animados ou com deformações correspondem à geometria estática de referência.
5. Confira a prévia. Ajuste ângulo lateral, inclinação, enquadramento, iluminação e rotação automática. Use gestos, mouse ou teclado para inspecionar; o controle de restauração retorna ao enquadramento configurado.
6. Ative **Habilitar visualização 3D** e **Habilitar “Ver na minha mesa”** conforme desejado. Desmarque **Permitir redimensionar em AR** para manter a escala física fixa.
7. Para maior controle no iPhone/iPad, envie também um USDZ com a mesma origem e medidas do GLB. O USDZ não é recalibrado pelo servidor. Na ausência dele, o Model Viewer pode gerar USDZ para Quick Look; materiais avançados e animações exigem validação no aparelho.
8. Salve o produto. Um modelo novo precisa carregar na prévia antes da publicação pela interface. Se o carregamento falhar, há mensagem e nova tentativa. O cardápio obtém as alterações por atualização periódica (30 segundos), foco ou recarga.

Upload não publica imediatamente. **Usar** seleciona um arquivo do acervo; **Salvar produto** publica a associação. Para remover, escolha **Remover associação** e salve. Depois é possível **Arquivar** o arquivo sem uso. Arquivos associados ficam protegidos contra arquivamento. Arquivar oculta o registro do acervo; não apaga o binário público nem invalida URLs já compartilhadas. Não há botão de exclusão física nesta entrega.

## AR e compatibilidade

O botão **Ver na minha mesa** chama `activateAR()` após o modelo carregar, com `ar-modes="webxr scene-viewer quick-look"`. A disponibilidade depende de `canActivateAR` e contexto seguro; não é deduzida apenas pelo sistema operacional.

| Ambiente | Experiência |
| --- | --- |
| Android com WebXR/ARCore e navegador compatível | Sessão espacial no navegador, detecção de superfície horizontal, posicionamento e orientações de rastreamento |
| Android com Scene Viewer disponível | Aplicativo nativo abre o GLB público e controla superfície, câmera e gestos |
| iOS/iPadOS com Quick Look | Visualizador nativo abre USDZ fornecido ou gerado a partir do GLB |
| Aparelho/navegador sem AR ou contexto inseguro | 3D interativo e mensagem clara; botão AR indisponível |

A câmera é solicitada pelo navegador/visualizador nativo quando a sessão começa; não usamos `getUserMedia` como falsa AR. Permissões recusadas e falhas de inicialização mantêm a alternativa 3D. Gestos e menus nativos variam; interface HTML personalizada só acompanha WebXR. Consultar [exemplos oficiais do Model Viewer](https://modelviewer.dev/examples/augmentedreality/).

Produção exige HTTPS válido e arquivos públicos acessíveis pelo telefone e pelos aplicativos nativos. `127.0.0.1` no celular aponta para o próprio celular. O Next envia `Permissions-Policy: camera=(self), xr-spatial-tracking=(self)`. Se incorporar a aplicação em iframe, o hospedeiro também deve conceder a política espacial apropriada.

## Supabase realmente configurado

Projeto conectado por MCP/OAuth: `hwfqinuifxquunqwrbza` (**brasa-production**). Na inspeção inicial, não havia tabelas públicas, migrations, buckets ou usuários Auth. Por isso a implementação adiciona um módulo isolado de mídia e preserva o banco SQLite, sessões, funcionários e fluxo de pedidos já operantes. Não ativa um segundo fluxo de compra nem migra silenciosamente a autenticação para um Auth vazio.

- Bucket público: `brasa-product-media`, limite de 30 MB, MIME restritos a GLB, USDZ, JPG, PNG e WebP. Downloads públicos por URL; gravações e listagem administrativa não são públicas.
- `brasa_media_products`: espelho mínimo do ID/nome do produto, sem preços ou pedidos paralelos.
- `brasa_product_assets`: arquivo, produto, tipo, URL, hash, tamanho, medidas, autor e arquivamento.
- `brasa_product_media`: associação publicada e configuração, com versão.
- `brasa_media_request_nonces`: prevenção de repetição de requisições administrativas.
- Migrations aplicadas: `20261110142755_brasa_product_media.sql` e `20261110145600_brasa_media_concurrency.sql`. A migration antiga `202611090001_foundation.sql` é uma opção para nova implantação completa, não foi aplicada neste projeto remoto existente.
- Edge Function implantada: `brasa-media`. APIs Next exigem administrador e verificam origem/arquivo. Só então assinam uma ação específica, corpo e identidade com Ed25519, validade de 60 segundos e nonce único. A Edge valida assinatura/hash/prazo/repetição e usa sua própria credencial interna para Storage/RPC. O navegador recebe apenas URLs e chave publicável.
- `verify_jwt=false` na Edge é intencional: a autorização obrigatória é a assinatura própria, e não a chave publicável do Supabase. Chamadas sem assinatura recebem 401. Nenhuma chave privilegiada foi colocada no frontend ou solicitada ao usuário.
- As quatro tabelas têm RLS e nenhum privilégio de leitura/escrita para `anon`/`authenticated`. O acesso administrativo passa pela Edge autorizada. O advisor registra quatro avisos **informativos** de RLS sem políticas; neste módulo isso é negação por padrão intencional, não acesso aberto. [Descrição oficial desse aviso](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
- Publicação e arquivamento bloqueiam as linhas dos arquivos para impedir uma associação ativa a um arquivo arquivado em operações concorrentes. Não foram removidas políticas ou dados existentes.

O catálogo SQLite continua sendo a fonte de verdade exibida aos clientes. A publicação grava primeiro a validação/associação remota e depois o produto local. Se a gravação local falhar após o sucesso remoto, repita o salvamento pelo admin; a associação remota é um espelho, não substitui preços nem gera pedidos. Faça backup do SQLite e do Storage.

## Ambiente e nova instalação

Além das variáveis já existentes, use:

```dotenv
DATA_BACKEND=sqlite
NEXT_PUBLIC_DATA_BACKEND=sqlite
ASSET_BACKEND=supabase
NEXT_PUBLIC_SUPABASE_URL=https://SEU_PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=CHAVE_PUBLICAVEL
BRASA_ASSET_PRIVATE_KEY=PKCS8_BASE64_SOMENTE_NO_SERVIDOR
```

O `.env.local` desta máquina já está configurado, ignorado pelo Git. Não substitua nem distribua seus segredos. `SUPABASE_SERVICE_ROLE_KEY` não é necessário no Next para este módulo de mídia.

Para uma nova instalação, prepare `.tools/media-bootstrap.json` com `{"url":"https://SEU_PROJETO.supabase.co","publishableKey":"CHAVE_PUBLICAVEL"}` e execute `node scripts/configure-media.mjs`. O script preserva o segredo de sessão e o backend atual; gera uma chave privada apenas se não existir e grava só a chave pública em `supabase/functions/brasa-media/public-key.json`. Recusa trocar uma URL existente por outro projeto. Cada restaurante deve ter ambiente e par de chaves próprios.

Aplique somente as migrations apropriadas ao ambiente, confira o histórico remoto antes de `db push`, e implante `supabase/functions/brasa-media/index.ts` com o `deno.json` e a chave pública dessa instalação. Pela CLI, use `supabase functions deploy brasa-media --no-verify-jwt --project-ref SEU_REF`. Mantenha obrigatória a validação Ed25519 no código. Para rotação de chave, atualize de forma coordenada o segredo do servidor e a chave pública da Edge; não regenere apenas um lado.

Os nonces são registros técnicos de curta validade. Preveja retenção periódica somente para registros expirados dessa tabela em operação comercial; não reutilize nonces nem altere pedidos para essa manutenção.

## Verificações executadas e pendências físicas

- `npm run typecheck`: passou. `npm test`: 18 testes passaram. `npm run test:e2e`: 10 testes de integração passaram. `npm run build`: compilação de produção concluída, incluindo TypeScript e todas as rotas.
- Testes automatizados: preços e adicionais preservados, upload autenticado, calibração, GLTF incorporado, arquivo inválido/cena cíclica, associação e bloqueio de arquivamento ativo, pedido idempotente, cozinha e acompanhamento.
- `npx tsx scripts/verify-media.ts`: integração real no Supabase, upload/download GLB, CORS, associação por produto, acesso anônimo negado a metadados e escrita, assinatura adulterada/repetida negada e arquivamento dos próprios registros de verificação. Preserva binários e dados existentes. Cria registros identificados como `[VERIFICAÇÃO]`.
- Navegador desktop e viewport de 390 × 844: upload pela administração, prévia, publicação, carregamento público pelo Storage, rotação manual, erro de arquivo ausente, impedimento de publicar modelo que não carregou, fallback sem AR, adicionais, carrinho, pedido e atualização da cozinha.
- O pedido de verificação `#0004` abriu automaticamente o acompanhamento após a confirmação e percorreu confirmado → em preparo → pronto → entregue, com atualização no cliente. Os pedidos `#0003` e `#0004` desta sessão estão identificados por `[TESTE 3D/AR]` nas observações e foram entregues; seus históricos foram preservados.
- A versão compilada foi iniciada e inspecionada em `http://127.0.0.1:3003`. Capturas: [visualizador móvel](3d-mobile.png) e [prévia administrativa](3d-admin.png).
- Modelos demonstrativos e fotografia do Brasa Classic importados pelas APIs normais de administrador, sem alterar seus preços, grupos ou IDs. `scripts/import-demo-media.ts` permite repetir a importação em nova demonstração; não substitui catálogo. `--refresh-demo` restringe a atualização aos modelos explicitamente marcados como geométricos ilustrativos.

**Não homologado neste ambiente:** câmera, permissão nativa, hit-test/ancoragem na mesa, gestos e escala percebida em Android/iPhone físicos. Não havia esses aparelhos nem publicação HTTPS da aplicação disponíveis. Antes de apresentar AR como homologada, em HTTPS: escaneie o QR da mesa, abra o produto, autorize câmera, detecte a mesa iluminada, posicione/gire/redimensione, negue a permissão em uma segunda tentativa, saia para o cardápio e conclua um pedido. Repita em Android/WebXR, Android/Scene Viewer e Safari/Quick Look, incluindo USDZ próprio quando usado. Uma largura exibida e um botão disponível não comprovam ancoragem física.

O evento `ar_start` registra a solicitação de ativação, não prova posicionamento concluído dentro de um aplicativo nativo.
