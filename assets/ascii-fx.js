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
          /* Curva agressiva: so os picos do ruido chegam nos glifos pesados,
             o resto fica quase vazio. Sem isso vira mancha solida.

             O piso subiu de 0.34 para 0.42. Medindo a grade real ao longo de um
             minuto, `*` e `#` ja quase nao apareciam (0,5% das celulas) — o que
             poluia nao era o topo da rampa, era a base: 60% das celulas acesas,
             quase tudo em '.' e ':'. Mexer no piso e' o que derruba isso.
             Agora fica em 28%, na mesma faixa do dither e da janela. */
          var i = Math.floor(Math.pow(Math.max(0, n - 0.48) / 0.52, 2.2) * RAMPA.length * 0.95);
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

    /* Metaballs, mas desenhadas como trilha de placa. O campo continua o mesmo;
       o que mudou e' o vocabulario de glifos. */
    contorno: function (g, t) {
      /* o campo trabalha em coordenadas corrigidas de aspecto: a celula mono e'
         alta, e sem correcao as bolhas viram faixas e o contorno le como hachura */
      var asp = g.cols / g.rows / 6.5;
      /* Seis bolhas, nao tres. Com tres a banda produzia quatro tracos soltos
         numa faixa de 159 colunas, e traco solto le como hifen. A rede so vira
         circuito quando os contornos se cruzam: cruzamento e' o que gera o
         canto, a derivacao e o no'. */
      var BOLHAS = [
        { x: 0.14, y: 0.50, r: 0.026, vx: 0.11, vy: 0.26 },
        { x: 0.31, y: 0.50, r: 0.034, vx: 0.17, vy: 0.14 },
        { x: 0.47, y: 0.50, r: 0.042, vx: 0.08, vy: 0.19 },
        { x: 0.62, y: 0.50, r: 0.030, vx: 0.13, vy: 0.29 },
        { x: 0.78, y: 0.50, r: 0.038, vx: 0.15, vy: 0.31 },
        { x: 0.92, y: 0.50, r: 0.024, vx: 0.09, vy: 0.23 }
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

      /* Duas passadas. A primeira marca quais celulas caem na banda do contorno;
         a segunda escolhe o glifo pela vizinhanca.

         Tem que ser em duas. Olhando uma celula por vez o maximo que da para
         saber e' a inclinacao local, e inclinacao so produz hachura — era
         exatamente isso que as barras `_ / | \` faziam aqui. Canto e derivacao
         nao existem numa celula sozinha: existem na relacao com o vizinho. */
      var banda = [], y, x;
      for (y = 0; y < g.rows; y++) {
        var l = [];
        for (x = 0; x < g.cols; x++) {
          l.push(Math.abs(campo(x / g.cols, (y + 0.5) / g.rows) - 1) <= 0.22);
        }
        banda.push(l);
      }

      function vizinho(vx, vy) {
        return vy >= 0 && vy < g.rows && vx >= 0 && vx < g.cols && banda[vy][vx];
      }

      /* Traco de placa. Indice = mascara N=1 S=2 L=4 O=8.
         As pontas soltas (1, 2, 4, 8) usam o traco inteiro em vez dos meios
         glifos ╵╷╶╴: os meios faltam em varias fontes mono, e um fallback aqui
         tem avanco diferente do mono — a linha inteira sairia do lugar e a
         grade de caracteres quebraria. */
      var TRACO = [
        '·', '│', '│', '│', '─', '└', '┌', '├',
        '─', '┘', '┐', '┤', '─', '┴', '┬', '┼'
      ];

      var linhas = [], tintas = [];
      for (y = 0; y < g.rows; y++) {
        var linha = '', marcas = [];
        for (x = 0; x < g.cols; x++) {
          if (!banda[y][x]) { linha += ' '; continue; }
          var m = (vizinho(x, y - 1) ? 1 : 0) | (vizinho(x, y + 1) ? 2 : 0)
                | (vizinho(x + 1, y) ? 4 : 0) | (vizinho(x - 1, y) ? 8 : 0);
          linha += TRACO[m];
          /* No' tingido onde tres ou mais tracos se encontram. E' o unico acento
             do efeito: colorir a trilha inteira apagaria a diferenca entre
             passar reto e ramificar, que e' o que da leitura de circuito. */
          if (m === 7 || m === 11 || m === 13 || m === 14 || m === 15) {
            marcas.push([x, x + 1, 'fx-quente']);
          }
        }
        linhas.push(linha); tintas.push(marcas);
      }
      return { l: linhas, t: tintas };
    },

    /* ----------------------------------------------------------
       Hexdump com cabeca de leitura. Todos os outros efeitos aqui
       sao textura — ruido, gradiente, mancha. Este e' o unico que
       usa a grade mono para o que ela existe: colunas alinhadas de
       dado. E' o que faz ele ler como terminal e nao como papel de
       parede animado.

       Cada linha tem endereco proprio e cabeca propria. A cabeca
       anda para a direita; atras dela o byte perde o valor e vira
       `··`, depois some. Ler byte novo e' o unico evento do efeito:
       sem a cabeca isto seria uma parede de hex parada, que e'
       exatamente o tipo de fundo que compete com o texto.
       ---------------------------------------------------------- */
    dump: function (g, t) {
      var HEX = '0123456789abcdef';
      var COL = 3;       /* 'ff ' — dois digitos e o respiro entre colunas */
      /* Sem calha de endereco. Ela existia por fidelidade a um hexdump de
         verdade, e era o erro: ancorada na margem esquerda, virava uma coluna
         de numeros parada. Fazer ela piscar amenizou e nao resolveu — o que
         incomoda e' ter qualquer coisa fixa num efeito cujo assunto e' o
         movimento. Agora so os bytes atravessam, da esquerda para a direita. */
      var bytes = Math.max(1, Math.floor(g.cols / COL));
      var CORPO = 9;     /* bytes com valor legivel */
      var CAUDA = 12;    /* casca `··` atras deles, que apaga sozinha */
      var linhas = [], tintas = [];

      for (var y = 0; y < g.rows; y++) {
        /* Fase propria por linha. Em unissono as sete cabecas viram uma barra
           vertical descendo — que e' o efeito glitch, ja ocupado. Desencontradas,
           leem como sete leituras independentes acontecendo ao mesmo tempo. */
        var ciclo = t * 0.30 + hash(y, 7) * 3.0;
        /* Periodo maior que 1: a sobra e' a pausa de linha apagada, e a pausa e'
           o que impede o dump de virar bloco solido de hex. Estava em 2.8 para
           dar tempo escuro a calha de endereco; sem ela, 2.8 deixava so duas
           das sete linhas vivas e a faixa quase vazia. */
        var passe = Math.floor(ciclo / 2.1);
        var cab = (ciclo % 2.1) * bytes;

        var linha = '', marcas = [];

        for (var b = 0; b < bytes; b++) {
          var d = cab - b;                       /* idade do byte, em colunas */
          if (d < 0 || d > CORPO + CAUDA) { linha += '   '; continue; }

          if (d > CORPO) { linha += '·· '; continue; } /* ja esfriou: so a casca */

          /* O valor acompanha o pacote, nao a coluna.
             Indexado pela coluna, o byte aparecia e ficava parado ate virar
             ponto: o desenho nunca transladava, e o efeito lia como revelacao
             — como se a linha estivesse sendo apagada no lugar. Indexado pela
             distancia ate a cabeca, o mesmo punhado de digitos atravessa a
             faixa, que e' o que a palavra "voando" descreve. */
          var v = Math.floor(hash(Math.floor(d) + passe * 31, y * 13 + 5) * 256);
          var col = b * COL;
          linha += HEX.charAt(v >> 4) + HEX.charAt(v & 15) + ' ';
          /* so o byte recem-lido vai tingido: um rastro colorido inteiro
             apagaria a diferenca entre a cabeca e o que ela ja passou */
          if (d < 1) marcas.push([col, col + 2, 'fx-quente']);
        }

        linhas.push(linha); tintas.push(marcas);
      }
      return { l: linhas, t: tintas };
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
          /* Expoente alto e ganho abaixo de 1: com 1.7/1.5 a grade enchia mais
             de metade das celulas e o dither virava textura solida atras do
             texto. Agora so o quinto mais claro do ruido acende. */
          var v = Math.pow(ruido(x * 0.055 + t * 0.11, y * 0.20 - t * 0.03), 3.2) * 0.9;
          var lim = (BAYER[y & 3][x & 3] + 0.5) / 16;
          linha += v > lim ? (v > lim + 0.50 ? '▪' : '·') : ' ';
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
      /* Piso de largura mais alto do que parece necessario: o hospede real e' o
         header, sete linhas de altura, e uma janela estreita ali nao deixa uma
         banda fina de tecido — deixa cacos espalhados. Mas larga ela tambem nao
         pode: a 0.34 a janela deixava dois tercos da faixa acesos e o tecido
         virava parede atras do texto. */
      var largura = 0.19 + Math.sin(t * 0.17 + 1.3) * 0.08;
      var baixo = nivel - largura / 2, alto = nivel + largura / 2;

      for (var y = 0; y < g.rows; y++) {
        var linha = '';
        for (var x = 0; x < g.cols; x++) {
          /* frequencia vertical alta de proposito: em sete linhas, um campo que
             varia devagar no eixo y da a mesma linha sete vezes, e o resultado
             le como listras em vez de tecido */
          var v = ruido(x * 0.075, y * 0.50) * 0.68 + ruido(x * 0.19, y * 1.05) * 0.22
                + Math.sin(y * 0.90 + x * 0.02) * 0.05 + 0.05;
          var w = (v - baixo) / (alto - baixo);
          /* os dois lados saem: o que esta abaixo da janela satura em preto e o
             que esta acima satura em branco. Cortar so um lado deixaria metade
             da tela sempre cheia, e a janela pararia de parecer uma janela. */
          if (w <= 0 || w >= 1) { linha += ' '; continue; }
          /* sem piso no indice: com Math.max(1, ...) a borda inteira da janela
             saia como '.', e a borda e' justamente a maior area do efeito —
             era ela que enchia a faixa de pontinhos */
          linha += RAMPA[Math.min(RAMPA.length - 1, Math.floor(w * RAMPA.length))];
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
      var linhas = [], tintas = [];

      /* Raio e centro em CELULAS, nao em fracao da caixa. O hospede real e' o
         header: 159 colunas por 7 linhas. Um raio de 0.085 da altura ali da
         meia linha, e o mapa inteiro vira um ponto perdido numa tira larga —
         que e' exatamente como ele estava. Preso ao numero de linhas, o blob
         ocupa a mesma fatia da faixa em qualquer altura de hospede. */
      var ry = Math.max(1.6, g.rows * 0.38) * (1 + Math.sin(t * 0.9) * 0.10);
      var rx = ry * 5.5;   /* a celula mono e' 2x mais alta que larga, e a faixa
                              e' muito mais larga que alta: elipse deitada le
                              melhor aqui do que circulo */
      var cx = (0.5 + Math.sin(t * 0.21) * 0.34) * g.cols;
      /* amplitude vertical menor que a horizontal: em sete linhas, 0.30 joga
         metade das passadas para fora do quadro */
      var cy = (0.5 + Math.sin(t * 0.34 + 2.0) * 0.18) * g.rows;

      for (var y = 0; y < g.rows; y++) {
        var linha = '', marcas = [], corrida = null;
        for (var x = 0; x < g.cols; x++) {
          var dx = (x - cx) / rx, dy = (y + 0.5 - cy) / ry;
          var d = Math.sqrt(dx * dx + dy * dy);          /* distancia eliptica */
          var n = Math.exp(-d * d)
                + Math.exp(-Math.pow((d - 1.65) / 0.26, 2)) * 0.30;
          /* granulacao: mapa de atencao de verdade nao sai liso, e liso demais
             le como gradiente decorativo */
          n *= 0.72 + ruido(x * 0.34, y * 0.7 + t * 0.5) * 0.5;
          /* Curva na cauda. A gaussiana so chega a zero no infinito, entao sem
             isto o mapa cobria a faixa inteira de '·' fraco e o blob perdia
             borda — a mancha e' o efeito, o halo de poeira e' sujeira. */
          var i = Math.max(0, Math.min(RAMPA.length - 1, Math.floor(Math.pow(n, 1.9) * RAMPA.length)));
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

  var POOL = ['densidade', 'glitch', 'contorno', 'dump', 'pulso', 'dither',
              'janela', 'heatmap', 'rastro'];

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

     Motor: (n, agora, t, elegiveis, texto) -> array com uma entrada por
     caractere:

       false    limpo, mostra o caractere original
       true     troca por um glifo do CARVAO e pisca uma cor
       "x"      mostra exatamente esse caractere, sem trocar a cor

     A terceira forma existe para o motor tv, que precisa escolher o
     proprio glifo (uma scanline nao e' um caractere aleatorio) e mover
     caractere de uma posicao para outra, o que o booleano nao expressa.
     ============================================================ */
  function iniciarScramble() {
    /* Sem '/': a barra e' a ancora que mantem o nome reconhecivel como caminho,
       entao ela nao pode aparecer tambem como ruido em outra posicao. */
    var CARVAO = '\\|_-<>#*+:=';
    /* --tinta pesa o dobro: e' o flash branco no tema escuro */
    var CORES = ['var(--tinta)', 'var(--achado)', 'var(--tinta-2)', 'var(--tinta)'];

    var MOTORES = {

      /* TV velha, na marca. Mesmo vocabulario do fundo glitch: scanline,
         tearing e dropout — so que numa linha de texto em vez de numa grade.

         O que faz isso ler como defeito de sinal e' o repouso. A maior parte
         dos quadros nao tem nada: o nome fica parado e legivel, e o estrago
         chega em rajada curta. Um efeito continuo aqui viraria ruido de fundo,
         e ninguem le ruido de fundo como avaria. */
      tv: function (n, agora, t, elegiveis, texto) {
        var out = new Array(n), i;
        for (i = 0; i < n; i++) out[i] = false;

        /* quadro travado a 12fps: a 60 o olho nao registra o evento, so um
           tremor cinza */
        var q = Math.floor(t * 12);
        var r = hash(q, 91);
        if (r > 0.30) return out;                 /* 70% dos quadros em silencio */

        /* o evento dura dois ou tres quadros: um so pisca e some antes de virar
           imagem, e o defeito precisa ser visto para ser defeito */
        var bloco = Math.floor(q / 2);
        var tipo = hash(bloco, 17);
        var ini, fim;

        if (tipo < 0.42) {
          /* TEARING: uma fatia desliza um ou dois caracteres para o lado, e o
             que entra pelo buraco vem do proprio nome — e' rasgo de imagem,
             nao substituicao por lixo */
          var desl = hash(bloco, 23) < 0.5 ? -1 : 1;
          if (hash(bloco, 29) < 0.35) desl *= 2;
          ini = Math.floor(hash(bloco, 31) * n);
          fim = Math.min(n, ini + 3 + Math.floor(hash(bloco, 37) * 6));
          for (i = ini; i < fim; i++) {
            var j = i - desl;
            out[i] = (j >= 0 && j < n) ? texto.charAt(j) : ' ';
          }

        } else if (tipo < 0.78) {
          /* SCANLINE: a fatia colapsa nos mesmos tracos do fundo glitch */
          var TRACOS = '─┄╌';
          ini = Math.floor(hash(bloco, 41) * n);
          fim = Math.min(n, ini + 2 + Math.floor(hash(bloco, 43) * 5));
          for (i = ini; i < fim; i++) {
            out[i] = TRACOS.charAt(Math.floor(hash(i, bloco) * TRACOS.length));
          }

        } else {
          /* DROPOUT: um ou dois caracteres somem. O buraco no meio da palavra
             incomoda mais que qualquer glifo trocado. */
          for (i = 0; i < elegiveis.length; i++) {
            if (hash(elegiveis[i], bloco * 7) < 0.10) out[elegiveis[i]] = ' ';
          }
          /* uma unica letra com flash de cor por rajada: o `true` devolve o
             comportamento antigo, que aqui vale como falha de croma */
          if (elegiveis.length && hash(bloco, 53) < 0.45) {
            out[elegiveis[Math.floor(hash(bloco, 59) * elegiveis.length)]] = true;
          }
        }
        return out;
      },

      /* Cada letra tem periodo e fase proprios: nao ha varredura, e nunca ha
         um instante com a palavra inteira parada. */
      decode: function (n, agora, t, elegiveis) {
        var out = new Array(n), i;
        /* Teto de letras soltas no mesmo quadro. Sem ele os ciclos ainda se
           alinhavam de vez em quando e sete das quinze letras trocavam juntas:
           a media baixa, mas e' o pico que o olho guarda como "intenso".
           O corte tira as que estao mais perto do fim do proprio ciclo — as
           que ja iam voltar — para nao cortar uma letra que acabou de soltar. */
        var TETO = 4;
        var soltas = [];
        for (i = 0; i < n; i++) {
          var periodo = 0.95 + hash(i, 5) * 1.10;
          var fase = hash(i, 9) * periodo;
          var p = (((t + fase) % periodo) + periodo) % periodo / periodo;
          /* Solto entre 8% e 21% do proprio ciclo. Estava em 14%–38%, o que
             deixava tres ou quatro letras trocadas ao mesmo tempo numa palavra
             de treze — perto demais de embaralhar o nome inteiro. Com o ciclo
             tambem mais longo, o que se ve e' uma letra piscando por vez. */
          var solto = 0.08 + Math.pow(hash(i, 3), 1.6) * 0.13;
          out[i] = p < solto;
          if (out[i]) soltas.push([i, p / solto]);
        }

        if (soltas.length > TETO) {
          soltas.sort(function (a, b) { return a[1] - b[1]; });
          for (i = TETO; i < soltas.length; i++) out[soltas[i][0]] = false;
        }

        /* Garantia dura: nunca um quadro com a palavra inteira parada.
           A conta olha so os elegiveis — a barra e' desenhada sempre limpa,
           entao contar com ela deixaria passar quadros visivelmente parados. */
        var algum = false;
        for (i = 0; i < elegiveis.length; i++) {
          if (out[elegiveis[i]]) { algum = true; break; }
        }
        if (!algum && elegiveis.length) {
          /* 0.16s por letra, nao 0.09: com o ciclo mais frouxo esta garantia
             passou a disparar bastante, e a 0.09 ela sozinha ja era rapida o
             bastante para ler como agitacao. */
          out[elegiveis[Math.floor(t / 0.16) % elegiveis.length]] = true;
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

    var POOL_SCRAMBLE = ['tv', 'decode', 'corrupcao'];

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
         textContent/color dos poucos que o motor marcou — sem remontar o DOM,
         e sem precisar escapar os glifos < e > do carvao. */
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
        var sujos = motor(alvo.length, agora, (agora - t0) / 1000, elegiveis, alvo);
        var vivo = false;

        for (var i = 0; i < alvo.length; i++) {
          var c = alvo.charAt(i), s = spans[i], v = sujos[i];

          if (!v || c === ' ' || c === '/') {
            if (s.textContent !== c) s.textContent = c;
            if (s.style.color) s.style.color = '';
            continue;
          }

          /* Glifo escolhido pelo motor: vai como veio e mantem a cor da tinta.
             Tingir aqui estragaria o efeito — scanline e rasgo sao falha de
             luminancia, e cor faz o olho ler como outra coisa. */
          if (typeof v === 'string') {
            if (s.textContent !== v) s.textContent = v;
            if (s.style.color) s.style.color = '';
            vivo = true;
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
