// Service worker do app GSJ Marcenaria.
// Guarda o "esqueleto" do app (as páginas + manifest + ícones) pra abrir
// mesmo offline. CDNs externos (fontes, Supabase, html2canvas/jsPDF) e
// chamadas de rede pra nuvem NÃO passam por aqui — seguem direto, porque
// precisam de internet de verdade (salvar/abrir da nuvem exige conexão).
//
// Pra publicar uma atualização: troque o número da versão abaixo
// (CACHE_VERSION) sempre que mudar algum arquivo. Sem isso, quem já
// instalou o app pode continuar vendo a versão antiga por um tempo.
const CACHE_VERSION = "v5";
const CACHE_NAME = "gsj-app-" + CACHE_VERSION;

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./orcamento.html",
  "./contrato.html",
  "./recibo.html",
  "./termo-entrega.html",
  "./plano-de-cortes.html",
  "./admin.html",
  "./obras.html",
  "./cliente.html",
  "./manifest.webmanifest",
  "./shell.css",
  "./auth.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) { return cache.addAll(PRECACHE_URLS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (key) { return key !== CACHE_NAME; })
            .map(function (key) { return caches.delete(key); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  const req = event.request;

  // só cuida de GET e só do mesmo site (nunca intercepta Supabase/CDN)
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(req).then(function (cached) {
      const network = fetch(req).then(function (response) {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(req, copy); });
        }
        return response;
      }).catch(function () { return cached; });

      // stale-while-revalidate: mostra o que já tem em cache na hora
      // (rápido, funciona offline) e atualiza o cache em segundo plano
      return cached || network;
    })
  );
});
