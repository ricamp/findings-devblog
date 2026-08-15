/* ============================================================
   eggs — o que o site faz quando ninguem pediu

   Tres coisas independentes, na ordem em que a pessoa costuma achar:
     1. banner de console       (quem abre o DevTools)
     2. corrupcao da tag bugfix (quem passa o mouse)
     3. konami -> damoiseau     (quem procura)

   Autocontido: sem dependencia de ascii-fx.js. As duas funcoes de
   ruido estao repetidas aqui de proposito — sao dez linhas, e a copia
   custa menos que acoplar os dois arquivos por causa delas.

   Depende de: --mono, --papel, --tinta, --tinta-2, --linha, --achado
   ============================================================ */
(function () {
  'use strict';

  var SEM_MOVIMENTO = window.matchMedia('(prefers-reduced-motion: reduce)');

  function hash(x, y) {
    var n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  }

  function ruido(x, y) {
    var xi = Math.floor(x), yi = Math.floor(y);
    var xf = x - xi, yf = y - yi;
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    var a = hash(xi, yi), b = hash(xi + 1, yi);
    var c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }

  function escapar(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ============================================================
     1. Banner de console
     ============================================================ */
  (function () {
    var ARTE = [
      '',
      '   █▀▀ ▀█▀ █▄ █ █▀▄ ▀█▀ █▄ █ █▀▀ █▀▀',
      '   █▀▀  █  █ ▀█ █ █  █  █ ▀█ █ █ ▀▀█',
      '   ▀   ▀▀▀ ▀  ▀ ▀▀  ▀▀▀ ▀  ▀ ▀▀▀ ▀▀▀',
      ''
    ].join('\n');
    var MONO = 'font-family:monospace';

    console.log('%c' + ARTE, 'color:#A95335;' + MONO + ';font-size:11px;line-height:1.15');
    console.log('%cDamoiseau v1%c · chest X-ray finding classifier · built in public',
                'color:#A95335;font-weight:700;' + MONO, 'color:#6E6A5E;' + MONO);
    console.log('%cNot a medical device. Every output carries a human-review flag by design.',
                'color:#856823;' + MONO);
    console.log('%cYou found the console. There is one more thing in here.',
                'color:#6E6A5E;' + MONO + ';font-style:italic');
  })();

  /* ============================================================
     2. A tag bugfix corrompe a entrada

     De proposito fraco: duas letras trocadas por vez, a 7fps, sem
     piscar cor. O que carrega o efeito nao e' a quantidade, e' o
     caractere TRAVADO — um so, escolhido na entrada do mouse, que
     nao volta enquanto o cursor estiver ali. Le como defeito parado,
     nao como animacao.
     ============================================================ */
  (function () {
    var CARVAO = '\\|_-<>#*+:=';

    function ligar(tag, alvos) {
      var partes = [];   /* montadas na primeira passada do mouse, nao na carga */
      var raf = null, dentro = false, travado = null;

      function montar() {
        if (partes.length) return;
        for (var i = 0; i < alvos.length; i++) {
          var texto = alvos[i].textContent;
          var spans = [], elegiveis = [];
          alvos[i].textContent = '';
          for (var k = 0; k < texto.length; k++) {
            var sp = document.createElement('span');
            sp.textContent = texto.charAt(k);
            alvos[i].appendChild(sp);
            spans.push(sp);
            if (texto.charAt(k) !== ' ') elegiveis.push(k);
          }
          if (elegiveis.length) partes.push({ texto: texto, spans: spans, elegiveis: elegiveis });
        }
      }

      function limpar() {
        for (var p = 0; p < partes.length; p++) {
          var q = partes[p];
          for (var i = 0; i < q.spans.length; i++) {
            q.spans[i].textContent = q.texto.charAt(i);
            q.spans[i].style.color = '';
          }
        }
      }

      function quadro(agora) {
        /* dois passos de 140ms por troca: a 60fps o glifo vira borrao e o
           efeito some justamente por ser discreto demais */
        var bloco = Math.floor(agora / 140);

        for (var p = 0; p < partes.length; p++) {
          var q = partes[p];
          for (var i = 0; i < q.spans.length; i++) {
            var c = q.texto.charAt(i), s = q.spans[i];
            if (s.textContent !== c) { s.textContent = c; s.style.color = ''; }
          }
          if (!dentro) continue;

          /* uma letra por parte, e um terco dos blocos em silencio */
          if (hash(bloco, p * 13 + 3) > 0.34) {
            var j = q.elegiveis[Math.floor(hash(bloco, p * 7 + 1) * q.elegiveis.length)];
            q.spans[j].textContent = CARVAO.charAt((bloco + j * 29) % CARVAO.length);
          }
        }

        if (dentro && travado) {
          /* o travado nao muda de glifo tambem: um caractere errado e parado
             incomoda mais do que um caractere errado que se agita */
          travado.span.textContent = travado.glifo;
          travado.span.style.color = 'var(--achado)';
        }

        if (!dentro) { limpar(); raf = null; return; }
        raf = requestAnimationFrame(quadro);
      }

      tag.addEventListener('pointerenter', function () {
        if (SEM_MOVIMENTO.matches) return;
        montar();
        if (!partes.length) return;
        dentro = true;

        var q = partes[Math.floor(Math.random() * partes.length)];
        var j = q.elegiveis[Math.floor(Math.random() * q.elegiveis.length)];
        travado = { span: q.spans[j], glifo: CARVAO.charAt(Math.floor(Math.random() * CARVAO.length)) };

        if (!raf) raf = requestAnimationFrame(quadro);
      });

      tag.addEventListener('pointerleave', function () { dentro = false; travado = null; });
    }

    var tags = document.querySelectorAll('.etiqueta');
    for (var i = 0; i < tags.length; i++) {
      if (tags[i].textContent.trim().toLowerCase() !== 'bugfix') continue;
      /* a entrada no indice, ou o cabecalho quando a tag esta dentro do post */
      var caixa = tags[i].closest('.entrada') || tags[i].closest('.cabeca');
      if (!caixa) continue;
      var alvos = caixa.querySelectorAll('.entrada-titulo a, .entrada-resumo, h1');
      if (alvos.length) ligar(tags[i], alvos);
    }
  })();

  /* ============================================================
     3. Konami -> modo damoiseau

     Silhueta de torax gerada por campo (nao ha arte fixa em lugar
     nenhum), com o mapa de atencao pulsando sobre um achado no lobo
     superior direito, e a frase que o gerador escreveria.

     Convencao PA: a esquerda do paciente aparece a DIREITA de quem
     olha. O achado esta em x negativo por causa disso.
     ============================================================ */
  (function () {
    var SEQ = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown',
               'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];
    var pos = 0;

    var TAGLINE = 'Damoiseau v1 · finding detected · awaiting radiologist';
    var LAUDO = 'Focal opacity, <b>right upper lobe</b>. Calibrated probability <b>0.6764</b>. ' +
                '⚑ mandatory human review.';

    var caixa = null, tela = null, legenda = null, raf = null, prazo = null, t0 = 0, grade = null;
    var taglineOriginal = null;

    function medir(el) {
      var s = getComputedStyle(el);
      var sonda = document.createElement('span');
      sonda.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;' +
                            'font-family:' + s.fontFamily + ';font-size:' + s.fontSize;
      sonda.textContent = new Array(101).join('M');
      document.body.appendChild(sonda);
      var largura = sonda.getBoundingClientRect().width / 100;
      sonda.parentNode.removeChild(sonda);
      var caixaEl = el.getBoundingClientRect();
      return {
        cols: Math.max(1, Math.ceil(caixaEl.width / largura)),
        rows: Math.max(1, Math.ceil(caixaEl.height / parseFloat(s.lineHeight)))
      };
    }

    /* x, y em -1..1 · devolve densidade radiografica em 0..1 */
    function torax(x, y) {
      var meia = 0.60 + Math.max(0, y + 0.45) * 0.09;
      if (y < -0.62) meia = 0.60 - Math.pow((-0.62 - y) / 0.34, 1.5) * 0.40;   /* pescoco e ombros */
      var borda = 1 - Math.pow(Math.abs(x) / Math.max(0.02, meia), 3.0);
      if (borda <= 0 || y > 0.62 || y < -0.94) return 0;

      var v = 0.52 * Math.min(1, borda * 3.5);

      /* superelipse, nao gaussiana: o campo pulmonar tem borda, e uma gaussiana
         dissolve a pleura num degrade que nao le como pulmao */
      function pulmao(cx) {
        return Math.exp(-(Math.pow(Math.abs(x - cx) / 0.235, 4) + Math.pow(Math.abs(y + 0.02) / 0.44, 4)));
      }
      var ar = Math.min(1, pulmao(-0.30) + pulmao(0.30));
      v -= ar * 0.50;

      v += Math.exp(-Math.pow(x / 0.075, 2)) * 0.30;                                       /* coluna */
      v += Math.exp(-(Math.pow((x - 0.17) / 0.21, 2) + Math.pow((y - 0.24) / 0.25, 2))) * 0.32;  /* coracao */
      v += Math.max(0, 1 - Math.abs(y - 0.38 - Math.pow(Math.abs(x) * 0.85, 2)) / 0.22) * 0.32;  /* diafragma */
      v += Math.max(0, Math.sin(y * 6.6 + Math.pow(Math.abs(x) * 1.7, 2) * 2.6)) * 0.17 * ar;    /* arcos costais */
      v += Math.max(0, 1 - Math.abs(y + 0.52 + Math.abs(x) * 0.22) / 0.045) * 0.28 * Math.min(1, borda * 3);
      return Math.max(0, Math.min(1, v));
    }

    function desenhar(agora) {
      var dt = (agora - t0) / 1000;
      var RAMPA = ' .:-=+*#';
      var g = grade;
      var lesX = -0.31, lesY = -0.34, lesR = 0.105 + Math.sin(dt * 2.1) * 0.016;
      /* a imagem entra em ~1s: aparecer pronta parece troca de pagina, e
         aparecer devagar parece aquisicao */
      var revelar = Math.min(1, dt / 1.1);
      var h = '';

      for (var y = 0; y < g.rows; y++) {
        var linha = '', marcas = [], corrida = null;
        var ny = ((y + 0.5) / g.rows * 2 - 1) * 1.18;
        for (var x = 0; x < g.cols; x++) {
          var nx = (x / g.cols * 2 - 1) * (g.cols / g.rows / 2.55);
          var v = torax(nx, ny);
          if (v <= 0.001) { linha += ' '; corrida = null; continue; }
          v *= 0.88 + ruido(x * 0.4, y * 0.8) * 0.24;

          var dx = nx - lesX, dy = ny - lesY;
          var calor = Math.exp(-Math.pow(Math.sqrt(dx * dx + dy * dy) / lesR, 2)) * revelar;
          var quente = calor > 0.30;
          var i = quente ? Math.floor((0.45 + calor * 0.75) * RAMPA.length)
                         : Math.floor(v * RAMPA.length * revelar);
          linha += RAMPA[Math.max(0, Math.min(RAMPA.length - 1, i))];

          if (quente) {
            if (corrida) corrida[1] = x + 1;
            else { corrida = [x, x + 1]; marcas.push(corrida); }
          } else corrida = null;
        }

        var i2 = 0, saida = '';
        for (var m = 0; m < marcas.length; m++) {
          saida += escapar(linha.slice(i2, marcas[m][0]))
                +  '<span class="damo-quente">' + escapar(linha.slice(marcas[m][0], marcas[m][1])) + '</span>';
          i2 = marcas[m][1];
        }
        h += saida + escapar(linha.slice(i2)) + '\n';
      }

      tela.innerHTML = h;
      raf = requestAnimationFrame(desenhar);
    }

    function montar() {
      caixa = document.createElement('div');
      caixa.id = 'damo';
      caixa.setAttribute('aria-hidden', 'true');   /* decoracao: nada aqui e' conteudo */
      tela = document.createElement('pre');
      legenda = document.createElement('div');
      legenda.className = 'damo-legenda';
      caixa.appendChild(tela);
      caixa.appendChild(legenda);
      document.body.appendChild(caixa);
    }

    function ligar() {
      if (SEM_MOVIMENTO.matches) return;
      if (!caixa) montar();
      if (caixa.classList.contains('on')) return;

      caixa.classList.add('on');
      grade = medir(tela);
      t0 = performance.now();
      legenda.innerHTML = LAUDO;

      var tag = document.querySelector('.topo-tag');
      if (tag) {
        if (taglineOriginal === null) taglineOriginal = tag.textContent;
        tag.textContent = TAGLINE;
      }

      raf = requestAnimationFrame(desenhar);
      /* sai sozinho: quem achou por acaso nao sabe que o esc fecha */
      prazo = setTimeout(desligar, 9000);
    }

    function desligar() {
      if (!caixa || !caixa.classList.contains('on')) return;
      caixa.classList.remove('on');
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      clearTimeout(prazo);
      var tag = document.querySelector('.topo-tag');
      if (tag && taglineOriginal !== null) tag.textContent = taglineOriginal;
    }

    window.addEventListener('resize', function () {
      if (caixa && caixa.classList.contains('on')) grade = medir(tela);
    });

    document.addEventListener('keydown', function (e) {
      var alvo = e.target.tagName;
      if (alvo === 'INPUT' || alvo === 'TEXTAREA' || e.target.isContentEditable) return;
      if (e.key === 'Escape') { desligar(); return; }

      var k = e.key.toLowerCase();
      if (k === SEQ[pos]) {
        pos++;
        if (pos === SEQ.length) { pos = 0; ligar(); }
      } else {
        /* recomeca no proprio caractere: quem erra o quinto passo e digita a
           primeira seta de novo nao precisa comecar do zero */
        pos = (k === SEQ[0]) ? 1 : 0;
      }
    });
  })();

})();
