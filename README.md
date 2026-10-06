# GSJ Marcenaria — app

App instalável (PWA) da GSJ Marcenaria & Móveis Planejados, reunindo as 5 ferramentas internas num site só, com menu, ícone próprio e funcionamento offline parcial.

## O que tem aqui

- `index.html` — **Início**: resumo (quantos orçamentos/contratos/recibos/termos/planos existem na nuvem) e atalhos pras ferramentas.
- `orcamento.html`, `contrato.html`, `recibo.html`, `termo-entrega.html`, `plano-de-cortes.html` — as 5 ferramentas.
- `obras.html` — **Área do cliente** (gestão da equipe): cada obra tem etapas com progresso automático, fotos, novidades, recados do cliente e o **login do cliente** (usuário + senha só dele, criado ali mesmo).
- `cliente.html` — a página do cliente: ele entra com o login e vê SÓ a(s) obra(s) dele — progresso, etapas, fotos e novidades marcados como visíveis, e manda recado/aprova o andamento. Não tem acesso a mais nada do sistema.
- `admin.html` — painel de administração (só aparece na barra lateral pra quem tem a conta marcada como admin): aprova contas novas, promove/bloqueia gente da equipe e mostra o log de atividade (quem salvou/abriu o quê e quando).
- `auth.js` — login, criação de conta, aprovação e a barra lateral, compartilhado por todas as páginas.
- `shell.css` — visual da barra lateral/menu/telas de login.
- `manifest.webmanifest` — descreve o app pro navegador (nome, cor, ícones) pra ele poder ser instalado.
- `sw.js` — service worker: guarda as páginas em cache pra abrirem mesmo sem internet. **Login, salvar e abrir da nuvem continuam precisando de internet.**
- `icons/` — ícone do app (identidade visual da GSJ: monograma "GSJ", fundo Nogueira, texto Âmbar).

### Como funciona o acesso agora (mudou nesta versão)

Antes, era uma senha única pra equipe toda. Agora cada pessoa cria a própria conta (usuário + senha, na tela "Criar conta") — **toda conta nasce bloqueada**. Ela só consegue usar as ferramentas depois que um administrador aprova pela aba **Admin** (só visível pra quem é admin). O admin também vê, na mesma aba, o log de quem salvou/abriu cada orçamento, contrato, etc.

Todo mundo aprovado continua vendo os mesmos orçamentos/contratos/recibos/etc. — os dados continuam 100% compartilhados entre a equipe, só o controle de quem pode entrar é que agora é individual.

**Seu usuário (Junior)**: assim que publicar, crie sua própria conta pela tela "Criar conta" com usuário `junior` e senha `junior51` — ela nasce bloqueada que nem qualquer outra. Avise quem te ajudou a configurar isso (ou volte na conversa do Claude) pra liberar essa conta como administrador direto no banco — depois disso ela já aparece como admin pra sempre, e você aprova todo o resto (inclusive outras contas de admin, se quiser) pela própria aba Admin.

## Como publicar no GitHub Pages

1. No GitHub, crie um repositório novo (pode ser público ou privado — se for privado, Páginas do GitHub só funciona em planos pagos; sendo público, qualquer um com o link acessa a tela de login, que já é protegida pela senha).
2. Suba os arquivos desta pasta pra esse repositório (veja os comandos abaixo).
3. No repositório, vá em **Settings → Pages**, em "Source" escolha a branch `main` e a pasta `/ (root)`, e salve.
4. Em alguns minutos o site fica no ar em `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`.

### Comandos pra subir pela primeira vez

Rode isso dentro desta pasta (troque `SEU-USUARIO` e `NOME-DO-REPOSITORIO` pelos seus):

```bash
git init
git add .
git commit -m "App GSJ Marcenaria"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/NOME-DO-REPOSITORIO.git
git push -u origin main
```

### Instalando no celular

- **Android (Chrome)**: abra o link do site, vai aparecer um aviso "Instalar app" (ou o botão na própria tela inicial) — toque e confirma. Fica com ícone igual qualquer outro app.
- **iPhone (Safari)**: abra o link, toque no ícone de compartilhar (⬆️) e depois em "Adicionar à Tela de Início". O Safari não mostra aviso automático, mas funciona do mesmo jeito depois de instalado.
- **Computador (Chrome/Edge)**: aparece um ícone de instalar na barra de endereço, ou o botão "Instalar app" na tela inicial.

## Como atualizar o app depois (você já tem o repositório no ar)

Pelo navegador, do mesmo jeito que você já fez da primeira vez:

1. No repositório no GitHub, clique em **Add file → Upload files**.
2. Arraste de novo TODOS os arquivos desta pasta (incluindo `icons/`) — o GitHub substitui os que já existem pelos novos.
3. Role pra baixo e clique em **Commit changes**. Em 1-2 minutos o site atualiza sozinho.

(Se preferir linha de comando, dentro desta pasta: `git add .`, `git commit -m "..."`, `git push`.)

**Atenção**: eu já aumentei o número do `CACHE_VERSION` dentro do `sw.js` nesta entrega — isso é necessário toda vez que algum arquivo muda, senão quem já tinha instalado o app continua vendo a versão antiga por um tempo (o celular guarda uma cópia local). Da próxima vez que eu mandar uma atualização, já venho com esse número aumentado de novo.

## Domínio próprio (opcional)

Dá pra usar um domínio próprio (tipo `app.gsjmarcenaria.com.br`) em vez do link `github.io`, configurando um registro DNS e um arquivo `CNAME` no repositório — o GitHub tem um guia próprio pra isso ("Managing a custom domain for your GitHub Pages site"), é um passo à parte de registrar/ter o domínio.
