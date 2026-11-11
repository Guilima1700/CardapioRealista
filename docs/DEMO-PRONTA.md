# Brasa — demonstração pronta para apresentação

Preparada em 10/11/2026. Os ativos foram publicados no banco e no Storage já usados pelo site; a experiência permanece na mesma instalação.

## Conteúdo

- Dez fotografias demonstrativas baixadas e hospedadas no Storage, com cópias locais no pacote. Os URLs de imagem foram atualizados sem alterar preços, nomes, adicionais, disponibilidade ou modelos dos dez produtos existentes.
- **Croissant artesanal**, categoria Cafeteria, R$ 18,90 demonstrativos: GLB texturizado de aproximadamente 2,1 MB, largura de apresentação 18 cm.
- **Bolo de chocolate e morangos**, categoria Doces finais, R$ 89,90 demonstrativos para bolo inteiro: GLB texturizado de aproximadamente 3,3 MB, largura de apresentação 24 cm.
- Dois novos produtos identificados como `Demo realista`, associados aos respectivos modelos e prévias. As imagens desses dois cards são renderizações dos modelos texturizados; as dez fotografias anteriores continuam sendo fotos de acervo.
- GLBs autocontidos, sem dependências de texturas externas. Origem na base e escala preparadas. Quick Look continua utilizando a geração USDZ do Model Viewer. O usuário confirmou o croissant com textura em 3D e posicionado sobre a mesa no iPhone 14 Plus. O bolo foi conferido no Chrome; sua AR específica ainda não foi confirmada no aparelho.

O combo de hambúrguer e batatas testado durante a seleção foi rejeitado por aparência estilizada e não foi publicado. Os modelos anteriores de hambúrguer continuam explicitamente ilustrativos. Não há alegação de que os alimentos demonstrativos foram escaneados no restaurante.

## Usar na apresentação

Abra [Mesa 07](https://cardapio-realista.vercel.app/?mesa=brasa-mesa-7-demo), selecione Cafeteria ou Doces finais, abra um dos produtos e use Ver na minha mesa no Safari do iPhone. Também é possível pesquisar o nome do produto. Após AR, retorne ao cardápio, personalize quando houver opções e use a sacola normal. Nenhum pedido foi criado durante a verificação desta atualização.

## Reaplicar em outra instalação

Os arquivos estão em `public/demo-food/`. A pasta inclui README com fontes/licenças e manifesto de procedência. Configure previamente a integração de mídia dessa instalação e tenha um catálogo inicial com os produtos-base.

O importador é um comando de servidor; lê as credenciais somente do ambiente. Não deve ser levado ao navegador:

```powershell
$env:BRASA_IMPORT_URL='https://endereco-da-instalacao'
node --conditions=react-server --import tsx scripts/import-ready-demo.ts --stage
```

Revise `.tools/ready-demo-import.sql` e aplique ao banco correto por conexão administrativa segura. Ele altera apenas imagens dos itens existentes e insere os dois produtos demonstrativos; falha se outro administrador mudar uma imagem durante o processo. Novos arquivos e checkpoint de upload não apagam os anteriores. A pasta `.tools` é específica da instalação e não deve ser copiada com credenciais para novos restaurantes.

Depois, publique as associações do acervo:

```powershell
node --conditions=react-server --import tsx scripts/import-ready-demo.ts --publish
```

Backup anterior: `.tools/ready-demo-catalog-before.json`. Os arquivos anteriores continuam no Storage. Para restaurar imagens, reaplique somente os campos de mídia dos produtos do backup e publique as associações correspondentes; não substitua preços nem pedidos. Os novos produtos podem ser desativados pelo administrador.

## Verificação

Os dois modelos carregaram no Chrome da publicação, com AR habilitada, dimensões esperadas e adição/remoção pela sacola. As 12 imagens retornaram HTTP 200 e MIME de imagem. Console sem erros/avisos nessa conferência. O roteiro de iPhone permanece em [HOMOLOGACAO-IPHONE.md](HOMOLOGACAO-IPHONE.md). TypeScript, 19 testes unitários e build de produção passaram.

[Pacote de ativos para reutilização — aproximadamente 7,6 MB](brasa-demo-assets.zip). Inclui os GLBs, dez fotos, duas prévias próprias e registros de licença/origem. O ZIP é um pacote de ativos, não uma instalação completa nem um banco com dados de clientes.

Fontes e permissões: [Poly Haven — CC0](https://polyhaven.com/license), [Unsplash](https://unsplash.com/license). Os créditos dos modelos também são exibidos no visualizador do produto.
