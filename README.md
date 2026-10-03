# GSJ Marcenaria — app

App instalável (PWA) da GSJ Marcenaria & Móveis Planejados, reunindo as 5 ferramentas internas num site só, com menu, ícone próprio e funcionamento offline parcial.

## O que tem aqui

- `index.html` — tela inicial, com o menu pras 5 ferramentas e o botão de instalar o app.
- `orcamento.html`, `contrato.html`, `recibo.html`, `termo-entrega.html`, `plano-de-cortes.html` — as ferramentas (mesmo conteúdo das versões `-gsj.html` do kit, com a navegação de volta pra tela inicial e os dados do app de instalação adicionados).
- `manifest.webmanifest` — descreve o app pro navegador (nome, cor, ícones) pra ele poder ser instalado.
- `sw.js` — service worker: guarda as páginas em cache pra abrirem mesmo sem internet. **Salvar/abrir da nuvem continua precisando de internet** — só a tela e o formulário abrem offline.
- `icons/` — ícone do app (gerado a partir da identidade visual da GSJ: monograma "GSJ", fundo Nogueira, texto Âmbar).

Todas as ferramentas continuam com a mesma senha de acesso compartilhada e salvando no mesmo banco (Supabase) que já estava configurado — nada muda aí, só a forma de abrir o app.

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

## Como atualizar o app depois

Sempre que algum arquivo mudar (nova função, ajuste de layout, etc.):

1. Suba a mudança pro GitHub (`git add .`, `git commit`, `git push`) — o GitHub Pages republica sozinho em 1-2 minutos.
2. **Abra `sw.js` e aumente o número em `CACHE_VERSION`** (ex: `"v1"` → `"v2"`). Sem isso, quem já tinha instalado o app pode continuar vendo a versão antiga por um tempo, porque o celular guarda uma cópia local.

## Domínio próprio (opcional)

Dá pra usar um domínio próprio (tipo `app.gsjmarcenaria.com.br`) em vez do link `github.io`, configurando um registro DNS e um arquivo `CNAME` no repositório — o GitHub tem um guia próprio pra isso ("Managing a custom domain for your GitHub Pages site"), é um passo à parte de registrar/ter o domínio.
