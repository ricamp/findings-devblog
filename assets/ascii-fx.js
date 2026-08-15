/* ============================================================
   ascii-fx — animacoes ASCII de fundo + scramble de titulo
   Par de ascii-fx.css. Autocontido: sem dependencias, sem build.

   Uso:
     <div class="fx-hospede">
       <pre class="fx-camada" data-fx="sorteio" aria-hidden="true"></pre>
       ...conteudo...
     </div>
     <a data-fx-scramble>findings/devblog</a>

   data-fx aceita o nome de um efeito ("densidade", "glitch", ...) ou
   "sorteio", que escolhe um do POOL na carga da pagina.
   ============================================================ */
(function () {
  'use strict';

  var SEM_MOVIMENTO = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ----------------------------------------------------------
     Grade: mede uma celula mono real e deriva colunas e linhas.
     Medir e' preciso porque o fallback de fonte muda a largura da
     celula, e um chute erra a grade inteira.
     ---------------------------------------------------------- */
  function medir(el) {
    var s = getComputedStyle(el);
    var sonda = document.createElement('span');
    sonda.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;' +
                          'font-family:' + s.fontFamily + ';font-size:' + s.fontSize;
    sonda.textContent = new Array(101).join('M');
    document.body.appendChild(sonda);
    var largura = sonda.getBoundingClientRect().width / 100;
    sonda.parentNode.removeChild(sonda);

    var alturaLinha = parseFloat(s.lineHeight);
    var caixa = el.getBoundingClientRect();
    return {
      cols: Math.max(1, Math.ceil(caixa.width / largura)),
      rows: Math.max(1, Math.ceil(caixa.height / alturaLinha))
    };
  }

  /* Ruido deterministico. Math.random esta fora do loop de propositio:
     com ele cada quadro seria independente e o resultado seria chuvisco
     branco, nao textura. */
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

  /* ============================================================
     Efeitos. Assinatura: (grade, t em segundos) -> string com \n
     ============================================================ */
  /* ============================================================
     Efeitos que precisam tingir um trecho devolvem
     { l: [linhas], t: [[ini, fim, classe], ...] } em vez de string.
     Quem devolve string continua indo por textContent, que e' mais
     barato — so quem precisa de cor paga o innerHTML.
     ============================================================ */
  function escapar(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  var EFEITOS = {

    /* Grade fixa: nada translada, so o peso do glifo muda. */
    densidade: function (g, t) {
      var RAMPA = ' .:-=+*#';
      var out = [];
      for (var y = 0; y < g.rows; y++) {
        var linha = '';
        for (var x = 0; x < g.cols; x++) {
          var n = ruido(x * 0.09 - t * 0.20, y * 0.30 + t * 0.04);
          n = n * 0.78 + ruido(x * 0.23 + t * 0.09, y * 0.55) * 0.22;
          /* curva agressiva: so os picos do ruido chegam nos glifos pesados,
             o resto fica quase vazio. Sem isso vira mancha solida. */
          var i = Math.floor(Math.pow(Math.max(0, n - 0.34) / 0.66, 1.9) * RAMPA.length * 1.15);
          linha += RAMPA[Math.max(0, Math.min(RAMPA.length - 1, i))];
        }
        out.push(linha);
      }
      return out.join('\n');
    },

    /* TV velha: scanline em ping-pong, barra de rolagem, chuvisco, tearing. */
    glitch: function (g, t) {
      var quadro = Math.floor(t * 12);   /* trava o ruido por quadro; sem isso cintila */
      var out = [], y, x;

      /* a scanline sobe e desce em vez de reiniciar do topo */
      var f = (t % 7) / 7;
      var tri = f < 0.5 ? f * 2 : 2 - f * 2;
      var e = tri < 0.5 ? 2 * tri * tri : 1 - Math.pow(-2 * tri + 2, 2) / 2;
      var pos = e * (g.rows + 1) - 0.5;

      /* barra de rolagem: mais lenta e no sentido contrario, como vertical hold solto */
      var barra = ((((t * -0.33) % 1) + 1) % 1) * (g.rows + 4) - 2;

      for (y = 0; y < g.rows; y++) {
        var linha = '';
        var dScan = Math.abs(pos - y);
        var dBarra = Math.abs(barra - y);

        for (x = 0; x < g.cols; x++) {
          if (dScan < 0.6) {
            var r = hash(x * 0.5, quadro);
            linha += r < 0.38 ? '─' : (r < 0.60 ? '┄' : (r < 0.70 ? '╌' : ' '));
          } else if (dScan < 2.4) {
            linha += hash(x, y * 3 + quadro) < 0.09 ? '·' : ' ';
          } else if (dBarra < 1.7) {
            var b = hash(x * 0.7, y + quadro * 0.01);
            linha += b < 0.17 ? (b < 0.07 ? '·' : '˙') : ' ';
          } else {
            linha += hash(x * 1.3, y * 7 + quadro) < 0.007 ? '·' : ' ';
          }
        }
        out.push(linha);
      }

      /* tearing raro e curto. Mais que isso e' o header inteiro tremendo. */
      if (hash(quadro, 41) < 0.055) {
        var alvo = Math.floor(hash(quadro, 5) * g.rows);
        var desl = Math.round((hash(quadro, 7) - 0.5) * 12);
        if (desl !== 0 && alvo < g.rows) {
          var l = out[alvo];
          while (l.length < g.cols) l += ' ';
          out[alvo] = desl > 0
            ? new Array(desl + 1).join(' ') + l.slice(0, g.cols - desl)
            : l.slice(-desl) + new Array(-desl + 1).join(' ');
        }
      }

      return out.join('\n');
    },

    /* Contornos de metaballs se deformando. */
    contorno: function (g, t) {
      /* o campo trabalha em coordenadas corrigidas de aspecto: a celula mono e'
         alta, e sem correcao as bolhas viram faixas e o contorno le como hachura */
      var asp = g.cols / g.rows / 6.5;
      var BOLHAS = [
        { x: 0.22, y: 0.5, r: 0.030, vx: 0.11, vy: 0.26 },
        { x: 0.55, y: 0.5, r: 0.042, vx: 0.08, vy: 0.19 },
        { x: 0.82, y: 0.5, r: 0.026, vx: 0.15, vy: 0.31 }
      ];

      function campo(px, py) {
        var s = 0;
        for (var i = 0; i < BOLHAS.length; i++) {
          var b = BOLHAS[i];
          var cx = b.x + Math.sin(t * b.vx + i) * 0.10;
          var cy = b.y + Math.sin(t * b.vy + i * 2) * 0.20;
          var dx = (px - cx) * asp, dy = py - cy;
          s += b.r / (dx * dx + dy * dy + 1e-4);
        }
        return s;
      }

      var out = [];
      for (var y = 0; y < g.rows; y++) {
        var linha = '';
        for (var x = 0; x < g.cols; x++) {
          var px = x / g.cols, py = (y + 0.5) / g.rows;
          var f = campo(px, py);
          if (Math.abs(f - 1) > 0.20) { linha += ' '; continue; }
          var gx = (campo(px + 1 / g.cols, py) - campo(px - 1 / g.cols, py)) * asp;
          var gy = campo(px, py + 1 / g.rows) - campo(px, py - 1 / g.rows);
          /* glifo perpendicular ao gradiente: a tangente do contorno */
          var ang = Math.atan2(-gx, gy);
          var k = ((Math.round(ang / (Math.PI / 4)) % 4) + 4) % 4;
          linha += ['_', '/', '|', '\\'][k];
        }
        out.push(linha);
      }
      return out.join('\n');
    },

    /* Anel de densidade respirando. Anel e nao disco: o centro fica limpo,
       que e' onde mora o texto. */
    pulso: function (g, t) {
      var RAMPA = ' ·:-=+';
      var asp = g.cols / g.rows / 6.5;
      var raio = 0.16 + (0.5 + Math.sin(t * 0.55) * 0.5) * 0.22;
      var out = [];
      for (var y = 0; y < g.rows; y++) {
        var linha = '';
        for (var x = 0; x < g.cols; x++) {
          var dx = (x / g.cols - 0.42) * asp, dy = (y + 0.5) / g.rows - 0.5;
          var dist = Math.sqrt(dx * dx + dy * dy);
          var v = Math.exp(-Math.pow((dist - raio) / 0.13, 2));
          v *= 0.55 + ruido(x * 0.3, y * 0.5 + t * 0.4) * 0.9;
          var i = Math.floor(v * RAMPA.length);
          linha += RAMPA[Math.max(0, Math.min(RAMPA.length - 1, i))];
        }
        out.push(linha);
      }
      return out.join('\n');
    },

    /* Dither ordenado Bayer 4x4 sobre um gradiente lento. */
    dither: function (g, t) {
      var BAYER = [
        [0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]
      ];
      var out = [];
      for (var y = 0; y < g.rows; y++) {
        var linha = '';
        for (var x = 0; x < g.cols; x++) {
          var v = Math.pow(ruido(x * 0.055 + t * 0.11, y * 0.20 - t * 0.03), 1.7) * 1.5;
          var lim = (BAYER[y & 3][x & 3] + 0.5) / 16;
          linha += v > lim ? (v > lim + 0.45 ? '▪' : '·') : ' ';
        }
        out.push(linha);
      }
      return out.join('\n');
    },

    /* ----------------------------------------------------------
       Janela de intensidade deslizando sobre um campo de tecido.
       O campo e' FIXO — so a janela se move. E' isso que faz o
       efeito ler como um controle sendo girado e nao como ruido:
       as mesmas estruturas reaparecem quando a janela volta.
       ---------------------------------------------------------- */
    janela: function (g, t) {
      var RAMPA = ' .:-=+*#';
      var out = [];
      var nivel  = 0.50 + Math.sin(t * 0.23) * 0.26;
      var largura = 0.30 + Math.sin(t * 0.17 + 1.3) * 0.17;   /* nunca chega a zero */
      var baixo = nivel - largura / 2, alto = nivel + largura / 2;

      for (var y = 0; y < g.rows; y++) {
        var linha = '';
        for (var x = 0; x < g.cols; x++) {
          var v = ruido(x * 0.075, y * 0.26) * 0.68 + ruido(x * 0.19, y * 0.62) * 0.22
                + Math.sin(y * 0.55 + x * 0.02) * 0.05 + 0.05;
          var w = (v - baixo) / (alto - baixo);
          /* os dois lados saem: o que esta abaixo da janela satura em preto e o
             que esta acima satura em branco. Cortar so um lado deixaria metade
             da tela sempre cheia, e a janela pararia de parecer uma janela. */
          if (w <= 0 || w >= 1) { linha += ' '; continue; }
          linha += RAMPA[Math.max(1, Math.min(RAMPA.length - 1, Math.floor(w * RAMPA.length)))];
        }
        out.push(linha);
      }
      return out.join('\n');
    },

    /* ----------------------------------------------------------
       Mapa de atencao passeando atras do texto. O nucleo vai tingido
       de --achado; o anel em volta existe para o blob ter borda — sem
       ele a mancha se dissolve no fundo e vira densidade comum.
       ---------------------------------------------------------- */
    heatmap: function (g, t) {
      var RAMPA = ' ·:-=+*#';
      var asp = g.cols / g.rows / 6.5;
      var linhas = [], tintas = [];
      var cx = 0.5 + Math.sin(t * 0.21) * 0.34;
      var cy = 0.5 + Math.sin(t * 0.34 + 2.0) * 0.30;
      var raio = 0.085 + Math.sin(t * 0.9) * 0.016;

      for (var y = 0; y < g.rows; y++) {
        var linha = '', marcas = [], corrida = null;
        for (var x = 0; x < g.cols; x++) {
          var dx = (x / g.cols - cx) * asp, dy = (y + 0.5) / g.rows - cy;
          var d = Math.sqrt(dx * dx + dy * dy);
          var n = Math.exp(-Math.pow(d / raio, 2))
                + Math.exp(-Math.pow((d - raio * 1.65) / (raio * 0.30), 2)) * 0.42;
          /* granulacao: mapa de atencao de verdade nao sai liso, e liso demais
             le como gradiente decorativo */
          n *= 0.72 + ruido(x * 0.34, y * 0.7 + t * 0.5) * 0.5;
          var i = Math.max(0, Math.min(RAMPA.length - 1, Math.floor(n * RAMPA.length)));
          linha += RAMPA[i];

          if (i >= 5) {
            if (corrida) corrida[1] = x + 1;
            else { corrida = [x, x + 1, 'fx-quente']; marcas.push(corrida); }
          } else corrida = null;
        }
        linhas.push(linha); tintas.push(marcas);
      }
      return { l: linhas, t: tintas };
    },

    /* ----------------------------------------------------------
       Rastro do cursor. O buffer decai sozinho, entao o desenho fica
       na tela um instante depois da mao passar.

       A textura de base existe porque sem ela a faixa fica morta para
       quem nao tem ponteiro — toque, teclado, leitor de tela. Com ela
       o efeito degrada para um fundo comum em vez de sumir.
       ---------------------------------------------------------- */
    rastro: function (g, t, alvo) {
      var RAMPA = ' ·:-=+*#';
      var e = alvo.estado;

      if (!e || e.cols !== g.cols || e.rows !== g.rows) {
        e = alvo.estado = { buf: new Float32Array(g.cols * g.rows), cols: g.cols, rows: g.rows,
                            mx: -99, my: -99, dentro: false };
        ligarPonteiro(alvo, e);
      }

      /* a celula mono e' cerca de duas vezes mais alta que larga; sem corrigir,
         o rastro sai achatado e parece um risco horizontal */
      var ASP = 2.0;
      var out = [];
      for (var y = 0; y < g.rows; y++) {
        var linha = '';
        for (var x = 0; x < g.cols; x++) {
          var k = y * g.cols + x;
          e.buf[k] *= 0.90;
          if (e.dentro) {
            var dx = (x - e.mx) / ASP, dy = y - e.my, d2 = dx * dx + dy * dy;
            if (d2 < 26) e.buf[k] = Math.min(1.15, e.buf[k] + Math.exp(-d2 / 7) * 0.55);
          }
          var base = Math.pow(Math.max(0, ruido(x * 0.09 - t * 0.14, y * 0.28) - 0.42) / 0.58, 1.7) * 0.55;
          var v = Math.min(1, base + e.buf[k]);
          var i = Math.floor(v * RAMPA.length);
          linha += RAMPA[Math.max(0, Math.min(RAMPA.length - 1, i))];
        }
        out.push(linha);
      }
      return out.join('\n');
    }
  };

  /* O ponteiro e' escutado no hospede, nao na camada: a camada tem
     pointer-events:none para nao roubar clique de link nenhum. */
  function ligarPonteiro(alvo, e) {
    var hospede = alvo.el.parentNode;
    if (!hospede) return;
    hospede.addEventListener('pointermove', function (ev) {
      var r = alvo.el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      e.mx = (ev.clientX - r.left) / r.width * e.cols;
      e.my = (ev.clientY - r.top) / r.height * e.rows;
      e.dentro = true;
    });
    hospede.addEventListener('pointerleave', function () { e.dentro = false; });
  }

  var POOL = ['densidade', 'glitch', 'contorno', 'pulso', 'dither', 'janela', 'heatmap', 'rastro'];

  /* ============================================================
     Loop unico para todas as camadas, a ~12fps. ASCII nao ganha
     nada com 60 — e a 60 o custo de reescrever o texto aparece.
     ============================================================ */
  /* String vai por textContent; { l, t } por innerHTML com os trechos
     tingidos. Escapar e' obrigatorio aqui: o efeito contorno emite '\' e '/',
     e um efeito futuro pode emitir '<'. */
  function pintar(el, r) {
    if (typeof r === 'string') { el.textContent = r; return; }
    var h = '';
    for (var y = 0; y < r.l.length; y++) {
      var linha = r.l[y], marcas = r.t[y], i = 0, saida = '';
      for (var k = 0; marcas && k < marcas.length; k++) {
        saida += escapar(linha.slice(i, marcas[k][0]))
              +  '<span class="' + marcas[k][2] + '">'
              +  escapar(linha.slice(marcas[k][0], marcas[k][1])) + '</span>';
        i = marcas[k][1];
      }
      h += saida + escapar(linha.slice(i)) + (y < r.l.length - 1 ? '\n' : '');
    }
    el.innerHTML = h;
  }

  function iniciarCamadas() {
    var nos = document.querySelectorAll('.fx-camada');
    if (!nos.length) return;

    var alvos = [];
    for (var i = 0; i < nos.length; i++) {
      var el = nos[i];
      var nome = el.getAttribute('data-fx') || 'sorteio';
      if (nome === 'sorteio') nome = POOL[Math.floor(Math.random() * POOL.length)];
      var fn = EFEITOS[nome];
      if (!fn) continue;
      el.setAttribute('data-fx-ativo', nome);
      alvos.push({ el: el, fn: fn, g: medir(el), estado: null });
    }
    if (!alvos.length) return;

    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function () {
        for (var j = 0; j < alvos.length; j++) alvos[j].g = medir(alvos[j].el);
      });
      for (var k = 0; k < alvos.length; k++) ro.observe(alvos[k].el);
    }

    /* Sem movimento: congela num instante arbitrario e nao agenda nada. */
    if (SEM_MOVIMENTO.matches) {
      for (var m = 0; m < alvos.length; m++) {
        pintar(alvos[m].el, alvos[m].fn(alvos[m].g, 3, alvos[m]));
      }
      return;
    }

    var t0 = performance.now(), ultimo = 0;
    (function quadro(agora) {
      requestAnimationFrame(quadro);
      if (agora - ultimo < 83) return;
      ultimo = agora;
      var t = (agora - t0) / 1000;
      for (var n = 0; n < alvos.length; n++) {
        pintar(alvos[n].el, alvos[n].fn(alvos[n].g, t, alvos[n]));
      }
    })(t0);
  }

  /* ============================================================
     Scramble: roda em loop enquanto o cursor (ou o foco) estiver no
     elemento. Tres motores, sorteados na carga como os fundos.

     Motor: (n, agora, t, elegiveis) -> array de booleanos, um por
     caractere, dizendo quem esta embaralhado nesse instante.
     ============================================================ */
  function iniciarScramble() {
    /* Sem '/': a barra e' a ancora que mantem o nome reconhecivel como caminho,
       entao ela nao pode aparecer tambem como ruido em outra posicao. */
    var CARVAO = '\\|_-<>#*+:=';
    /* --tinta pesa o dobro: e' o flash branco no tema escuro */
    var CORES = ['var(--tinta)', 'var(--achado)', 'var(--tinta-2)', 'var(--tinta)'];

    var MOTORES = {

      /* Banda estreita atravessando da esquerda pra direita. Cada passada
         sorteia a propria velocidade, entao o ritmo nunca fica metronomico. */
      onda: function (n, agora, t, elegiveis) {
        var L = 2.6, SLOT = 1.15;
        var k = Math.floor(t / SLOT);
        var p = (t % SLOT) / SLOT;
        var out = new Array(n), i;

        /* 0.70x a 1.55x da velocidade base. Passada lenta enche o slot,
           passada rapida deixa um respiro no fim — e' de onde vem o ritmo. */
        var vel = 0.70 + hash(k, 11) * 0.85;
        var cruza = Math.min(0.90, 1 / vel);
        if (p > cruza) { for (i = 0; i < n; i++) out[i] = false; return out; }

        /* ease in-out dentro da passada: entra e sai devagar nas pontas */
        var q = p / cruza;
        var e = q < 0.5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2;
        var frente = e * (n + L * 2) - L;

        for (i = 0; i < n; i++) {
          var d = Math.abs(i - frente);
          /* nas bordas o caractere as vezes sobrevive intacto, entao a
             passagem tem contorno suave em vez de bloco duro */
          out[i] = d <= L && hash(i, Math.floor(agora / 60)) >= d / L;
        }
        return out;
      },

      /* Cada letra tem periodo e fase proprios: nao ha varredura, e nunca ha
         um instante com a palavra inteira parada. */
      decode: function (n, agora, t, elegiveis) {
        var out = new Array(n), i;
        for (i = 0; i < n; i++) {
          var periodo = 0.75 + hash(i, 5) * 0.90;
          var fase = hash(i, 9) * periodo;
          var p = (((t + fase) % periodo) + periodo) % periodo / periodo;
          /* solto entre 14% e 38% do proprio ciclo: poucas letras por vez */
          var solto = 0.14 + Math.pow(hash(i, 3), 1.6) * 0.24;
          out[i] = p < solto;
        }

        /* Garantia dura: nunca um quadro com a palavra inteira parada.
           A conta olha so os elegiveis — a barra e' desenhada sempre limpa,
           entao contar com ela deixaria passar quadros visivelmente parados. */
        var algum = false;
        for (i = 0; i < elegiveis.length; i++) {
          if (out[elegiveis[i]]) { algum = true; break; }
        }
        if (!algum && elegiveis.length) {
          out[elegiveis[Math.floor(t / 0.09) % elegiveis.length]] = true;
        }
        return out;
      },

      /* Uma letra por vez pisca trocada, saltando de posicao. O nome fica
         inteiro e legivel o tempo todo. */
      corrupcao: function (n, agora, t, elegiveis) {
        var out = new Array(n), i;
        for (i = 0; i < n; i++) out[i] = false;
        if (!elegiveis.length) return out;

        /* dois passos de 110ms por letra: um passo so e' curto demais pro
           olho registrar e o efeito vira cintilacao */
        var bloco = Math.floor(t / 0.22);
        if (hash(bloco, 17) < 0.34) return out;   /* um terco dos blocos descansa */
        out[elegiveis[Math.floor(hash(bloco, 23) * elegiveis.length)]] = true;
        return out;
      }
    };

    var POOL_SCRAMBLE = ['onda', 'decode', 'corrupcao'];

    function ligar(el) {
      var alvo = el.textContent;
      var raf = null, dentro = false, t0 = 0;

      var nome = el.getAttribute('data-fx-scramble') || 'sorteio';
      if (nome === 'sorteio') {
        nome = POOL_SCRAMBLE[Math.floor(Math.random() * POOL_SCRAMBLE.length)];
      }
      var motor = MOTORES[nome];
      if (!motor) return;
      el.setAttribute('data-fx-scramble-ativo', nome);

      /* Um span por caractere, criados uma vez. Cada quadro mexe so no
         textContent/color dos tres ou quatro dentro da onda — sem remontar o
         DOM, e sem precisar escapar os glifos < e > do carvao. */
      var spans = [];
      el.textContent = '';
      for (var k = 0; k < alvo.length; k++) {
        var sp = document.createElement('span');
        sp.textContent = alvo.charAt(k);
        el.appendChild(sp);
        spans.push(sp);
      }

      /* Espaco e barra nunca embaralham: a barra e' o que ancora o nome como
         caminho e mantem a palavra reconhecivel ate no pior quadro. */
      var elegiveis = [];
      for (var e = 0; e < alvo.length; e++) {
        var ch = alvo.charAt(e);
        if (ch !== ' ' && ch !== '/') elegiveis.push(e);
      }

      function pinta(agora) {
        var sujos = motor(alvo.length, agora, (agora - t0) / 1000, elegiveis);
        var vivo = false;

        for (var i = 0; i < alvo.length; i++) {
          var c = alvo.charAt(i), s = spans[i];

          if (!sujos[i] || c === ' ' || c === '/') {
            if (s.textContent !== c) s.textContent = c;
            if (s.style.color) s.style.color = '';
            continue;
          }
          /* O glifo troca a cada ~70ms, nao a cada quadro: a 60fps o caractere
             vira borrao cinza e o efeito some. O i*29 tira cada letra do mesmo
             compasso, senao a palavra inteira pisca junto.
             A cor segura ~130ms — trocar as duas no mesmo ritmo dobra a
             agitacao sem adicionar informacao. */
          s.textContent = CARVAO.charAt((Math.floor(agora / 70) + i * 29) % CARVAO.length);
          s.style.color = CORES[Math.floor(hash(i * 1.7, Math.floor(agora / 130)) * CORES.length)];
          vivo = true;
        }
        return vivo;
      }

      function resolver() {
        for (var i = 0; i < alvo.length; i++) {
          spans[i].textContent = alvo.charAt(i);
          spans[i].style.color = '';
        }
      }

      var saiuEm = 0;

      function quadro(agora) {
        var vivo = pinta(agora);
        /* Ao sair, espera um quadro naturalmente limpo antes de parar — cortar
           no meio deixaria um glifo trocado congelado na tela. O prazo existe
           porque o motor decode nunca fica todo limpo por construcao: sem ele
           o loop rodaria para sempre depois que o mouse saiu. */
        if (!dentro && (!vivo || agora - saiuEm > 600)) { resolver(); raf = null; return; }
        raf = requestAnimationFrame(quadro);
      }

      function entra() {
        dentro = true;
        if (SEM_MOVIMENTO.matches || raf) return;
        t0 = performance.now();
        raf = requestAnimationFrame(quadro);
      }

      function sai() {
        dentro = false;
        saiuEm = performance.now();
      }

      el.addEventListener('mouseenter', entra);
      el.addEventListener('focus', entra);
      el.addEventListener('mouseleave', sai);
      el.addEventListener('blur', sai);
    }

    var nos = document.querySelectorAll('[data-fx-scramble]');
    for (var i = 0; i < nos.length; i++) ligar(nos[i]);
  }

  iniciarCamadas();
  iniciarScramble();
})();
