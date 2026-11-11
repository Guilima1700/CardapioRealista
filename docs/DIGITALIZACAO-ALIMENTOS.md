# Primeira digitalização de alimento — iPhone 14 Plus

O primeiro objetivo é obter uma réplica de um alimento real e aprová-la na mesma mesa AR já validada. O Brasa recebe modelos prontos; ainda não reconstrói a geometria a partir da câmera ou de um conjunto de fotografias.

## Captura piloto

Use fotogrametria por fotografias. O KIRI Engine oferece o modo Photo Scan, que produz malha com textura, além de exportação GLB e USDZ. A reconstrução usa o serviço do fornecedor; confira suas condições antes de enviar imagens. O plano Basic informado pelo fornecedor oferece Photo Scan e exportações gratuitas. Não é necessário contratar o Pro para este primeiro ensaio.

1. Escolha um único hambúrguer ou acompanhamento, apresentado como será servido. Comece sem copos transparentes, embalagens brilhantes ou vapor.
2. Coloque-o em suporte fosco, em local com espaço para caminhar ao redor. Mantenha alimento, prato e iluminação estáveis durante toda a captura.
3. Use luz suave e uniforme. Evite reflexos fortes, flash, sombras móveis e pessoas atravessando o enquadramento.
4. No app, selecione Photo Scan. Use a câmera principal em 1×, mantendo foco e distância semelhantes. Evite modo Retrato, filtros e zoom digital.
5. Como roteiro inicial, faça três voltas: uma baixa mostrando as laterais, uma inclinada e outra mais alta mostrando o topo. Mire aproximadamente 25–40 fotos por volta, com grande sobreposição entre fotos consecutivas; fique dentro do limite exibido pelo plano/app. Caminhe ao redor do alimento, sem girar o prato neste primeiro ensaio.
6. Revise as fotos antes de processar. Remova imagens tremidas, desfocadas ou com o alimento cortado. O número de fotos não compensa falta de cobertura ou mudança do objeto.
7. Processe o conjunto. Confira a malha por todos os lados, recorte o cenário e preserve apenas o produto e o prato quando fizerem parte da apresentação. Repita áreas ruins se necessário; não prometa fidelidade sem revisar o resultado.
8. Exporte GLB com textura e, se disponível, USDZ do mesmo objeto. Preserve também os arquivos originais de captura e a versão sem redução de qualidade.
9. Meça a largura real do conjunto representado, em centímetros. Se o modelo inclui prato, meça o prato/conjunto, não somente o pão.

## Preparar para o Brasa

- Preferir um GLB único com texturas incorporadas. GLTF com arquivos externos precisa ser empacotado antes do upload atual.
- Limite atual por arquivo: 30 MB. Como meta inicial de experiência móvel, procurar 5–10 MB ou menos sem perder qualidade visível; a redução precisa ser revisada visualmente.
- GLB e USDZ devem ter a mesma escala e estar apoiados na base. O Brasa calibra a largura do GLB no upload; o USDZ deve vir calibrado da ferramenta de produção.
- Conferir pão, ingredientes, bordas e áreas de baixo contraste. Uma textura convincente sobre uma malha deformada não basta.
- Publicar pelo administrador somente após a prévia carregar. A associação usa o produto existente, sem recriar preços, adicionais ou o fluxo de pedidos.
- Repetir o teste no iPhone: aparência, ancoragem, giro, tamanho percebido e retorno à sacola. Os adicionais atuais não modificam a malha.

## Entrega do piloto

Separar GLB, USDZ quando disponível, nome/ID do produto e largura medida. Nenhum alimento real foi digitalizado nesta etapa de orientação; a produção começa com a captura física.

Fontes verificadas em 10/11/2026:

- [Modo Photo Scan](https://www.kiriengine.app/blog/explained/photo-scan-mode)
- [Plano Basic e limites](https://www.kiriengine.app/pricing)
- [Formatos exportáveis](https://www.kiriengine.app/faq/what-kind-of-file-formats-can-kiri-engine-export)
- [Especificações do iPhone 14 Plus](https://support.apple.com/en-ie/111854)
