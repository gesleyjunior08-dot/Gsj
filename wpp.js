// Enviar o documento (PDF) direto pelo WhatsApp — usado por Orçamento, Contrato, Recibo,
// Termo de Entrega e Plano de Cortes. Cada página chama:
//   GSJ.wpp.attach({ doc: "Orçamento", format: "a4", margin: [13, 15],
//                    cliente: function(){...}, telefone: function(){...}, ref: function(){...} })
// O botão "Gerar PDF" continua igual (PDF vetorial pela impressão do navegador).
// Este aqui monta um PDF de verdade (A4/A5, várias páginas) a partir da folha na tela e:
//   - no celular (e navegadores com compartilhamento de arquivo): abre a lista de apps
//     já com o PDF anexado — é só escolher o WhatsApp e o contato;
//   - no computador / sem suporte: baixa o PDF e mostra o botão pra abrir o WhatsApp.
(function () {
  "use strict";

  // as bibliotecas ficam no próprio app (lib-*.js na raiz); se não carregarem, tenta o CDN
  var HTML2CANVAS = ["./lib-html2canvas.min.js", "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"];
  var JSPDF = ["./lib-jspdf.min.js", "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"];
  var PX_PER_MM = 96 / 25.4;
  var SCALE = 2.5;                       // nitidez do PDF (≈ 240 dpi)
  var FORMATS = { a4: { w: 210, h: 297 }, a5: { w: 148, h: 210 } };

  var GSJ = (window.GSJ = window.GSJ || {});

  // ---------------- utilidades ----------------
  function loadOne(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src; s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error("falha ao carregar " + src)); };
      document.head.appendChild(s);
    });
  }
  function loadScript(srcs, ok) {          // tenta cada endereço até um funcionar
    var i = 0;
    function next() {
      if (ok()) return Promise.resolve();
      if (i >= srcs.length) return Promise.reject(new Error("Não consegui carregar a biblioteca de PDF — verifique a internet."));
      return loadOne(srcs[i++]).then(function () { if (!ok()) return next(); }, next);
    }
    return next();
  }
  var libsPromise = null;
  function ensureLibs() {
    if (window.html2canvas && window.jspdf) return Promise.resolve();
    if (!libsPromise) {
      libsPromise = Promise.all([
        loadScript(HTML2CANVAS, function () { return !!window.html2canvas; }),
        loadScript(JSPDF, function () { return !!window.jspdf; })
      ]).catch(function (e) { libsPromise = null; throw e; });
    }
    return libsPromise;
  }

  function semAcento(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  function nomeArquivo(doc, cliente, ref) {
    var partes = [doc + " GSJ"];
    if (cliente) partes.push(cliente);
    else if (ref) partes.push(ref);
    var n = semAcento(partes.join(" - ")).replace(/[^A-Za-z0-9 _.\-]/g, "").replace(/\s+/g, " ").trim();
    return (n || "Documento GSJ").slice(0, 80) + ".pdf";
  }
  function soDigitos(s) { return String(s || "").replace(/\D/g, ""); }
  function telefoneWa(raw) {
    var d = soDigitos(raw);
    if (d.length === 10 || d.length === 11) return "55" + d;
    if ((d.length === 12 || d.length === 13) && d.indexOf("55") === 0) return d;
    return "";
  }
  function primeiroNome(s) { return String(s || "").trim().split(/\s+/)[0] || ""; }

  // ---------------- folha -> páginas ----------------
  // blocos que não devem ser cortados ao meio quando houver outra opção
  var KEEP_SELECTOR = ".sheet-rest, .sheet-clause, .sheet-signature, tr, .corte-fig, svg, img";
  // títulos que devem ficar grudados no bloco logo abaixo deles
  var TITLE_SELECTOR = ".corte-sheet-title, .sheet-label";

  function linhaEmBranco(ctx, y, w) {
    var d = ctx.getImageData(0, y, w, 1).data;
    for (var x = 0; x < w * 4; x += 8) {            // amostra a cada 2 px
      if (d[x] < 244 || d[x + 1] < 244 || d[x + 2] < 244) return false;
    }
    return true;
  }

  function calcularCortes(canvas, blocks, pageInnerH) {
    var H = canvas.height, W = canvas.width, ctx = canvas.getContext("2d", { willReadFrequently: true });
    var cuts = [0], y = 0, guarda = 0;
    while (H - y > pageInnerH + 2 && guarda++ < 40) {
      var limite = y + pageInnerH, corte = limite;
      // 1) um bloco "inteiro" atravessa o limite da página? corta antes dele
      var melhor = null;
      for (var i = 0; i < blocks.length; i++) {
        var b = blocks[i], h = b.bottom - b.top;
        if (b.top < limite - 1 && b.bottom > limite + 1 && b.top > y + pageInnerH * 0.3 && h < pageInnerH * 0.85) {
          if (melhor === null || b.top < melhor) melhor = b.top;
        }
      }
      if (melhor !== null) corte = Math.floor(melhor);
      else {
        // 2) senão, procura uma linha em branco logo acima do limite (entre duas linhas de texto)
        var minY = Math.max(y + 1, Math.floor(limite - pageInnerH * 0.12));
        for (var yy = Math.floor(limite); yy >= minY; yy--) {
          if (linhaEmBranco(ctx, yy, W)) { corte = yy; break; }
        }
      }
      cuts.push(corte);
      y = corte;
    }
    cuts.push(H);
    return cuts;
  }

  // celulares Android (principalmente os mais simples) têm pouca memória para imagens grandes:
  // limita o tamanho total da imagem e, se mesmo assim falhar, tenta de novo menor
  var ANDROID = /Android/i.test(navigator.userAgent || "");
  var MAX_PIXELS = ANDROID ? 9e6 : 22e6;
  function escolherEscala(wPx, hPx, base) {
    var s = Math.min(base, Math.sqrt(MAX_PIXELS / Math.max(1, wPx * hPx)), 12000 / Math.max(1, hPx));
    return Math.max(1.2, Math.round(s * 100) / 100);
  }
  function etapa(cb, t) { try { if (cb) cb(t); } catch (e) {} return new Promise(function (r) { setTimeout(r, 30); }); }  // deixa a tela atualizar o texto

  function gerarPdf(opts, onEtapa) {
    var fmt = FORMATS[opts.format] || FORMATS.a4;
    var my = opts.margin[0], mx = opts.margin[1];
    var innerWmm = fmt.w - 2 * mx, innerHmm = fmt.h - 2 * my;
    var innerWpx = Math.round(innerWmm * PX_PER_MM);
    var sheet = document.querySelector(opts.sheet || "#sheet");
    if (!sheet) return Promise.reject(new Error("Não achei o documento na tela."));
    var diag = { etapa: "início", escala: null, tamanho: null, tentativas: 0 };
    function falha(e) { var err = e instanceof Error ? e : new Error(String(e)); err.diag = diag; throw err; }

    return etapa(onEtapa, "Carregando…")
      .then(function () { diag.etapa = "bibliotecas"; return ensureLibs(); })
      .then(function () { return (document.fonts && document.fonts.ready) ? document.fonts.ready : null; })
      .then(function () { diag.etapa = "montar"; return etapa(onEtapa, "Montando documento…"); })
      .then(function () {
        // cópia da folha fora da tela, na largura exata do papel (sem depender do tamanho do celular)
        var holder = document.createElement("div");
        holder.setAttribute("aria-hidden", "true");
        holder.style.cssText = "position:fixed;left:-20000px;top:0;width:" + innerWpx + "px;background:#fff;pointer-events:none;";
        var clone = sheet.cloneNode(true);
        clone.removeAttribute("id");
        clone.style.cssText = "box-shadow:none;border:none;border-radius:0;max-width:none;width:100%;padding:0;overflow:visible;background:#fff;margin:0;";
        holder.appendChild(clone);
        document.body.appendChild(holder);

        var base = clone.getBoundingClientRect();
        var hPx = Math.ceil(base.height);
        diag.tamanho = innerWpx + "x" + hPx;
        // blocos em px de tela (sem escala); a escala só é decidida agora, pelo tamanho do documento
        var blocks = Array.prototype.map.call(clone.querySelectorAll(KEEP_SELECTOR), function (el) {
          var r = el.getBoundingClientRect();
          return { top: r.top - base.top, bottom: r.bottom - base.top };
        });
        Array.prototype.forEach.call(clone.querySelectorAll(TITLE_SELECTOR), function (el) {
          var nx = el.nextElementSibling; if (!nx) return;
          var r = el.getBoundingClientRect(), r2 = nx.getBoundingClientRect();
          blocks.push({ top: r.top - base.top, bottom: r2.bottom - base.top });
        });
        blocks = blocks.filter(function (b) { return b.bottom - b.top > 4; });

        function renderizar(escala, simples) {
          diag.escala = escala; diag.tentativas++;
          if (simples) {                              // última tentativa: tira imagens de fundo/efeitos que alguns navegadores não conseguem desenhar
            diag.simples = true;
            Array.prototype.forEach.call(clone.querySelectorAll("*"), function (el) {
              try { el.style.backgroundImage = "none"; el.style.boxShadow = "none"; el.style.filter = "none"; } catch (e) {}
            });
          }
          return window.html2canvas(clone, {
            scale: escala, backgroundColor: "#ffffff", useCORS: true, logging: false,
            width: innerWpx, windowWidth: innerWpx
          });
        }
        var escala = escolherEscala(innerWpx, hPx, SCALE);
        diag.etapa = "imagem";
        return etapa(onEtapa, "Gerando imagem…")
          .then(function () { return renderizar(escala); })
          .catch(function (e1) {                     // memória/limite do aparelho: tenta de novo menor
            diag.erro1 = e1 && e1.message;
            return etapa(onEtapa, "Tentando de novo…").then(function () { return renderizar(Math.max(1.1, escala * 0.65)); });
          })
          .catch(function (e2) {                     // ainda falhou: versão simplificada (sem imagens de fundo)
            diag.erro2 = e2 && e2.message;
            return etapa(onEtapa, "Tentando versão simples…").then(function () { return renderizar(Math.max(1.1, escala * 0.65), true); });
          })
          .then(function (canvas) { holder.remove(); return { canvas: canvas, blocks: blocks, escala: diag.escala }; },
                function (e) {
                  holder.remove();
                  try { diag.pilha = String((e && e.stack) || "").split("\n").slice(1, 3).join(" | ").replace(/https?:\/\/[^ )]*\//g, "").slice(0, 160); } catch (x) {}
                  throw e;
                });
      })
      .then(function (r) {
        diag.etapa = "pdf";
        return etapa(onEtapa, "Criando PDF…").then(function () {
          var canvas = r.canvas, esc = r.escala;
          if (!canvas || !canvas.width || !canvas.height) throw new Error("a imagem do documento saiu vazia");
          var pageInnerH = innerHmm * PX_PER_MM * esc;
          var blocosEsc = r.blocks.map(function (b) { return { top: b.top * esc, bottom: b.bottom * esc }; });
          var cuts = calcularCortes(canvas, blocosEsc, pageInnerH);
          var jsPDF = window.jspdf.jsPDF;
          var pdf = new jsPDF({ unit: "mm", format: [fmt.w, fmt.h], orientation: "portrait", compress: true });
          for (var i = 0; i < cuts.length - 1; i++) {
            var y0 = cuts[i], y1 = cuts[i + 1], h = y1 - y0;
            if (h < 4) continue;
            var part = document.createElement("canvas");
            part.width = canvas.width; part.height = h;
            var pc = part.getContext("2d");
            pc.fillStyle = "#fff"; pc.fillRect(0, 0, part.width, part.height);
            pc.drawImage(canvas, 0, y0, canvas.width, h, 0, 0, canvas.width, h);
            if (i > 0) pdf.addPage([fmt.w, fmt.h], "portrait");
            pdf.addImage(part.toDataURL("image/jpeg", 0.92), "JPEG", mx, my, innerWmm, h / esc / PX_PER_MM, undefined, "FAST");
            part.width = part.height = 0;            // libera memória
          }
          canvas.width = canvas.height = 0;
          try { pdf.setProperties({ title: opts.titulo || "Documento GSJ", author: "GSJ Marcenaria & Móveis Planejados" }); } catch (e) {}
          return { blob: pdf.output("blob"), paginas: pdf.getNumberOfPages() };
        });
      })
      .catch(falha);
  }

  // ---------------- botão + fluxo de envio ----------------
  var css =
    ".btn-wpp{display:flex;width:100%;justify-content:center;align-items:center;gap:8px;margin:8px 0 0;background:#1f9d55;border:1px solid #1f9d55;color:#fff;border-radius:10px;font:inherit;font-weight:700;font-size:14px;padding:12px 16px;cursor:pointer}" +
    ".btn-wpp:hover{background:#188246;border-color:#188246}" +
    ".btn-wpp:disabled{opacity:.6;cursor:default}" +
    ".btn-wpp svg{width:17px;height:17px;flex:none}" +
    ".wpp-box{margin:10px 0 0;font-size:13px;line-height:1.45;color:var(--text-muted,#6b5d4f)}" +
    ".wpp-box[hidden]{display:none!important}" +
    ".wpp-box.err{color:var(--danger,#a6402f)}" +
    ".wpp-box .btn{margin:8px 8px 0 0}" +
    "@media print{.btn-wpp,.wpp-box{display:none!important}}";
  var ICON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.5 3.5A11.8 11.8 0 0 0 12 0C5.4 0 .1 5.3.1 11.9c0 2.1.6 4.1 1.6 5.9L0 24l6.4-1.7a11.9 11.9 0 0 0 5.6 1.4h0c6.600 0 11.900-5.300 11.900-11.900 0-3.200-1.200-6.200-3.400-8.300zM12 21.700h0a9.900 9.900 0 0 1-5-1.400l-.4-.2-3.800 1 1-3.700-.2-.4a9.900 9.900 0 0 1-1.500-5.200c0-5.500 4.400-9.900 9.900-9.900 2.600 0 5.100 1 7 2.900a9.800 9.800 0 0 1 2.900 7c0 5.500-4.500 9.900-9.900 9.900zm5.400-7.400c-.3-.1-1.800-.9-2-1s-.5-.1-.7.1-.8 1-.9 1.200-.3.200-.6.100a8 8 0 0 1-4-3.500c-.3-.5.300-.5.900-1.600.1-.2 0-.4 0-.5l-.9-2.200c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.100-.8.400s-1 1-1 2.400 1 2.800 1.200 3c.1.200 2 3.100 4.900 4.300 1.800.8 2.500.8 3.400.7.600-.1 1.800-.7 2-1.400s.3-1.300.2-1.400-.3-.2-.6-.3z"/></svg>';

  GSJ.wpp = {
    // exposto pra teste
    _gerarPdf: gerarPdf, _telefoneWa: telefoneWa, _nomeArquivo: nomeArquivo,

    attach: function (cfg) {
      var btnPrint = document.getElementById("btnPrint");
      if (!btnPrint || document.getElementById("btnWpp")) return;

      if (!document.getElementById("gsjWppCss")) {
        var st = document.createElement("style"); st.id = "gsjWppCss"; st.textContent = css; document.head.appendChild(st);
      }
      var btn = document.createElement("button");
      btn.type = "button"; btn.id = "btnWpp"; btn.className = "btn-wpp";
      var rotulo = ICON + "<span>Enviar no WhatsApp</span>";
      btn.innerHTML = rotulo;
      btnPrint.insertAdjacentElement("afterend", btn);
      var box = document.createElement("div");
      box.className = "wpp-box"; box.id = "wppBox"; box.hidden = true; box.setAttribute("role", "status");
      btn.insertAdjacentElement("afterend", box);

      var VERSAO = "v20";
      var pronto = null;           // PDF já gerado (quando o celular exige um novo toque pra compartilhar)
      var ultimo = null;           // último PDF gerado (painel de envio)
      function setRotulo(t) { btn.querySelector("span").textContent = t; }
      function msg(texto, erro) { box.hidden = !texto; box.className = "wpp-box" + (erro ? " err" : ""); box.textContent = texto || ""; }
      function descartarPronto() { if (pronto) { pronto = null; } ultimo = null; setRotulo("Enviar no WhatsApp"); }
      document.addEventListener("input", descartarPronto, true);
      // usados pelo botão "Assinar": descarta PDF antigo e dispara o envio
      GSJ.wpp.reset = descartarPronto;
      GSJ.wpp.run = function () { descartarPronto(); if (!btn.disabled) btn.click(); };

      function textoMensagem() {
        var nome = cfg.saudacao === false ? "" : primeiroNome(cfg.cliente && cfg.cliente());
        var ref = cfg.ref && cfg.ref();
        return (nome ? "Olá, " + nome + "! " : "Olá! ") + "Segue o " + cfg.doc.toLowerCase() + (ref ? " (" + ref + ")" : "") +
          " da GSJ Marcenaria & Móveis Planejados. Qualquer dúvida é só me chamar.";
      }
      function linkWa() {
        var tel = telefoneWa(cfg.telefone && cfg.telefone());
        return "https://wa.me/" + tel + "?text=" + encodeURIComponent(textoMensagem());
      }
      function baixar(file) {
        var url = URL.createObjectURL(file);
        var a = document.createElement("a");
        a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
      }
      function podeCompartilhar(file) {
        try { return !!(navigator.canShare && navigator.share && navigator.canShare({ files: [file] })); } catch (e) { return false; }
      }
      function motivo(e) { return e ? ((e.name || "Erro") + (e.message ? " – " + e.message : "")) : "sem detalhe"; }

      // Painel que fica sempre na tela depois que o PDF é gerado: nunca deixa o toque "sem resposta".
      function painel(file, aviso, detalhe, erro) {
        ultimo = file;
        box.hidden = false; box.className = "wpp-box" + (erro ? " err" : ""); box.textContent = "";
        var p = document.createElement("div");
        p.textContent = aviso;
        box.appendChild(p);
        if (detalhe) {
          var d = document.createElement("div");
          d.style.cssText = "font-size:11px;opacity:.75;margin-top:4px";
          d.textContent = detalhe;
          box.appendChild(d);
        }
        if (podeCompartilhar(file)) {
          var s = document.createElement("button");
          s.type = "button"; s.className = "btn btn-primary"; s.textContent = "Compartilhar PDF";
          s.addEventListener("click", function () {
            // novo toque = permissão nova do navegador; manda só o arquivo (sem texto/título) pra ser o mais compatível
            var t0 = Date.now();
            navigator.share({ files: [file] }).then(function () {
              painel(file, "Pronto — escolha o contato no WhatsApp para enviar.");
            }, function (e) {
              if (e && e.name === "AbortError" && Date.now() - t0 > 700) return;   // fechou a lista de propósito
              painel(file, "O celular não abriu a lista de compartilhamento. Use as opções abaixo.", "Motivo: " + motivo(e), true);
            });
          });
          box.appendChild(s);
        }
        if (erro || !podeCompartilhar(file)) {      // caminho garantido: baixa o PDF e já abre o WhatsApp
          var g = document.createElement("button");
          g.type = "button"; g.className = "btn btn-primary"; g.textContent = "Baixar PDF e abrir WhatsApp";
          g.addEventListener("click", function () {
            baixar(file);
            var q = box.querySelector(".wpp-baixou");
            if (!q) { q = document.createElement("div"); q.className = "wpp-baixou"; q.style.cssText = "font-size:12px;margin-top:6px"; box.appendChild(q); }
            q.textContent = "PDF baixado (" + file.name + "). No WhatsApp, toque no clipe 📎 → Documento → escolha esse arquivo (fica em Downloads).";
            setTimeout(function () { try { window.open(linkWa(), "_blank", "noopener"); } catch (e) { location.href = linkWa(); } }, 500);
          });
          box.appendChild(g);
        }
        var a = document.createElement("a");
        a.className = "btn"; a.href = linkWa(); a.target = "_blank"; a.rel = "noopener";
        a.textContent = "Abrir WhatsApp ↗";
        box.appendChild(a);
        var b = document.createElement("button");
        b.type = "button"; b.className = "btn"; b.textContent = "Baixar PDF";
        b.addEventListener("click", function () {
          baixar(file);
          var q = box.querySelector(".wpp-baixou");
          if (!q) { q = document.createElement("div"); q.className = "wpp-baixou"; q.style.cssText = "font-size:12px;margin-top:6px"; box.appendChild(q); }
          q.textContent = "Baixado (" + file.name + "). No WhatsApp, toque no clipe 📎 → Documento e escolha esse arquivo.";
        });
        box.appendChild(b);
        var v = document.createElement("div");
        v.style.cssText = "font-size:10px;opacity:.55;margin-top:6px";
        v.textContent = "Envio " + VERSAO + " · " + file.name + " · " + Math.round(file.size / 1024) + " KB";
        box.appendChild(v);
      }

      function aguardarToque(file) {      // o navegador só deixa compartilhar logo depois de um toque
        pronto = file; setRotulo("Toque para enviar o PDF");
        painel(file, "PDF pronto. Toque no botão verde de novo (ou em “Compartilhar PDF”) para escolher o WhatsApp.");
      }
      // resolve true se a lista de compartilhamento realmente abriu; false se falhou (com o motivo em ultimoErro)
      var ultimoErro = null;
      function compartilhar(file, segunda) {
        var t0 = Date.now();
        var dados = { files: [file], title: file.name, text: textoMensagem() };
        var p;
        try { p = navigator.share(dados); } catch (e) { ultimoErro = e; return Promise.resolve(false); }
        return p.then(function () {
          painel(file, "Pronto — escolha o contato no WhatsApp para enviar.");
          return true;
        }, function (e) {
          ultimoErro = e;
          if (!segunda && e && (e.name === "NotAllowedError" || e.name === "SecurityError")) {   // passou muito tempo desde o toque
            aguardarToque(file);
            return true;
          }
          var rapido = Date.now() - t0 < 700;
          // fechar a lista demora mais que 0,7 s; falha instantânea = o celular recusou, não foi o usuário
          if (e && e.name === "AbortError" && !rapido) { painel(file, "Envio cancelado. Se quiser tentar de novo, use as opções abaixo."); return true; }
          return false;
        });
      }

      // baixa as bibliotecas de PDF em segundo plano, para o primeiro envio não esperar a internet
      (window.requestIdleCallback || function (f) { setTimeout(f, 3500); })(function () { ensureLibs().catch(function () {}); });

      function fim() { btn.disabled = false; if (!pronto) setRotulo("Enviar no WhatsApp"); }

      btn.addEventListener("click", function () {
        try {
          if (btn.disabled) return;
          if (pronto) {                                   // 2º toque: já temos o arquivo, compartilha na hora
            var f = pronto; pronto = null; setRotulo("Enviar no WhatsApp");
            compartilhar(f, true).then(function (ok) {
              if (!ok) painel(f, "O celular não abriu a lista de compartilhamento. Use as opções abaixo.", "Motivo: " + motivo(ultimoErro), true);
            });
            return;
          }
          btn.disabled = true; setRotulo("Gerando PDF…");
          msg("Preparando o PDF… isso leva alguns segundos.");
          try { if (navigator.vibrate) navigator.vibrate(30); } catch (e) {}
          var cli = cfg.cliente && cfg.cliente();
          var ref = cfg.ref && cfg.ref();
          var nome = nomeArquivo(cfg.doc, cli, ref);
          var limite = new Promise(function (_, rej) { setTimeout(function () { var e = new Error("demorou demais para montar o PDF"); e.diag = { etapa: "tempo" }; rej(e); }, 150000); });
          Promise.race([gerarPdf({ sheet: cfg.sheet, format: cfg.format, margin: cfg.margin, titulo: nome.replace(/\.pdf$/, "") }, function (t) { setRotulo(t); msg(t); }), limite])
            .then(function (r) {
              var file = new File([r.blob], nome, { type: "application/pdf" });
              if (window.GSJ && GSJ.logAction) GSJ.logAction("whatsapp", cfg.key || null, (ref || cli || null));
              var pode = podeCompartilhar(file);
              // celulares mais lentos demoram para montar o PDF e o toque "vence": pede um novo toque em vez de falhar
              if (pode && navigator.userActivation && !navigator.userActivation.isActive) { aguardarToque(file); return; }
              if (pode) {
                return compartilhar(file).then(function (ok) {
                  if (!ok) painel(file, "O celular não abriu a lista de compartilhamento. Use as opções abaixo.", "Motivo: " + motivo(ultimoErro), true);
                });
              }
              baixar(file);
              painel(file, "PDF gerado e baixado. Toque em “Abrir WhatsApp” e anexe o arquivo pelo clipe 📎 → Documento.", "Este navegador não permite enviar o arquivo direto.");
            })
            .catch(function (e) {
              var d = e && e.diag ? e.diag : {};
              msg("Não deu pra gerar o PDF: " + (e && e.message ? e.message : "erro inesperado") +
                ". Toque no botão para tentar de novo. [etapa: " + (d.etapa || "?") + (d.escala ? ", escala " + d.escala : "") + (d.tamanho ? ", " + d.tamanho : "") + (d.simples ? ", simples" : "") + (d.pilha ? ", " + d.pilha : "") + "] " + VERSAO, true);
            })
            .then(fim);
        } catch (e) {
          msg("Erro ao iniciar o envio: " + motivo(e) + " (" + VERSAO + "). Recarregue a página e tente de novo.", true);
          fim();
        }
      });
    }
  };
})();
