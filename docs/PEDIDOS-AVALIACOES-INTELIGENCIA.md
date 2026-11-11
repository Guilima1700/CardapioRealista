# Pedido coletivo, avaliações e inteligência comercial

Esta extensão preserva a instalação independente por restaurante, o checkout, autenticação de funcionários, preços em centavos, modelos 3D/AR e os estados existentes dos pedidos. Não há cadastro de empresas, assinatura ou administração de múltiplos restaurantes.

## Ativação e uso

1. Publique esta versão na Vercel com as variáveis já utilizadas pelo Brasa: `DATA_BACKEND=supabase`, `NEXT_PUBLIC_DATA_BACKEND=supabase`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET` e `NEXT_PUBLIC_APP_URL` com o domínio HTTPS. As duas chaves sem `NEXT_PUBLIC_` e o segredo de sessão ficam somente no servidor. Nenhuma nova credencial externa é exigida pelos módulos.
2. No administrador, abra **Experiência da mesa**. Configure a validade, entrada livre/senha/aprovação, novas rodadas, intervalo da avaliação e endereço de avaliação no Google. A senha fica armazenada com scrypt e salt; o painel nunca a devolve.
3. Para apresentações e testes, selecione **Classificar novos dados como → Demonstração** antes de começar. Para operação comercial, selecione **Operação real**. A alteração vale para novos eventos e pedidos; não reclassifica registros existentes.
4. Abra **QR Codes**. Cada mesa tem um endereço estável, por exemplo `https://seu-dominio/mesa/7`. Grave esse mesmo endereço como um registro NDEF URL na tag NFC, usando um aplicativo de gravação compatível. O Brasa não precisa de Web NFC nem de permissão para ler uma tag pelo site: o sistema do celular abre a URL. O QR Code leva ao mesmo destino. Links antigos `/?mesa=...` continuam funcionando.
5. Na mesa, toque em **Iniciar pedido coletivo**, informe um apelido e entre. Outros navegadores encontrarão a sessão ativa. O primeiro participante é o responsável; no modo de aprovação todos aguardam a equipe. Aprovações ficam em **Pedidos coletivos**, na cozinha quando pendentes e em `/atendimento`.
6. Escolha produtos pelo cardápio existente, inclusive 3D/AR e adicionais. A sacola coletiva identifica os participantes. Cada um altera seus próprios itens; o responsável pode remover itens de outros. **Revisar pedido coletivo** bloqueia a rodada. Confira os itens, participantes, observações, preços e pagamento e confirme o envio à cozinha. O responsável pode voltar à edição antes de enviar.
7. A cozinha recebe um pedido normal do sistema, com o nome do participante em cada item. O acompanhamento usa a tela existente. Se habilitado, o responsável pode abrir outra rodada; pedidos anteriores mantêm preços e itens históricos. Fechar a sessão não cancela os pedidos enviados.
8. Após a entrega e o intervalo configurado, o acompanhamento oferece a avaliação. São três notas de 1 a 5, problemas, comentário e sugestão opcionais. Cada pedido aceita uma única avaliação, com proteção contra duplicação. **Agora não** evita nova solicitação naquele navegador. O botão **Avaliar no Google** independe da nota, envio ou recusa da avaliação interna.

Uma URL de tag estática pode ser copiada: NFC/QR não comprovam proximidade física. A identificação da mesa não autoriza alterações no coletivo. Para controle adicional, use senha ou aprovação de funcionário. O restaurante deve iniciar/encerrar sessões durante o atendimento; a validade é verificada no servidor em todas as operações.

## Organização dos valores

Os preços, disponibilidade, limites de adicionais e pagamento são validados no backend com o catálogo atual. O total da revisão é conferido novamente no checkout; se os preços mudarem, volte à edição e revise. Não é aceito preço enviado pelo navegador.

O resumo mostra total geral, total por participante e divisão igualitária de todas as rodadas. O resto em centavos é distribuído pela ordem estável de entrada dos participantes, preservando o total exato. A divisão é organizacional: não cobra, transfere dinheiro, confirma pagamentos ou calcula lucro. A instalação atual não possui taxas/descontos financeiros adicionais; uma futura implementação deverá distribuir esses valores no backend antes de atualizar a divisão.

## Avaliações e atendimento

**Avaliações** permite filtrar período, nota de alguma dimensão até o valor escolhido, problema, produto, mesa e tratamento. Mostra médias, evolução por dia, comentários, sugestões, produtos e histórico de estados do pedido. Funcionários também usam `/atendimento`; configurações e recomendações comerciais exigem administrador.

O tratamento pode ser Nova → Em análise → Em atendimento → Resolvida (o funcionário pode ajustar conforme o atendimento). Cada atualização usa versão para impedir sobrescrita concorrente. Relato de problema ou nota baixa gera alerta individual. Recorrência nos últimos sete dias exige pelo menos dez avaliações e três ocorrências do mesmo problema. A queda de média exige dez avaliações em cada uma das duas semanas e redução de pelo menos 0,5 estrela. Esses cálculos usam as avaliações contidas nos filtros selecionados; períodos menores podem não conter as duas amostras. Alertas são calculados dos registros atuais, evitando alertas duplicados persistidos.

O link Google deve ser HTTPS válido e fica disponível de modo equivalente para todos. Não existe incentivo, filtro por satisfação, exigência de avaliação interna ou publicação automática.

## Inteligência comercial

**Inteligência Comercial** oferece hoje, 7 dias, 30 dias, mês atual, mês anterior e intervalo personalizado (até 366 dias), no fuso do restaurante. Os gráficos comparam o valor dos pedidos entregues ao intervalo anterior de mesma duração. Esse indicador não é caixa recebido. Pedidos ainda em andamento são mostrados separadamente na quantidade total.

São apresentados produtos vendidos/visualizados, adições e conversão por sessões únicas, 3D/AR por produto, categorias, adicionais, combinações, horários, ticket e abandono observado. A associação pedido/navegação usa a sessão anônima e também as sessões dos participantes nas linhas de pedidos coletivos. Pedidos sem identificação de navegação não são atribuídos artificialmente a um visitante. Abandono considera ausência de pedido vinculado dentro do período; compras em outro período podem mudar a interpretação.

O funil possui caminhos opcionais: clientes podem pedir sem 3D ou AR. A taxa entre etapas considera sessões comuns às duas etapas, não uma divisão arbitrária de totais. As taxas 3D/AR indicam associação entre interações e adições no período, não causalidade nem atribuição financeira. **AR significa solicitação de ativação**: Quick Look e Scene Viewer não informam ao site se o alimento ficou realmente ancorado na mesa. O sistema não inventa essa confirmação.

As recomendações usam regras identificáveis, não textos de uma IA externa:

- Apresentação: conversão baixa com intervalo Wilson de 95% abaixo do intervalo da média dos produtos elegíveis.
- Exposição: conversão acima da média com menos visitas que os produtos mais expostos.
- Combinação: pelo menos dez pedidos contendo o par e lift acima de 1,2, com suporte e amostra exibidos; indica associação.
- Adicional: pelo menos dez pedidos com o adicional e frequência mínima de 40% nos pedidos do produto.
- Horário: faixa interna ao intervalo com atividade observada, com volume inferior a 40% da média. Não presume funcionamento contínuo.
- Margem: custos cadastrados, demanda mínima e margem base estimada positiva. Não calcula lucro real.

O padrão exige 50 visitantes por produto quando aplicável, 20 pedidos e sete dias com atividade observada; o administrador pode aumentar os limites ou reduzi-los até os mínimos seguros do formulário. Produtos indisponíveis não geram recomendações de destaque. Consultas incompletas não geram recomendações novas. Sem amostra: **Dados insuficientes para gerar recomendações confiáveis.**

**Visualizar detalhes** mostra evidência e período. **Aplicar recomendação** exige confirmação explícita e usa o conteúdo guardado no servidor. É possível destacar produto, escrever uma nova descrição, sinalizar adicional, publicar uma sugestão de acompanhamento ou mensagem de campanha no horário analisado. Nenhuma ação altera preços automaticamente. Sugestão de acompanhamento mantém produtos e preços originais; não cria um produto-combo com desconto automaticamente. O cadastro de combos existente continua disponível em Produtos. Sugestões públicas respeitam disponibilidade e modo de dados. É possível desativá-las, ignorar ou resolver recomendações, com histórico de funcionário e horário. Recomendações encerradas ou desatualizadas não podem ser aplicadas indevidamente.

Em **Produtos → Custos e margem estimada**, informe custo total de produção, ou ingredientes e outros custos por unidade. O custo total substitui a soma das parcelas. Campos vazios significam desconhecido. A margem base usa preço e custos atuais e exclui despesas e custos variáveis de adicionais não cadastrados; nunca é apresentada como lucro real. Custos não são enviados no catálogo público nem no HTML do cliente.

### Separação de demonstração

Dados novos carregam `dataMode` definido no servidor. O filtro de fonte mantém operação real e demonstração separados. Indicadores antigos também excluem demonstração. Pedidos anteriores sem classificação continuam no módulo operacional Pedidos e ficam fora dos indicadores; um aviso mostra essa cobertura. Nenhum histórico foi apagado ou reclassificado automaticamente.

**Ver exemplo ilustrativo separado** gera um conjunto sintético somente em memória, com aviso permanente e ações de aplicação desabilitadas. Não grava eventos, pedidos, recomendações ou avaliações. Serve para explicar o painel enquanto não existe histórico suficiente. Esse exemplo jamais é somado aos registros do restaurante.

## Banco e segurança

Migrations novas, aplicadas ao projeto Supabase existente:

- `20261111015737_social_commerce.sql`: tabelas, RPCs, permissões, eventos e Realtime.
- `20261111022534_social_constraints.sql`: integridade, relacionamento dos pedidos coletivos e índices adicionais.

Tabelas novas: `experience_settings`, `table_sessions`, `session_actions`, `order_reviews`, `commercial_recommendations`, `recommendation_actions`, `experience_rate_limits`. Participantes e itens em edição são documentos versionados dentro de `table_sessions`; não há carrinho de pedidos paralelo. `orders.group_session_id` é uma FK para a sessão. Os itens confirmados permanecem nas entidades existentes `orders`, `order_items` e `order_status_history`. Eventos reutilizam `analytics_events` com colunas `table_id`, `order_id`, `metadata`, `verified` e novos tipos.

Todas as novas tabelas têm RLS e grants somente para `service_role`. Acesso público passa pelas APIs com autenticação por cookie individual HttpOnly/SameSite, segredo aleatório de 256 bits e hash no banco. O PIN não fica em URLs. Mutações usam identificador único, versão de item e CAS com bloqueio transacional no PostgreSQL. Apenas o responsável revisa/envia; a equipe aprova entradas. Confirmação usa `place_order` existente, com chave idempotente por rodada. A constraint mantém uma sessão ativa por mesa. Validade, status, produtos e permissões são conferidos no servidor. CORS/origem é tratado pelo mecanismo já existente das APIs.

O Realtime transmite somente a versão alterada, além do identificador técnico de mensagem adicionado pelo Supabase. Não transmite nomes, itens, preços, hashes, cookies ou tokens de pedido. O canal tem um tópico aleatório de 256 bits informado somente a participantes aprovados. É uma notificação pública sem dados sensíveis, não um canal público de carrinho. A leitura HTTP continua protegida. Não é necessário cadastrar usuários anônimos no Supabase Auth. Consulta a cada dez segundos recupera mensagens perdidas; sem WebSocket, a consulta real a cada 2,5 segundos mantém a recuperação. Foco/reconexão também sincronizam. O modo local SQLite usa consultas reais ao mesmo banco, sem simulação de eventos de rede.

Eventos de navegação são deduplicados por UUID e sessões nos indicadores. Confirmação, entrega e avaliação são registrados por triggers transacionais; o endpoint público não aceita forjar esses tipos. A entrada coletiva é registrada pelo servidor. Eventos não guardam IP bruto; o limitador de tentativas de PIN armazena HMAC temporário. Apelidos são usados apenas na organização do atendimento. Defina a política de retenção do restaurante para eventos e sessões; não existe exclusão automática de históricos de pedidos.

## Verificação e operação

Execute `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run test:chrome` e `npm run build`. Depois do build, `npm run test:production` repete a jornada coletiva no Chrome usando `next start`, porta 3101 e banco isolado. Testes HTTP/Chrome usam SQLite isolado em `data/test-*`; não gravam no banco de produção. O teste de inteligência insere fixtures explicitamente de demonstração somente nesse banco isolado. O SQL `tests/postgres-experiences.sql` testa as RPCs no Supabase dentro de uma transação revertida; sequências PostgreSQL podem avançar mesmo com rollback, gerando lacunas normais na numeração.

O build de produção continua usando React/Lit de produção, validado por `scripts/check-viewer-build.mjs`. Os avisos de Lit em `next dev` não são filtrados. A captura intencional de GLB inexistente nos testes valida o fallback de erro; não é uma falha de produção.

Após o deploy, teste com dois celulares: abrir o mesmo NFC/QR, entrar, adicionar ao mesmo tempo, editar somente itens próprios, revisar/enviar, conferir nomes na cozinha, entregar e avaliar. Teste também perda/reconexão de rede, senha/aprovação, nova rodada e encerramento. A abertura física de tags NFC, permissões da câmera e AR espacial exigem aparelhos reais; Chrome desktop não substitui esse teste. O fluxo AR existente foi preservado. Pagamento online, impressão e PDV continuam dependendo de provedores reais e não foram simulados.

O Supabase conectado já recebeu as migrations; os novos componentes e APIs só chegam ao domínio público após uma nova publicação do código na Vercel. Não basta atualizar o banco.

### Resultado da validação desta entrega

- Lint sem erros ou avisos e TypeScript sem erros.
- 30 testes unitários e 13 cenários HTTP de integração aprovados.
- Oito cenários da regressão completa no Google Chrome instalado aprovados, incluindo modelos, AR sem suporte, hidratação, resposta perdida e jornada coletiva até avaliação. O fechamento adicional por funcionário também tem cobertura de API e navegador.
- Build de produção aprovado; jornada coletiva, avaliação, painel e encerramento pela equipe aprovados no Chrome contra o servidor de produção local. A inspeção dos 61 arquivos JavaScript do navegador confirmou ausência do runtime de desenvolvimento do Lit e React DOM.
- RPCs reais no PostgreSQL: CAS, dono/participante, idempotência, preços, relações dos itens, cozinha/entrega, avaliação única, eventos verificados, confirmação comercial e grants, em transação com rollback.
- Notificação Realtime recebida por cliente anônimo em WebSocket real, com payload técnico contendo versão e ID da mensagem.
- Conferência após testes: os seis pedidos, doze produtos e 85 eventos anteriormente existentes no Supabase foram preservados; não ficaram sessões, avaliações ou recomendações de teste no projeto remoto.
- Auditoria npm de produção: nenhuma vulnerabilidade reportada. O advisor de segurança do Supabase manteve o aviso anterior de proteção contra senhas vazadas desativada. Os avisos informativos de RLS sem policies são esperados nestas tabelas exclusivas do servidor, com grants públicos revogados; não foram abertas policies para silenciá-los. A configuração de autenticação existente foi preservada.

Não foram testadas fisicamente tags NFC nem esta nova jornada coletiva em iPhone/Android. O roteiro acima deve ser repetido nesses aparelhos após publicar a versão. A validação anterior de AR no iPhone não substitui esse teste dos novos módulos.
