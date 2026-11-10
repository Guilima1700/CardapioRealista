# Diagnóstico de avisos do Model Viewer

Inspeção em 10/11/2026: Next 16.4.6, React 19.3.1, Model Viewer 4.4.0, Lit 3.3.3 e ReactiveElement 2.1.2. `npm ls` confirmou uma única cópia de cada pacote Lit; não houve troca de dependências.

## `Lit is in dev mode`

O aviso vem de `node_modules/@lit/reactive-element/development/reactive-element.js`, no carregamento do módulo. O pacote publica variantes por condições de exportação: `development` seleciona o código com verificações; o padrão seleciona produção. `next dev` utiliza a variante de desenvolvimento corretamente. Não é causado por reinicialização de efeitos React.

Não foram adicionados aliases para forçar Lit de produção no desenvolvimento, chamadas a `disableWarning`, filtros ou substituições de `console.warn`. A diferença entre builds é documentada pelo [Lit](https://lit.dev/docs/tools/development/#development-and-production-builds).

## `model-viewer scheduled an update after an update completed`

O aviso é emitido por `ReactiveElement._$didUpdate()` quando `updated()` deixa outra atualização pendente. No Model Viewer instalado, o caminho observado foi:

```text
decorators.js: updated / evaluateAndSync
controls.js: syncMaxFieldOfView
controls.js: jumpCameraToGoal
requestUpdate(Symbol(jumpCamera), false)
```

Os sincronizadores de limites mínimo/máximo de órbita e campo de visão também chamam `jumpCameraToGoal()`. Trata-se de atualização interna para aplicar os limites e estabilizar a câmera; não devemos remover esses controles ou modificar `node_modules` para eliminar o aviso.

Foi criada uma página temporária de diagnóstico com um elemento nativo construído por `document.createElement('model-viewer')`, configurado uma única vez, sem atualizações posteriores de propriedades pelo React. Instrumentação temporária de `updated`/`requestUpdate` nesse elemento confirmou a chamada acima durante o ciclo do Lit. O modelo carregou normalmente. A página e a instrumentação foram removidas antes do build de produção.

## Ajuste necessário na integração React

O efeito principal de `src/components/model-viewer.tsx` dependia de `enabledAR` e `product.usdzUrl`. Alterar esses metadados, mantendo o mesmo GLB, provocava limpeza/reinstalação dos listeners e reinicialização de `ready`, progresso, medidas e estado de interação. O ramo `el.loaded` voltava a chamar `onReady` e podia registrar outra visualização sem carregar outro modelo. Também retomava a rotação que o usuário já havia interrompido.

O efeito de carregamento agora depende da identidade do produto, URL do GLB, tentativa de recarregamento e contexto de prévia. Um efeito menor atualiza a configuração atual de AR em uma ref e verifica a capacidade do dispositivo. Listeners e polling existentes consultam essa configuração atualizada. Atributos `ar` e `ios-src` continuam sendo atualizados pelo React; os mecanismos nativos não foram substituídos.

Resultados na página de diagnóstico, sem Fast Refresh entre as medições:

| Ação | Antes: chamadas de `onReady` | Depois: chamadas de `onReady` |
| --- | ---: | ---: |
| Carregar GLB | 1 | 1 |
| Alternar AR | 2 | 1 |
| Alterar URL/metadado USDZ | 3 | 1 |

A rotação manual também foi verificada: `auto-rotate` foi removido após o gesto e permaneceu removido ao reativar AR. O comando de restauração mantém sua função de devolver a câmera ao enquadramento configurado. Propriedades de câmera, zoom, iluminação, escala, modos `webxr scene-viewer quick-look`, arquivo iOS, recuperação de erros e permissões permanecem configuradas como antes.

Não foi identificado loop de efeitos por identidade de objetos: o efeito usa dependências primitivas; `onReady` é consultado por ref. O import dinâmico reutiliza o módulo, e a limpeza remove listeners, timer e callback de foco. Reexecuções iniciais do Strict Mode e durante Fast Refresh são esperadas no desenvolvimento e não justificam desativá-los.

## Verificação de produção

Após `npm run build`, execute:

```powershell
node scripts/check-viewer-build.mjs
```

O script examina somente JavaScript emitido para o navegador em `.next/static` (ou `NEXT_DIST_DIR`). Exige que os runtimes Lit estejam presentes e falha se encontrar os marcadores de desenvolvimento `Lit is in dev mode`, `change-in-update`, `lit-debug` ou o módulo React DOM de desenvolvimento. Não modifica arquivos nem o console.

Os avisos de desenvolvimento da biblioteca podem continuar aparecendo em `next dev`. A ausência desses avisos em produção deve resultar da seleção dos módulos de produção, e não de filtros.

Validação final: TypeScript passou; 18 testes unitários e 10 testes integrados passaram; build de produção concluído. O verificador encontrou 47 arquivos JavaScript, com runtimes Lit presentes e sem os marcadores de desenvolvimento examinados. No navegador, o servidor de produção carregou o GLB do Supabase; a rotação manual desativou `auto-rotate` e a restauração o reativou. O console não registrou avisos ou erros durante essa conferência. [Captura do visualizador compilado](model-viewer-production.png).

O primeiro build após remover a página temporária encontrou um tipo antigo dela em `.next-preview/dev/types`. Esse único arquivo gerado foi removido; o typecheck e o build seguintes passaram. Nenhuma página de diagnóstico integra a entrega.

Os testes locais não substituem a homologação de câmera/ancoragem AR em Android e iPhone físicos, já documentada em [3D-AR.md](3D-AR.md).
