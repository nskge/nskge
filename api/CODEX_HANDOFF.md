# Handoff para Codex — site NFC / 0x0krr

Repositório: https://github.com/nskge/nskge
Branch: main
GitHub Pages previsto: https://nskge.github.io/nskge/
Painel de logs: https://nskge.github.io/nskge/logs/

## Estado atual

- Frontend mobile (raiz index.html e nfc/index.html): fundo quase preto, GIF de Juuzou, título "eae", botão grande para https://instagram.com/0x0krr/, mensagem curta e formulário "deixe sua marca...".
- O visitante pode enviar texto (140 caracteres) e um desenho em canvas (24 traços, 350 pontos no total). 
- API separada em api/worker.js para Cloudflare Workers + banco D1 em api/schema.sql; arquivos de configuração em api/wrangler.toml.
- Código do frontend: assets/party.js; painel privado em logs/index.html + assets/logs.js.
- Configuração pública assets/config.js tem apiBase vazio; **a API ainda NÃO foi implantada**. Não declarar o sistema funcionando antes do teste real.
- Não modificar README.md do perfil. Não armazenar mensagens/logs/segredos em arquivos estáticos no GitHub Pages. O painel /logs/ é público enquanto interface, mas a API exige Bearer ADMIN_SECRET.

## Objetivo próximo

1. Revisar a implementação inteira; executar \`node api/security-test.mjs\`, \`node --check\` nos JS e ampliar testes positivos de ponta a ponta.
2. Resolver qualquer problema de script carregando antes do DOM, GIF quebrado, URLs internas, CORS, responsividade, canvas touch e painel.
3. Implantar Cloudflare Worker + D1 + Turnstile na conta do usuário, solicitando explicitamente o login/autorizações necessários. Ver api/README.md. Se não houver acesso a Cloudflare, orientar o usuário e deixar tudo pronto — não afirmar que implantou.
4. Configurar a URL HTTPS real do Worker em assets/config.js (apenas endpoint público, sem segredos).
5. Criar/fornecer chave ADMIN_SECRET aleatória de 32+ bytes, guardada em Worker Secret (não comitar, não imprimir em logs); usar IP_HASH_SECRET independente, Turnstile secret key separada e a site key pública no wrangler.toml.
6. Validar de ponta a ponta: abrir site → contador → escrever mensagem → desenhar → receber confirmação real de D1 → visualizar no /logs/ autenticado. Recarregar, testar retorno e limites de flood.
7. Verificar CORS e hostnames: GitHub Pages em https://nskge.github.io e Workers HTTPS. Considerar bloqueio de iframe, headers e WAF da Cloudflare, inclusive custos, retenção e limites de uso.

## Requisitos de segurança, obrigatórios

- Não acessar MAC address: navegadores não expõem esse dado. Usar UUID aleatório do navegador e timestamp; metadados mínimos (país/OS/browser). Não coletar IP bruto nem localização precisa; hash HMAC do IP somente para rate limiting.
- Mensagens: rejeitar tipo inválido, > 140 caracteres, > 560 bytes, controles e spoofing bidi. Renderização com textContent, nunca innerHTML.
- Desenho: aceitar somente arrays de números normalizados 0..1 com limites de traços, pontos e bytes; nunca SVG/HTML/arquivos enviados.
- JSON total máximo 16 KiB, inclusive sem Content-Length. Rejeitar corpos malformados.
- D1 com prepared statements e .bind; revisar CORS/Origin, Turnstile no servidor com hostname/action, honeypot, throttling por HMAC/IP + UUID. Origin não substitui rate limiting.
- Admin por header Authorization Bearer; chave privada em Worker Secret, não em GitHub Pages/localStorage. Nunca devolver hash/IP em logs administrativos. Limitar paginação. Sanitizar qualquer dado antes de mostrar.
- Tratar erros sem stack traces ou dados internos em respostas públicas; não assumir que limitação client-side é segurança.
- Testar XSS, SQLi, payloads de desenho incorretos, ultrapassagem de tamanho, negação por mensagens vazias, requisições sem autorização, chamadas sem Origin ou com Origin alheia, abuso de Turnstile e condições de corrida no rate limit.
- Considerar LGPD: transparência dos dados coletados e retenção de 90 dias, evitando rastreamento invasivo.

## Entrega do Codex

- Implementar, revisar, testar, corrigir e, quando autorizado, implantar na Cloudflare.
- Informar o que foi confirmado funcionando e o que exige intervenção manual.
- Commitar alterações em main com mensagens claras, preservar README.md e não expor segredos.
- Retornar URL exata do site e do painel, resultados dos testes, SHA do commit e quaisquer passos manuais pendentes.
