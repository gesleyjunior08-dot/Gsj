// Botão "Assinar" do Orçamento e do Contrato.
// Cada página chama, dentro do seu script (onde existe o `state`):
//   GSJ.sign.attach({ doc, key, getState, render, save, rotulo(), ref() })
// e, ao montar o documento (updatePreview):
//   GSJ.sign.check(state, safeSave)            -> remove a assinatura se o documento foi alterado depois
//   GSJ.sign.spacer(state)                      -> espaço no campo do cliente (alinha as linhas)
//   GSJ.sign.col(state, htmlOriginalDaColuna)   -> coluna da GSJ já assinada (ou a original, se não assinado)
//
// A assinatura (desenho do usuário) fica guardada neste aparelho; o documento assinado leva a
// imagem junto no próprio `state` (state.assinatura), então continua assinado ao salvar/abrir na nuvem.
// É uma assinatura eletrônica simples (imagem + nome + data/hora + código do documento) —
// não é certificado digital ICP-Brasil.
(function () {
  "use strict";
  var GSJ = (window.GSJ = window.GSJ || {});

  var RAZAO = "GSJ - DESIGN EM MADEIRA";   // razão social do CNPJ da GSJ
  var EXCLUI = { assinatura: 1, cloudId: 1, cloudStatus: 1, status: 1 };   // não contam como "conteúdo"

  // ---------------- código do documento (hash simples e estável) ----------------
  function canon(v) {
    if (v === null || typeof v !== "object") return JSON.stringify(v === undefined ? null : v);
    if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
    return "{" + Object.keys(v).sort().filter(function (k) { return v[k] !== undefined; })
      .map(function (k) { return JSON.stringify(k) + ":" + canon(v[k]); }).join(",") + "}";
  }
  function cyrb53(str, seed) {
    var h1 = 0xdeadbeef ^ (seed || 0), h2 = 0x41c6ce57 ^ (seed || 0);
    for (var i = 0, ch; i < str.length; i++) {
      ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
  }
  function hashDoc(state) {
    var o = {};
    Object.keys(state || {}).forEach(function (k) { if (!EXCLUI[k]) o[k] = state[k]; });
    return cyrb53(canon(o));
  }
  function codigoDe(hash) { var h = hash.slice(8, 16).toUpperCase(); return h.slice(0, 4) + "-" + h.slice(4); }

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function dataHora(iso) {
    try {
      var d = new Date(iso);
      return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) + " às " +
        d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
    } catch (e) { return iso; }
  }

  // ---------------- assinatura desenhada: guardada neste aparelho, por usuário ----------------
  function lsKey() { return "gsj_assinatura_v1:" + ((GSJ.user && GSJ.user.id) || "local"); }
  function lerAssinatura() {
    try { var o = JSON.parse(localStorage.getItem(lsKey()) || "null"); return o && o.img ? o : null; } catch (e) { return null; }
  }
  function gravarAssinatura(img) {
    var o = { img: img, nome: (GSJ.user && (GSJ.user.nome || GSJ.user.username)) || "", at: new Date().toISOString() };
    try { localStorage.setItem(lsKey(), JSON.stringify(o)); } catch (e) {}
    return o;
  }

  // ---------------- estilo ----------------
  var css =
    ".sig-signed{height:46px;display:flex;align-items:flex-end;justify-content:center}" +
    ".sig-signed img{max-height:44px;max-width:100%;display:block}" +
    ".sig-signed-sp{height:46px}" +
    ".sig-stamp{display:block;margin-top:3px;font-size:8.5px;line-height:1.35;color:#6b5d4f}" +
    ".sig-digital{display:flex;gap:7px;align-items:flex-start;margin-top:5px;padding-top:5px;border-top:1px solid #e3d9c8}" +
    ".sig-digital .sd-l{flex:0 0 40%;font-family:Arial,Helvetica,sans-serif;font-weight:600;font-size:9.5px;line-height:1.25;color:#2b2118;overflow-wrap:anywhere;text-transform:uppercase}" +
    ".sig-digital .sd-r{flex:1;font-family:Georgia,'Times New Roman',serif;font-size:7.6px;line-height:1.3;color:#3d3328}" +
    ".btn-assinar{display:flex;width:100%;justify-content:center;align-items:center;gap:8px;margin:0 0 8px;background:transparent;border:1.5px solid var(--accent,#954f14);color:var(--accent,#954f14);border-radius:10px;font:inherit;font-weight:700;font-size:14px;padding:11px 16px;cursor:pointer}" +
    ".btn-assinar:hover{background:rgba(149,79,20,.08)}" +
    ".btn-assinar.feito{border-color:var(--line,#d9cdb9);color:var(--text-muted,#6b5d4f);font-weight:600}" +
    ".ass-box{margin:0 0 10px;font-size:12.5px;line-height:1.45;color:var(--text-muted,#6b5d4f)}" +
    ".ass-box[hidden]{display:none!important}" +
    ".ass-box.ok{color:#1b6e3c}.ass-box.aviso{color:var(--danger,#a6402f)}" +
    ".ass-box a{color:var(--accent,#954f14);cursor:pointer;text-decoration:underline;margin-left:6px}" +
    "#gsjSigModal{position:fixed;inset:0;z-index:9999;background:rgba(30,20,10,.6);display:flex;align-items:center;justify-content:center;padding:16px}" +
    "#gsjSigModal[hidden]{display:none!important}" +
    "#gsjSigModal .box{background:var(--surface,#fffdf8);color:var(--text,#2b2118);border-radius:16px;padding:18px;width:100%;max-width:560px;box-shadow:0 20px 60px rgba(0,0,0,.35)}" +
    "#gsjSigModal h3{margin:0 0 4px;font-size:17px}" +
    "#gsjSigModal p{margin:0 0 10px;font-size:13px;color:var(--text-muted,#6b5d4f)}" +
    "#gsjSigModal canvas{display:block;width:100%;height:200px;background:#fff;border:1.5px dashed var(--line,#d9cdb9);border-radius:10px;touch-action:none;cursor:crosshair}" +
    "#gsjSigModal .acoes{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}" +
    "#gsjSigModal .acoes .grow{flex:1}" +
    "#gsjSigModal .err{color:var(--danger,#a6402f);font-size:12.5px;margin-top:8px;min-height:1em}" +
    "@media print{.btn-assinar,.ass-box,#gsjSigModal{display:none!important}}";
  function injetaCss() {
    if (document.getElementById("gsjSignCss")) return;
    var st = document.createElement("style"); st.id = "gsjSignCss"; st.textContent = css; document.head.appendChild(st);
  }
  injetaCss();

  // ---------------- tela para desenhar a assinatura ----------------
  function abrirPad(onSalvar) {
    injetaCss();
    var m = document.getElementById("gsjSigModal");
    if (m) m.remove();
    m = document.createElement("div");
    m.id = "gsjSigModal";
    m.setAttribute("role", "dialog"); m.setAttribute("aria-modal", "true");
    m.innerHTML =
      '<div class="box">' +
        '<h3>Sua assinatura</h3>' +
        '<p>Desenhe com o dedo (ou o mouse) dentro do quadro. Ela fica guardada neste aparelho — você só desenha uma vez.</p>' +
        '<canvas id="gsjSigPad" aria-label="Quadro para desenhar a assinatura"></canvas>' +
        '<div class="err" id="gsjSigErr" role="alert"></div>' +
        '<div class="acoes">' +
          '<button type="button" class="btn" id="gsjSigLimpar">Limpar</button>' +
          '<span class="grow"></span>' +
          '<button type="button" class="btn" id="gsjSigCancelar">Cancelar</button>' +
          '<button type="button" class="btn btn-primary" id="gsjSigOk">Salvar e assinar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(m);

    var cv = m.querySelector("#gsjSigPad"), errEl = m.querySelector("#gsjSigErr");
    var dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    var W = cv.clientWidth || 520, H = 200;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    var ctx = cv.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = 2.6; ctx.strokeStyle = "#1b2a6b";
    var desenhando = false, ultimo = null, pontos = 0;

    function pos(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    cv.addEventListener("pointerdown", function (e) {
      e.preventDefault(); desenhando = true; ultimo = pos(e); pontos++;
      try { cv.setPointerCapture(e.pointerId); } catch (x) {}
      ctx.beginPath(); ctx.arc(ultimo.x, ultimo.y, 1.3, 0, 6.3); ctx.fillStyle = "#1b2a6b"; ctx.fill();
    });
    cv.addEventListener("pointermove", function (e) {
      if (!desenhando) return; e.preventDefault();
      var p = pos(e), meio = { x: (ultimo.x + p.x) / 2, y: (ultimo.y + p.y) / 2 };
      ctx.beginPath(); ctx.moveTo(ultimo.x, ultimo.y); ctx.quadraticCurveTo(ultimo.x, ultimo.y, meio.x, meio.y); ctx.stroke();
      ultimo = p; pontos++; errEl.textContent = "";
    });
    function fim() { desenhando = false; }
    cv.addEventListener("pointerup", fim); cv.addEventListener("pointercancel", fim); cv.addEventListener("pointerleave", fim);

    m.querySelector("#gsjSigLimpar").addEventListener("click", function () {
      ctx.clearRect(0, 0, W, H); pontos = 0; errEl.textContent = "";
    });
    function fechar() { m.remove(); }
    m.querySelector("#gsjSigCancelar").addEventListener("click", fechar);
    m.addEventListener("click", function (e) { if (e.target === m) fechar(); });
    m.querySelector("#gsjSigOk").addEventListener("click", function () {
      if (pontos < 12) { errEl.textContent = "Desenhe sua assinatura no quadro antes de salvar."; return; }
      var img = recortar(cv);
      if (!img) { errEl.textContent = "Não consegui ler o desenho. Tente de novo."; return; }
      fechar(); onSalvar(img);
    });
  }

  // recorta as margens em branco e reduz (PNG com fundo transparente)
  function recortar(cv) {
    var w = cv.width, h = cv.height, d;
    try { d = cv.getContext("2d").getImageData(0, 0, w, h).data; } catch (e) { return null; }
    var x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) return null;
    var pad = 6; x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
    var cw = x1 - x0 + 1, ch = y1 - y0 + 1, esc2 = Math.min(1, 520 / cw, 160 / ch);
    var out = document.createElement("canvas"); out.width = Math.max(1, Math.round(cw * esc2)); out.height = Math.max(1, Math.round(ch * esc2));
    out.getContext("2d").drawImage(cv, x0, y0, cw, ch, 0, 0, out.width, out.height);
    return out.toDataURL("image/png");
  }

  // ---------------- API usada pelas páginas ----------------
  var ui = null;   // { refresh(msgAviso?) } da página atual

  // carimbo no estilo de assinatura digital de PDF (razão social + CNPJ | "Assinado eletronicamente por…")
  function dadosStamp(iso) {
    try {
      var d = new Date(iso), p = {};
      new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(d)
        .forEach(function (x) { p[x.type] = x.value; });
      return p.year + "." + p.month + "." + p.day + " " + p.hour + ":" + p.minute + ":" + p.second + " -03'00'";
    } catch (e) { return iso; }
  }
  function carimbo(a) {
    var cnpj = String(a.empresa.cnpj || "").replace(/\D/g, "");
    var id = esc(a.empresa.razao) + (cnpj ? ":" + cnpj : "");
    return '<div class="sig-digital">' +
      '<div class="sd-l">' + esc(a.empresa.razao) + (a.empresa.cnpj ? '<br/>CNPJ: ' + esc(a.empresa.cnpj) : '') + '</div>' +
      '<div class="sd-r">Assinado eletronicamente por ' + id +
        '<br/>Dados: ' + esc(dadosStamp(a.em)) +
        '<br/>Responsável: ' + esc(a.nome) + ' · Código do documento: ' + esc(a.codigo) + '</div>' +
      '</div>';
  }

  GSJ.sign = {
    _hash: hashDoc, _canon: canon,

    // chamada no começo de updatePreview(): se o conteúdo mudou depois de assinar, a assinatura cai
    check: function (state, save) {
      var a = state && state.assinatura;
      if (!a) return;
      if (a.hash !== hashDoc(state)) {
        state.assinatura = null;
        try { if (save) save(); } catch (e) {}
        if (ui) ui.refresh("O documento foi alterado depois de assinado — a assinatura foi removida. Toque em Assinar de novo.");
      }
    },
    spacer: function (state) { return state && state.assinatura && state.assinatura.img ? '<div class="sig-signed-sp"></div>' : ""; },
    col: function (state, original) {
      var a = state && state.assinatura;
      if (!a || !a.img) return original;
      var rot = (a.rotulo || []).map(esc).join("<br/>");
      return '<div class="sig-col">' +
        '<div class="sig-signed"><img src="' + a.img + '" alt="Assinatura"/></div>' +
        '<div class="sig-line"></div>' +
        '<p class="sig-label">' + rot +
          (a.empresa ? '' : '<span class="sig-stamp">Assinado eletronicamente por ' + esc(a.nome) + ' em ' + esc(dataHora(a.em)) +
          '<br/>Código do documento: ' + esc(a.codigo) + '</span>') + '</p>' +
        (a.empresa ? carimbo(a) : '') +
        '</div>';
    },

    attach: function (cfg) {
      var btnPrint = document.getElementById("btnPrint");
      if (!btnPrint || document.getElementById("btnAssinar")) return;
      injetaCss();

      var btn = document.createElement("button");
      btn.type = "button"; btn.id = "btnAssinar"; btn.className = "btn-assinar";
      btnPrint.insertAdjacentElement("beforebegin", btn);
      var box = document.createElement("div");
      box.id = "assBox"; box.className = "ass-box"; box.hidden = true; box.setAttribute("role", "status");
      btnPrint.insertAdjacentElement("beforebegin", box);

      function refresh(aviso) {
        var st = cfg.getState(), a = st && st.assinatura;
        box.textContent = ""; box.className = "ass-box";
        if (a && a.img) {
          btn.className = "btn-assinar feito"; btn.textContent = "Remover assinatura";
          box.hidden = false; box.className = "ass-box ok";
          box.textContent = "✔ Assinado por " + a.nome + " em " + dataHora(a.em) + " · código " + a.codigo + ". O PDF e o WhatsApp saem assinados.";
          var l = document.createElement("a"); l.textContent = "Trocar minha assinatura";
          l.addEventListener("click", function () { abrirPad(function (img) { gravarAssinatura(img); assinar(false); }); });
          box.appendChild(l);
        } else {
          btn.className = "btn-assinar"; btn.textContent = "✍️ Assinar";
          if (aviso) { box.hidden = false; box.className = "ass-box aviso"; box.textContent = aviso; }
          else box.hidden = true;
        }
      }
      ui = { refresh: refresh };

      function assinar(enviar) {
        var st = cfg.getState();
        var mina = lerAssinatura();
        if (!mina) { abrirPad(function (img) { gravarAssinatura(img); assinar(enviar); }); return; }
        var h = hashDoc(st);
        st.assinatura = {
          img: mina.img,
          nome: mina.nome || (GSJ.user && (GSJ.user.nome || GSJ.user.username)) || "GSJ",
          rotulo: (cfg.rotulo && cfg.rotulo()) || [],
          empresa: { razao: (cfg.razao && cfg.razao()) || RAZAO, cnpj: (cfg.cnpj && cfg.cnpj()) || "" },
          em: new Date().toISOString(),
          hash: h, codigo: codigoDe(h)
        };
        cfg.render();               // o documento na tela já aparece assinado
        if (cfg.save) cfg.save();
        refresh();
        try { if (GSJ.logAction) GSJ.logAction("assinar", cfg.key || null, (cfg.ref && cfg.ref()) || null); } catch (e) {}
        if (enviar !== false && GSJ.wpp && GSJ.wpp.run) GSJ.wpp.run();   // já abre o envio pelo WhatsApp
      }

      btn.addEventListener("click", function () {
        var st = cfg.getState();
        if (st && st.assinatura) {              // já assinado -> remover
          st.assinatura = null; cfg.render(); if (cfg.save) cfg.save(); refresh();
          if (GSJ.wpp && GSJ.wpp.reset) GSJ.wpp.reset();
          return;
        }
        assinar(true);
      });
      refresh();
    }
  };
})();
