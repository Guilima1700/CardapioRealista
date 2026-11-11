# Brasa — homologação no iPhone

## Publicação verificada

- Endereço: https://cardapio-realista.vercel.app
- Mesa: https://cardapio-realista.vercel.app/?mesa=brasa-mesa-7-demo
- [QR Code da Mesa 07](qr-mesa-07.png).
- Catálogo Supabase com 10 produtos; quatro GLBs públicos íntegros, entre 95 KB e 553 KB, com MIME e CORS conferidos.
- Modelo, rotação, zoom, tela cheia e sacola conferidos no Chrome publicado, sem erros de console/rede nessa verificação.
- APIs de administração, pedidos da equipe e acervo recusam acesso sem sessão.

Verificação repetível, somente leitura, sem criar pedidos ou métricas:

```powershell
npm run check:deployment -- https://cardapio-realista.vercel.app brasa-mesa-7-demo
```

Esse comando verifica infraestrutura e arquivos. Um resultado positivo não comprova AR física, autenticação administrativa nem entrega do pedido à cozinha.

## Teste físico

1. Abra o link da mesa diretamente no Safari do iPhone, fora de navegadores embutidos de mensagens.
2. Abra Brasa Classic e aguarde a representação 3D carregar.
3. Toque em **Ver na minha mesa**. Registre se o botão está habilitado, se há erro ou se abre o visualizador nativo.
4. No Quick Look, use a visualização AR quando houver a escolha entre AR e Objeto. Autorize a câmera quando solicitado.
5. Aponte para uma mesa iluminada e mova o telefone devagar até a superfície ser reconhecida.
6. Confira posição, giro e escala. A largura do modelo Classic é aproximadamente 16 cm. Registre a medida percebida, sem confundir zoom da câmera com tamanho do objeto.
7. Feche o visualizador e confira se produto, seleções e sacola continuam funcionando.
8. Repita com Batatas da casa. Confira também a recusa de câmera e recuperação para 3D.
9. Com um funcionário autenticado na cozinha, conclua um pedido identificado como teste e acompanhe confirmado → preparo → pronto → entregue. Não execute essa etapa durante operação real sem avisar a equipe.

Os quatro produtos ainda não têm USDZ próprio: usam a geração do Model Viewer para Quick Look. [Comportamento documentado pela biblioteca](https://modelviewer.dev/examples/augmentedreality/). Se houver falha na conversão ou apresentação dos materiais, produzir e validar um USDZ específico, com a mesma escala do GLB, e associá-lo no administrador.

## Condições de aceite

| Etapa | Situação |
| --- | --- |
| HTTPS, identificação da mesa e arquivos públicos | Verificado |
| Visualização 3D e sacola no Chrome publicado | Verificado |
| Abertura do visualizador/câmera no iPhone | Confirmada pelo usuário em 10/11/2026 |
| Ancoragem e manutenção da posição ao movimentar o iPhone | Confirmadas pelo usuário em 10/11/2026 |
| Giro, redimensionamento e escala percebida | Aguardando conferência específica no aparelho |
| Conta administrativa de produção | Admin ativo; usuário confirmou login e abertura da cozinha |
| Fluxo de pedido e cozinha na publicação | Pedido técnico #0006 enviado pela interface pública e acompanhado até entregue, com todas as mudanças de tela observadas automaticamente |
| Pratos realistas digitalizados | Aguardando captura/modelagem e aprovação dos arquivos |

Os modelos disponíveis são geométricos ilustrativos. O teste acima valida o funcionamento espacial; o realismo exige digitalizar os alimentos reais e revisar malha, texturas, escala e origem. Os adicionais atuais alteram preço e pedido, sem modificar a geometria.

## Conferência de produção em 10/11/2026

Após a publicação do pacote realista, o usuário também confirmou o Croissant artesanal texturizado em 3D e em AR sobre a mesa no iPhone 14 Plus. O Bolo de chocolate e morangos foi validado no Chrome, incluindo escala e sacola; sua AR específica permanece pendente de confirmação física. [Pacote e fontes](DEMO-PRONTA.md).

O usuário confirmou abertura da câmera e manutenção do hambúrguer sobre a mesa ao movimentar o iPhone. A criação da conta foi verificada no Supabase Auth e seu vínculo administrativo foi conferido pela RLS. O usuário confirmou acesso à cozinha na publicação.

O pedido #0006 foi criado pelo Chrome na página pública da Mesa 07 após carregar o GLB. Contém a observação `[VALIDACAO WEB AR] TESTE TECNICO - NAO PREPARAR`, total R$ 32,90, pagamento no caixa, sem transação financeira online. O acompanhamento foi aberto antes das alterações e mostrou, sem recarregar, `Tudo certo com seu pedido!` → `Tem coisa boa na cozinha.` → `Seu pedido está pronto!` → `Agora é com você.`. Nenhum erro JavaScript foi registrado. O histórico do pedido foi preservado; relatórios podem conter esse pedido técnico, que deve ser identificado como teste ao interpretar os indicadores.

Essa conferência combina o teste físico de AR relatado pelo usuário com o checkout e o acompanhamento observados no Chrome. Não constitui uma gravação de todo o percurso em uma única sessão do iPhone, nem homologação de Android ou de todos os modelos de aparelho.
