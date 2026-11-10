# Verificação da demonstração

## Testes automatizados executados

- `npm run typecheck`: aprovado.
- `npm test`: 12 testes de domínio aprovados.
- `npm run test:e2e`: 9 testes de integração HTTP aprovados, com banco SQLite isolado.
- `npm run build`: compilação de produção aprovada com Webpack. Turbopack apresentou uma falha interna de criação do processo de CSS neste Windows, por isso o script de build usa a alternativa oficial `--webpack`.

## Fluxo observado na interface

- Cardápio, fotos, categorias e diálogo do produto renderizados.
- GLB ilustrativo do Brasa Classic efetivamente renderizado no Model Viewer.
- AR indisponível no computador corretamente apresentado como indisponível.
- Seleção de bacon recalculou o produto de R$ 32,90 para R$ 38,90.
- Revisão da sacola mostrou mesa, quantidade, pão, ponto e adicional.
- Pedido #0001 persistido a partir do envio pela interface, sem cobrança financeira.
- Login administrativo e dashboard carregados com dados desse pedido.
- Pedido encontrado na coluna Confirmado da cozinha.
- Ações Começar preparo, Marcar como pronto e Confirmar entrega executadas pela cozinha.
- Acompanhamento do cliente mudou automaticamente em outra aba para Em preparo, Pronto e Entregue.
- Layout em largura de celular sem transbordamento horizontal. Ajustado o espaçamento no título identificado na inspeção.

## Evidências

- `preview-3d.jpg`: modelo renderizado e opções do produto.
- `preview-admin.jpg`: indicadores reais do pedido de demonstração.
- `preview-kitchen.jpg`: pedido confirmado na cozinha.
- `preview-tracking.jpg`: acompanhamento com pedido entregue.
- `preview-mobile.jpg`: apresentação em largura de celular.

## Limites de homologação

Não foram fornecidas credenciais de um projeto Supabase nem aparelhos físicos para AR. As migrations/RLS/RPC, Storage e Realtime do Supabase precisam ser aplicados e homologados no projeto da instalação. Scene Viewer, Quick Look e WebXR precisam de teste em aparelhos compatíveis e HTTPS válido. Os testes de API locais não substituem essa homologação.

Não há provedor financeiro, impressora ou PDV conectados. A fila `integration_outbox` prepara a integração futura e nenhum envio externo é simulado.

Para desenvolver nesta máquina sem o problema observado no Turbopack, use `npm run dev -- --hostname 127.0.0.1 --webpack`. Para apresentar, prefira `npm run build` seguido de `npm start -- --hostname 127.0.0.1`.
