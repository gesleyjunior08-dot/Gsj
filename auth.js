// Casca compartilhada do app GSJ: cliente Supabase, login/cadastro por conta própria
// (com aprovação do admin), barra lateral de navegação e log de atividade.
// Carregado em todas as páginas, depois do <script> do supabase-js e ANTES do
// script de cada ferramenta (que usa `window.GSJ.sb` no lugar do antigo cliente
// próprio e `window.GSJ.logAction(...)` pra registrar salvar/abrir).
(function () {
  "use strict";

  var SUPABASE_URL = "https://brulthsmuhwftodbnhpg.supabase.co";
  var SUPABASE_KEY = "sb_publishable_esuL-cCe9-_5BJfB1kgWMQ_kjHugWUs";
  var EDGE_SIGNUP_URL = SUPABASE_URL + "/functions/v1/gsj-signup";
  var EMAIL_DOMAIN = "@gsj.local";

  // o cliente é criado já aqui (não espera o DOM), porque o script de cada
  // ferramenta lê window.GSJ.sb logo nas primeiras linhas do próprio arquivo.
  var sb = null;
  try {
    if (window.supabase && typeof window.supabase.createClient === "function") {
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
  } catch (e) {}

  var GSJ = (window.GSJ = window.GSJ || {});
  GSJ.sb = sb;
  GSJ.user = null;

  // Esconde a página por um instante até a barra lateral ser montada (evita "pulo" visual
  // ao trocar de página). Uma trava de segurança tira o esconder sozinha se algo falhar.
  document.documentElement.classList.add("gsj-pending");
  setTimeout(function () { document.documentElement.classList.remove("gsj-pending"); }, 3000);

  // Sessão do supabase-js fica no localStorage; o perfil (nome/papel/aprovado) é guardado aqui
  // pra a página abrir NA HORA, sem tela de "carregando" — a conferência real roda depois, por baixo.
  var SB_STORAGE_KEY = "sb-brulthsmuhwftodbnhpg-auth-token";
  var PROFILE_CACHE_KEY = "gsj_profile_cache_v1";
  function hasStoredSession() {
    // não depende do formato exato da sessão: basta existir alguma chave "sb-...-auth-token"
    try {
      if (localStorage.getItem(SB_STORAGE_KEY)) return true;
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i) || "";
        if (/^sb-.+-auth-token$/.test(k) && localStorage.getItem(k)) return true;
      }
    } catch (e) {}
    return false;
  }
  function readCachedProfile() {
    try {
      var p = JSON.parse(localStorage.getItem(PROFILE_CACHE_KEY) || "null");
      if (!p || !p.id || !p.approved) return null;
      if (!hasStoredSession()) return null;
      // se der pra ler o id da sessão, ele tem que bater com o do perfil guardado
      try {
        var sess = JSON.parse(localStorage.getItem(SB_STORAGE_KEY) || "null");
        var uid = sess && sess.user && sess.user.id;
        if (uid && uid !== p.id) return null;
      } catch (e2) {}
      return p;
    } catch (e) { return null; }
  }
  function writeProfileCache(id, profile) {
    try {
      localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({
        id: id, username: profile.username, nome: profile.nome, role: profile.role, approved: !!profile.approved
      }));
    } catch (e) {}
  }
  function clearProfileCache() {
    try { localStorage.removeItem(PROFILE_CACHE_KEY); } catch (e) {}
  }

  var NAV_ITEMS = [
    { key: "inicio", href: "./index.html", label: "Início", icon: "🏠" },
    { key: "orcamento", href: "./orcamento.html", label: "Orçamento", icon: "📋" },
    { key: "contrato", href: "./contrato.html", label: "Contrato", icon: "📄" },
    { key: "recibo", href: "./recibo.html", label: "Recibo", icon: "🧾" },
    { key: "termo", href: "./termo-entrega.html", label: "Termo de Entrega", icon: "📦" },
    { key: "plano", href: "./plano-de-cortes.html", label: "Plano de Cortes", icon: "📐" },
    { key: "obras", href: "./obras.html", label: "Área do cliente", icon: "👥" }
  ];

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function usernameToEmail(raw) {
    var clean = String(raw || "").trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
    return clean ? clean + EMAIL_DOMAIN : "";
  }

  // campo de senha com botão de "mostrar/esconder" (olho) — reaproveitado no
  // login e no cadastro
  function pwFieldHtml(id, label, autocomplete) {
    return (
      '<div class="gsj-auth-field"><label for="' + id + '">' + label + '</label>' +
      '<div class="gsj-pw-wrap">' +
        '<input id="' + id + '" type="password" autocomplete="' + autocomplete + '" />' +
        '<button type="button" class="gsj-pw-toggle" data-for="' + id + '" aria-label="Mostrar senha">👁</button>' +
      '</div></div>'
    );
  }

  function wirePwToggles(root) {
    root.querySelectorAll(".gsj-pw-toggle").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var input = document.getElementById(btn.getAttribute("data-for"));
        if (!input) return;
        var showing = input.type === "text";
        input.type = showing ? "password" : "text";
        btn.textContent = showing ? "👁" : "🙈";
        btn.setAttribute("aria-label", showing ? "Mostrar senha" : "Esconder senha");
      });
    });
  }

  // ---- registro de atividade (pro painel do admin) ----
  GSJ.logAction = function (acao, ferramenta, referencia) {
    if (!sb || !GSJ.user) return;
    try {
      sb.from("gsj_audit_log")
        .insert({
          user_id: GSJ.user.id,
          username: GSJ.user.username,
          acao: acao,
          ferramenta: ferramenta || null,
          referencia: referencia || null
        })
        .then(function () {}, function () {});
    } catch (e) {}
  };

  GSJ.logout = function () {
    clearProfileCache();
    if (!sb) return;
    sb.auth.signOut().finally(function () {
      location.reload();
    });
  };

  // ---- montagem da casca visual (sidebar + botão mobile + overlay) ----
  function buildShell(contentRoot, page) {
    var menuBtn = document.createElement("button");
    menuBtn.type = "button";
    menuBtn.className = "gsj-menu-btn";
    menuBtn.setAttribute("aria-label", "Abrir menu");
    menuBtn.innerHTML = "☰";

    var shell = document.createElement("div");
    shell.className = "gsj-shell";

    var overlay = document.createElement("div");
    overlay.className = "gsj-overlay";
    overlay.hidden = true;

    var sidebar = document.createElement("aside");
    sidebar.className = "gsj-sidebar";
    var navHtml = "";
    NAV_ITEMS.forEach(function (item) {
      navHtml +=
        '<a href="' + item.href + '" data-page="' + item.key + '"' +
        (item.key === page ? ' class="active"' : "") + ">" +
        item.icon + " " + item.label + "</a>";
    });
    sidebar.innerHTML =
      '<a href="./index.html" class="gsj-brand"><span class="badge">GSJ</span><span class="name">GSJ Marcenaria</span></a>' +
      '<nav class="gsj-nav">' +
        navHtml +
        '<div class="gsj-nav-sep"></div>' +
        '<a href="./admin.html" data-page="admin" id="gsjAdminLink" class="gsj-nav-admin' +
          (page === "admin" ? " active" : "") + '" hidden>🔒 Admin</a>' +
      '</nav>' +
      '<div class="gsj-sidebar-bottom">' +
        '<div class="gsj-user-info" id="gsjUserInfo"></div>' +
        '<button type="button" class="btn btn-ghost" id="gsjLogoutBtn" style="width:100%;justify-content:center;">Sair</button>' +
      '</div>';

    var main = document.createElement("main");
    // as 5 ferramentas trazem o próprio padding no <body>; com a barra lateral, esse espaço passa pra cá
    var isTool = ["orcamento", "contrato", "recibo", "termo", "plano"].indexOf(page) >= 0;
    main.className = "gsj-main" + (isTool ? " gsj-tool" : "");
    document.body.classList.add("gsj-has-shell");

    contentRoot.parentNode.insertBefore(shell, contentRoot);
    main.appendChild(contentRoot);
    shell.appendChild(sidebar);
    shell.appendChild(overlay);
    shell.appendChild(main);
    document.body.insertBefore(menuBtn, shell);

    function closeSidebar() {
      sidebar.classList.remove("open");
      overlay.hidden = true;
      menuBtn.hidden = false;
    }
    menuBtn.addEventListener("click", function () {
      sidebar.classList.add("open");
      overlay.hidden = false;
      menuBtn.hidden = true;
    });
    overlay.addEventListener("click", closeSidebar);
    sidebar.addEventListener("click", function (e) {
      if (e.target.tagName === "A") closeSidebar();
    });

    document.getElementById("gsjLogoutBtn").addEventListener("click", GSJ.logout);

    return sidebar;
  }

  // ---- tela de login / cadastro / aprovação pendente ----
  function buildGate() {
    var gate = document.createElement("div");
    gate.className = "gsj-auth-gate";
    gate.id = "gsjAuthGate";
    var box = document.createElement("div");
    box.className = "gsj-auth-box";
    box.id = "gsjAuthBox";
    var brand = document.createElement("div");
    brand.className = "gsj-auth-brand";
    brand.innerHTML = '<span class="badge">GSJ</span><span class="name">GSJ Marcenaria<small>Móveis planejados</small></span>';
    gate.appendChild(brand);
    gate.appendChild(box);
    document.body.appendChild(gate);
    return { gate: gate, box: box };
  }

  function renderLoading(box) {
    box.innerHTML =
      '<div class="gsj-auth-badge">GSJ</div><h2>Carregando…</h2>' +
      '<p class="gsj-auth-sub">Verificando seu acesso.</p>';
  }

  function renderLogin(box, onDone) {
    box.innerHTML =
      '<div class="gsj-auth-badge">GSJ</div>' +
      '<h2>Controle de acesso</h2>' +
      '<p class="gsj-auth-sub">Entre com seu usuário e senha.</p>' +
      '<p class="gsj-auth-error" id="gsjErr" hidden></p>' +
      '<form id="gsjLoginForm">' +
        '<div class="gsj-auth-field"><label for="gsjLUser">Usuário</label><input id="gsjLUser" autocomplete="username" autocapitalize="off" /></div>' +
                pwFieldHtml('gsjLPass', 'Senha', 'current-password') +
        '<div class="gsj-auth-actions"><button type="submit" class="btn btn-primary" id="gsjLBtn">Entrar</button></div>' +
      '</form>' +
      '<p class="gsj-auth-switch">Ainda não tem conta? <button type="button" id="gsjGoSignup">Criar conta</button></p>';
    wirePwToggles(box);

    document.getElementById("gsjGoSignup").addEventListener("click", function () {
      renderSignup(box, onDone);
    });
    var form = document.getElementById("gsjLoginForm");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var errEl = document.getElementById("gsjErr");
      errEl.hidden = true;
      var user = document.getElementById("gsjLUser").value;
      var pass = document.getElementById("gsjLPass").value;
      var email = usernameToEmail(user);
      if (!email || !pass) {
        errEl.textContent = "Preencha usuário e senha.";
        errEl.hidden = false;
        return;
      }
      var btn = document.getElementById("gsjLBtn");
      btn.disabled = true;
      btn.textContent = "Entrando…";
      sb.auth.signInWithPassword({ email: email, password: pass }).then(function (res) {
        if (res.error) {
          errEl.textContent = "Usuário ou senha incorretos.";
          errEl.hidden = false;
          btn.disabled = false;
          btn.textContent = "Entrar";
          return;
        }
        onDone(res.data.user, true);
      }).catch(function () {
        errEl.textContent = "Não deu pra entrar agora — verifique sua internet.";
        errEl.hidden = false;
        btn.disabled = false;
        btn.textContent = "Entrar";
      });
    });
  }

  function renderSignup(box, onDone) {
    box.innerHTML =
      '<div class="gsj-auth-badge">GSJ</div>' +
      '<h2>Criar conta</h2>' +
      '<p class="gsj-auth-sub">Sua conta nasce bloqueada — um administrador precisa liberar o acesso antes de você conseguir usar as ferramentas.</p>' +
      '<p class="gsj-auth-error" id="gsjErr" hidden></p>' +
      '<form id="gsjSignupForm">' +
        '<div class="gsj-auth-field"><label for="gsjSNome">Seu nome</label><input id="gsjSNome" autocomplete="name" /></div>' +
        '<div class="gsj-auth-field"><label for="gsjSUser">Usuário (sem espaço/acento)</label><input id="gsjSUser" autocomplete="username" autocapitalize="off" /></div>' +
                pwFieldHtml('gsjSPass', 'Senha (mín. 6 caracteres)', 'new-password') +
                pwFieldHtml('gsjSPass2', 'Confirmar senha', 'new-password') +
        '<div class="gsj-auth-actions"><button type="submit" class="btn btn-primary" id="gsjSBtn">Criar conta</button></div>' +
      '</form>' +
      '<p class="gsj-auth-switch">Já tem conta? <button type="button" id="gsjGoLogin">Entrar</button></p>';
    wirePwToggles(box);

    document.getElementById("gsjGoLogin").addEventListener("click", function () {
      renderLogin(box, onDone);
    });
    var form = document.getElementById("gsjSignupForm");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var errEl = document.getElementById("gsjErr");
      errEl.hidden = true;
      var nome = document.getElementById("gsjSNome").value.trim();
      var userRaw = document.getElementById("gsjSUser").value;
      var pass = document.getElementById("gsjSPass").value;
      var pass2 = document.getElementById("gsjSPass2").value;
      var cleanUser = String(userRaw || "").trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
      if (!cleanUser || cleanUser.length < 3) {
        errEl.textContent = "Escolha um usuário com pelo menos 3 letras/números.";
        errEl.hidden = false;
        return;
      }
      if (!pass || pass.length < 6) {
        errEl.textContent = "A senha precisa ter pelo menos 6 caracteres.";
        errEl.hidden = false;
        return;
      }
      if (pass !== pass2) {
        errEl.textContent = "As senhas não são iguais.";
        errEl.hidden = false;
        return;
      }
      var btn = document.getElementById("gsjSBtn");
      btn.disabled = true;
      btn.textContent = "Criando…";
      fetch(EDGE_SIGNUP_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: cleanUser, password: pass, nome: nome })
      }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
        .then(function (res) {
          if (!res.ok || res.body.error) {
            errEl.textContent = (res.body && res.body.error) || "Não deu pra criar a conta agora.";
            errEl.hidden = false;
            btn.disabled = false;
            btn.textContent = "Criar conta";
            return;
          }
          var email = usernameToEmail(cleanUser);
          return sb.auth.signInWithPassword({ email: email, password: pass }).then(function (res2) {
            if (res2.error) {
              errEl.textContent = "Conta criada! Mas não deu pra entrar automaticamente — tente entrar pela tela de login.";
              errEl.hidden = false;
              btn.disabled = false;
              btn.textContent = "Criar conta";
              renderLogin(box, onDone);
              return;
            }
            onDone(res2.data.user, false);
          });
        }).catch(function () {
          errEl.textContent = "Não deu pra criar a conta agora — verifique sua internet.";
          errEl.hidden = false;
          btn.disabled = false;
          btn.textContent = "Criar conta";
        });
    });
  }

  function renderPending(box, profile) {
    box.innerHTML =
      '<div class="gsj-auth-pending">' +
        '<div class="gsj-auth-icon">⏳</div>' +
        '<h2>Aguardando liberação</h2>' +
        '<p class="gsj-auth-sub">A conta <strong>' + esc(profile.username) + '</strong> foi criada, mas ainda precisa ser aprovada por um administrador antes de acessar as ferramentas.</p>' +
        '<div class="gsj-auth-actions">' +
          '<button type="button" class="btn btn-primary" id="gsjRecheck">Verificar de novo</button>' +
          '<button type="button" class="btn btn-ghost" id="gsjPendingLogout">Sair</button>' +
        '</div>' +
      '</div>';
    document.getElementById("gsjPendingLogout").addEventListener("click", GSJ.logout);
    document.getElementById("gsjRecheck").addEventListener("click", function (e) {
      e.target.disabled = true;
      e.target.textContent = "Verificando…";
      window.__gsjRecheck && window.__gsjRecheck();
    });
  }

  function renderFatalError(box, msg) {
    box.innerHTML =
      '<div class="gsj-auth-badge">GSJ</div><h2>Algo deu errado</h2>' +
      '<p class="gsj-auth-sub">' + esc(msg) + '</p>' +
      '<div class="gsj-auth-actions"><button type="button" class="btn btn-ghost" id="gsjErrLogout">Sair e tentar de novo</button></div>';
    document.getElementById("gsjErrLogout").addEventListener("click", GSJ.logout);
  }

  // ---- orquestração principal ----
  GSJ.boot = function (opts) {
    opts = opts || {};
    var page = opts.page || "";
    var contentId = opts.contentId || "gsjPageRoot";

    return new Promise(function (resolve) {
      var resolved = false;
      function resolveOnce(v) { if (!resolved) { resolved = true; resolve(v); } }

      function start() {
        var contentRoot = document.getElementById(contentId);
        if (!contentRoot) { document.documentElement.classList.remove("gsj-pending"); resolveOnce(null); return; }
        buildShell(contentRoot, page);
        document.documentElement.classList.remove("gsj-pending");

        var gateRefs = null;
        function ensureGate() { if (!gateRefs) gateRefs = buildGate(); return gateRefs; }
        function removeGate() { if (gateRefs) { gateRefs.gate.remove(); gateRefs = null; } }

        if (!sb) {
          renderFatalError(ensureGate().box, "A biblioteca da nuvem não carregou — recarregue a página.");
          return;
        }

        function applyUser(authUserId, profile) {
          GSJ.user = { id: authUserId, username: profile.username, nome: profile.nome, role: profile.role };
          var info = document.getElementById("gsjUserInfo");
          if (info) {
            info.innerHTML = "<strong>" + esc(profile.nome || profile.username) + "</strong>" +
              (profile.role === "admin" ? "Administrador" : "@" + esc(profile.username));
          }
          var adminLink = document.getElementById("gsjAdminLink");
          if (adminLink) adminLink.hidden = profile.role !== "admin";
        }

        function revealApp(authUser, profile) {
          applyUser(authUser.id, profile);
          writeProfileCache(authUser.id, profile);
          removeGate();
          resolveOnce(GSJ.user);
        }

        function checkProfile(authUser, justLoggedIn) {
          renderLoading(ensureGate().box);
          sb.from("gsj_profiles")
            .select("username, nome, role, approved")
            .eq("id", authUser.id)
            .single()
            .then(function (res) {
              if (res.error || !res.data) {
                renderFatalError(ensureGate().box, "Não encontramos seu perfil ainda. Se você acabou de criar a conta, aguarde alguns segundos e tente de novo.");
                return;
              }
              if (!res.data.approved) {
                clearProfileCache();
                renderPending(ensureGate().box, res.data);
                window.__gsjRecheck = function () { checkProfile(authUser, false); };
                return;
              }
              revealApp(authUser, res.data);
              if (justLoggedIn) GSJ.logAction("login", null, null);
            })
            .catch(function () {
              renderFatalError(ensureGate().box, "Não deu pra verificar sua conta agora — verifique sua internet e tente de novo.");
            });
        }

        function showLoginGate() {
          GSJ.user = null;
          clearProfileCache();
          renderLogin(ensureGate().box, checkProfile);
        }

        var cached = readCachedProfile();
        if (cached) {
          // abre direto, sem tela de carregando; a confirmação roda por baixo
          applyUser(cached.id, cached);
          resolveOnce(GSJ.user);
          sb.auth.getSession().then(function (res) {
            if (res.error) return;                       // sem rede: segue com o que já tem
            var session = res.data && res.data.session;
            if (!session) { showLoginGate(); return; }
            return sb.from("gsj_profiles").select("username, nome, role, approved").eq("id", session.user.id).single().then(function (r2) {
              if (r2.error || !r2.data) return;          // erro passageiro: não atrapalha
              if (!r2.data.approved) {
                clearProfileCache();
                renderPending(ensureGate().box, r2.data);
                window.__gsjRecheck = function () { checkProfile(session.user, false); };
                return;
              }
              applyUser(session.user.id, r2.data);
              writeProfileCache(session.user.id, r2.data);
            });
          }).catch(function () {});
          return;
        }

        // primeira vez / sem cache: fluxo normal com a tela de verificação
        renderLoading(ensureGate().box);
        sb.auth.getSession().then(function (res) {
          var session = res.data && res.data.session;
          if (!session) { showLoginGate(); return; }
          checkProfile(session.user, false);
        }).catch(function () { showLoginGate(); });
      }

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
      } else {
        start();
      }
    });
  };
})();
