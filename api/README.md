# 0x0krr — guestbook NFC

Site estático em GitHub Pages; API em Cloudflare Workers + D1. O backend foi implantado na conta Cloudflare do projeto em https://nfc-0x0krr-api.nskge-0x0krr.workers.dev. O widget Turnstile aceita somente `nskge.github.io`.

O diretório público **/logs/** contém somente o **painel**, sem dados privados. Não coloque logs reais, tokens, chaves ou mensagens dentro do repositório GitHub.

## Instalação do backend (referência; recursos já criados)

O banco `nfc-0x0krr`, o Worker `nfc-0x0krr-api` e o widget Turnstile já existem. Não execute os passos de criação novamente. Os segredos `ADMIN_SECRET`, `IP_HASH_SECRET` e `TURNSTILE_SECRET_KEY` estão no armazenamento privado do Worker. Para futuras alterações do código, execute `npx wrangler deploy` dentro de `api/`.

1. Crie uma conta Cloudflare e um widget **Turnstile** para o hostname **nskge.github.io** (modo Managed). Copie a **site key** pública e a **secret key** privada.
2. No terminal local, clone o repositório e entre em \`api/\`. Faça login com \`npx wrangler login\`.
3. Crie o D1: \`npx wrangler d1 create nfc-0x0krr\`.
4. Edite \`api/wrangler.toml\`: cole o ID do D1 e a **site key pública** (não a secreta). Mantenha \`ALLOWED_ORIGIN = "https://nskge.github.io"\` e \`EXPECTED_HOSTNAME = "nskge.github.io"\`.
5. Rode \`npx wrangler d1 execute nfc-0x0krr --remote --file=./schema.sql\` estando na pasta \`api/\`.
6. Use \`npx wrangler secret put ADMIN_SECRET\` com um segredo aleatório de **pelo menos 32 bytes**. Gere com \`openssl rand -hex 32\`. Guarde essa chave: é exigida no painel /logs/.
7. Configure mais dois segredos **diferentes**: \`npx wrangler secret put IP_HASH_SECRET\` (aleatório, gerado separadamente) e \`npx wrangler secret put TURNSTILE_SECRET_KEY\` (chave secreta do Turnstile).
8. Implante a API com \`npx wrangler deploy\`.
9. Em \`assets/config.js\`, troque \`apiBase: ''\` pela URL HTTPS exata retornada no deploy, por exemplo \`apiBase: 'https://nfc-0x0krr-api.example.workers.dev'\`. Comite esse arquivo público (só a URL, **nunca** os segredos).
10. Teste o site e use \`https://nskge.github.io/nskge/logs/\` com **ADMIN_SECRET** para consultar os registros.

O frontend usa a URL pública em `assets/config.js`. Se a API estiver indisponível, o envio falha com mensagem de erro, sem fingir sucesso.

## Dados e segurança

- Cada navegador recebe um ID aleatório UUID v4. **Não é um identificador confiável de pessoa**: pode ser trocado.
- A API anota horário UTC, país, tipo aproximado de sistema operacional e navegador, e ID curto para associar visitas e mensagens. Não captura endereço MAC, localização precisa ou IP em texto.
- O IP no servidor é utilizado para **HMAC (hash com chave secreta)**, apenas para controle de abuso, sem ser mostrado no painel.
- Mensagem: no máximo **140 caracteres** e **560 bytes**, rejeitando códigos de controle e caracteres de spoofing bidi.
- Desenho: somente array de pontos numéricos normalizados [0,1], com limites de **24 traços, 80 pontos por traço e 350 pontos no total**. Nenhum SVG, imagem, HTML ou arquivo é aceito.
- Corpo JSON limitado a **16 KiB**, inclusive quando o cliente omite o Content-Length.
- Limites de mensagem por servidor: **1/minuto e 3/dia por navegador**, **30/minuto e 300/dia por IP compartilhado**, com verificação **Cloudflare Turnstile no servidor** (hostname e action verificados, token de uso único). As inserções D1 verificam os tetos na mesma instrução SQL.
- Um limite adicional na borda aceita até 300 requisições públicas/minuto e 30 requisições administrativas/minuto por hash de IP. Esse limite da Cloudflare é aproximado e local por datacenter; os limites de gravação em D1 são a proteção estrita.
- Cada abertura é contada, até **20 por navegador e 100 por IP por hora**. O número de visitantes é aproximado e usa UUID aleatório por navegador.
- SQL em D1 usa \`prepare().bind()\`, o painel renderiza textos com \`textContent\` e o desenho com Canvas (sem \`innerHTML\`).
- \`/logs/\` tem interface pública, mas a **API dos registros exige Bearer ADMIN_SECRET** e devolve no máximo 50 resultados por página.
- Armazenamento com expiração automática após **90 dias**.
- O botão **Ativar avisos de novas marcas** no painel consulta apenas o endpoint administrativo a cada 45 segundos. O aviso do navegador funciona enquanto o painel estiver aberto e autenticado; o painel não salva a chave no dispositivo.
- Segredos só em **Cloudflare Worker Secrets**, não no HTML, JavaScript público, banco exportado ou GitHub.

**Limitações:** Nenhuma proteção elimina completamente abuso ou DDoS. Um visitante pode manipular navegador/UUID e tentar requisições automatizadas. Use o WAF/Rate Limiting da Cloudflare se o site receber tráfego anormal. Recomendado ativar backup/exportação de logs se você quiser guardar lembranças por mais de 90 dias.

## Verificação

Rode `node api/security-test.mjs` com Node 22.13+ para exercitar o Worker e o SQL real do esquema em SQLite. O teste cobre gravação de mensagens/desenhos, contadores, autenticação, CORS, JSON inválido, payload grande, XSS/SQLi e limites de envio. Verifique também `node --check api/worker.js`, `node --check assets/party.js` e `node --check assets/logs.js`.
