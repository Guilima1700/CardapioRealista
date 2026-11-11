# Implantação do Brasa na Vercel

## Incidente confirmado em 10/11/2026

`GET /api/catalog` retornou 500 com `ENOENT: no such file or directory, mkdir '/var/task/data'`. A aplicação estava usando o backend SQLite local. Não configure `DATA_DIR=/tmp`: esse diretório não garante persistência nem compartilhamento dos pedidos entre instâncias.

O projeto Supabase `hwfqinuifxquunqwrbza` recebeu a estrutura principal e uma importação aditiva do catálogo SQLite (5 categorias, 10 produtos, 12 mesas e 4 pedidos com histórico). Os arquivos e as associações de mídia existentes foram preservados. O SQLite original não foi modificado; há backup consistente e SQL de importação em `.tools/`, que não devem ser publicados no Git. Senhas, hashes e sessões locais não foram exportados. As contagens referem-se à importação, não são indicadores comerciais.

## Configurar o ambiente Production

Em Vercel → projeto → Settings → Environment Variables, configure:

| Nome | Valor/origem |
| --- | --- |
| `DATA_BACKEND` | `supabase` |
| `NEXT_PUBLIC_DATA_BACKEND` | `supabase` |
| `ASSET_BACKEND` | `supabase` |
| `NEXT_PUBLIC_APP_URL` | `https://cardapio-realista.vercel.app` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://hwfqinuifxquunqwrbza.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave pública do mesmo projeto, já presente no `.env.local` |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave de servidor do mesmo projeto, obtida no painel Supabase e inserida diretamente na Vercel |
| `SESSION_SECRET` | Segredo aleatório com pelo menos 32 caracteres; reutilize o configurado localmente ou gere um exclusivo para produção |
| `BRASA_ASSET_PRIVATE_KEY` | Valor existente no `.env.local`, correspondente à chave pública da Edge Function de mídia |

Nunca envie segredos pelo chat nem inclua `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET` ou `BRASA_ASSET_PRIVATE_KEY` em variáveis com prefixo `NEXT_PUBLIC_`. Não regenere somente a chave de mídia: a chave pública implantada precisa corresponder à privada.

Faça um **Redeploy** depois de salvar as variáveis: as variáveis `NEXT_PUBLIC_*` são incluídas no build. Confirme `GET /api/catalog` com HTTP 200 e abra um link de mesa real. Em modo Supabase, a página inicial sem token permite navegar, mas não atribui a mesa demonstrativa automaticamente. Use, por exemplo, `/?mesa=brasa-mesa-7-demo` para a mesa importada. Gere os QR Codes definitivos no painel administrativo.

## Administrador

O Supabase Auth estava vazio na inspeção. Crie uma conta no painel Supabase → Authentication → Users, com email real e senha própria, e associe seu UUID a `public.staff_users` como `admin` ativo. Não use a senha demonstrativa na produção. Desative o cadastro público de usuários. A criação da conta deve ocorrer pelos mecanismos do Supabase Auth, sem inserir hashes SQLite nas tabelas de autenticação. A associação pode ser realizada pelo MCP após a conta existir.

## Validação

Execute `npm run check:deployment -- https://cardapio-realista.vercel.app brasa-mesa-7-demo` após o deploy. O comando é somente leitura e verifica catálogo, QR/mesa, cabeçalhos, GLBs, CORS e APIs protegidas. O roteiro de câmera e posicionamento está em [HOMOLOGACAO-IPHONE.md](HOMOLOGACAO-IPHONE.md).

Conferir catálogo, modelo público, login, upload administrativo, pedido em mesa identificada, cozinha, acompanhamento e recuperação da conexão. Testar AR em HTTPS em Android/iPhone físicos. A criação do banco, isoladamente, não certifica o deploy: as variáveis, a conta administrativa e o novo build precisam estar configurados na Vercel.

Verificações no banco: preço de R$ 32,90 reconstruído pelo checkout, duas tentativas com a mesma chave retornando o mesmo pedido, transição para preparo e rollback integral do teste. Permaneceram 4 pedidos importados e 20 registros de histórico. RLS ativo nas tabelas principais; `anon` sem SELECT direto no catálogo e sem EXECUTE no checkout; `service_role` autorizado. O auxiliar RLS foi movido para schema privado, preservando a política de equipe. Advisor de segurança: somente avisos informativos de RLS sem política nas tabelas acessadas exclusivamente pelo servidor, sem alertas WARN/ERROR. TypeScript e 19 testes unitários passaram.
