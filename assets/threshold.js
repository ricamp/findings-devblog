/* ============================================================
   threshold — widget de limiar vivo

   Uso, dentro de um post:

     <div class="thr-vivo" data-inicio="0.70"
          data-fonte="validation split · n = 3,533 · Damoiseau v1">
     <script type="application/json">
     { "n": 3533, "positivos": 378, "max": 0.6764,
       "ancoras": [[0, 3533, 378], [0.0382, 1696, 341], ...] }
     </script>
     </div>

   Os dados vivem no post, nao aqui: cada entrada mede a propria coisa,
   e um numero da 0003 embutido neste arquivo estaria errado na 0009.

   "ancoras" e' [corte, casos >= corte, verdadeiros positivos] — so
   pontos publicados. Entre eles o widget interpola em log; nas ancoras
   ele mostra exatamente o que foi medido.
   ============================================================ */
(function () {
  'use strict';

  var BINS = 72;      /* colunas do histograma */
  var ALT  = 7;       /* linhas do histograma */
  var TETO = 0.90;    /* fim da escala: passar do maximo faz parte do ponto */

  function escapar(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* Interpolacao em log entre ancoras. Linear erraria feio: a contagem
     cai de 3.533 para 14 no mesmo intervalo, e uma reta entre esses dois
     pontos passa longe de todos os pontos medidos no meio. */
  function log1p(x) { return Math.log(x + 1); }

  function entre(ancoras, corte) {
    var ult = ancoras[ancoras.length - 1];
    if (corte >= ult[0]) return { n: 0, tp: 0 };
    if (corte <= ancoras[0][0]) return { n: ancoras[0][1], tp: ancoras[0][2] };

    for (var i = 0; i < ancoras.length - 1; i++) {
      var a = ancoras[i], b = ancoras[i + 1];
      if (corte < a[0] || corte > b[0]) continue;
      var f = (corte - a[0]) / (b[0] - a[0]);
      var n  = Math.exp(log1p(a[1]) * (1 - f) + log1p(b[1]) * f) - 1;
      var tp = Math.exp(log1p(a[2]) * (1 - f) + log1p(b[2]) * f) - 1;
      return { n: Math.round(n), tp: Math.round(Math.min(tp, n)) };
    }
    return { n: 0, tp: 0 };
  }

  function ligar(caixa) {
    var fonteJson = caixa.querySelector('script[type="application/json"]');
    if (!fonteJson) return;

    var dados;
    try { dados = JSON.parse(fonteJson.textContent); } catch (e) { return; }
    if (!dados.ancoras || !dados.ancoras.length) return;

    var ancoras = dados.ancoras.slice().sort(function (a, b) { return a[0] - b[0]; });
    var inicio = parseFloat(caixa.getAttribute('data-inicio'));
    if (isNaN(inicio)) inicio = 0.5;

    /* ---- montagem ---- */
    caixa.textContent = '';

    var resumo = document.createElement('button');
    resumo.type = 'button';
    resumo.className = 'thr-resumo';
    resumo.setAttribute('aria-expanded', 'false');
    resumo.innerHTML = 'threshold <b>' + inicio.toFixed(3) + '</b> <span>· move it</span>';
    caixa.appendChild(resumo);

    var corpo = document.createElement('div');
    corpo.className = 'thr-corpo';
    corpo.hidden = true;
    corpo.innerHTML =
      '<p class="thr-titulo">cases remaining above the cut · log scale</p>' +
      '<pre class="thr-hist" aria-hidden="true"></pre>' +
      '<pre class="thr-eixo" aria-hidden="true"></pre>' +
      '<div class="thr-controle">' +
        '<label for="' + (caixa.id || (caixa.id = 'thr-' + Math.random().toString(36).slice(2, 8))) + '-r">' +
          'threshold <b class="thr-num"></b></label>' +
        '<input type="range" id="' + caixa.id + '-r" min="0" max="' + Math.round(TETO * 1000) + '" step="1">' +
      '</div>' +
      '<dl class="thr-saida">' +
        '<div><dt>cases ≥ thr</dt><dd class="thr-n"></dd></div>' +
        '<div><dt>PPV</dt><dd class="thr-ppv"></dd></div>' +
        '<div><dt>sensitivity</dt><dd class="thr-sens"></dd></div>' +
        '<div><dt>max score</dt><dd>' + dados.max.toFixed(4) + '</dd></div>' +
      '</dl>' +
      '<p class="thr-veredito" role="status"></p>' +
      '<p class="thr-fonte"></p>';
    caixa.appendChild(corpo);

    var elHist = corpo.querySelector('.thr-hist');
    var elEixo = corpo.querySelector('.thr-eixo');
    var elRange = corpo.querySelector('input');
    var elNum = corpo.querySelector('.thr-num');
    var elN = corpo.querySelector('.thr-n');
    var elPpv = corpo.querySelector('.thr-ppv');
    var elSens = corpo.querySelector('.thr-sens');
    var elVer = corpo.querySelector('.thr-veredito');

    corpo.querySelector('.thr-fonte').textContent =
      (caixa.getAttribute('data-fonte') || '') +
      ' · measured at the published cuts, log-interpolated between them';

    elRange.value = Math.round(inicio * 1000);

    /* A curva desenhada e' a de sobrevivencia — quantos casos sobram acima do
       corte — e nao um histograma de densidade.

       Duas razoes. A densidade varia tres ordens de grandeza entre o primeiro
       bin e a cauda, entao qualquer escala que mostre a cauda achata o resto
       numa laje. E a pergunta do widget e' literalmente "quantos sobram",
       entao a curva responde a mesma coisa que o painel de numeros. Quando
       ela encosta no chao antes da marca do threshold, o bug esta desenhado. */
    var curva = [], maxN = entre(ancoras, 0).n;
    for (var i = 0; i < BINS; i++) {
      curva.push(entre(ancoras, i / BINS * TETO).n);
    }

    function desenhar(corte) {
      var colThr = Math.min(BINS - 1, Math.round(corte / TETO * BINS));
      var colMax = Math.round(dados.max / TETO * BINS);
      var linhas = [];

      for (var y = 0; y < ALT; y++) {
        var alt = ALT - y, l = '', marcas = [];
        for (var x = 0; x < BINS; x++) {
          if (x === colThr) { l += '┊'; marcas.push(x); continue; }
          /* eixo em log: de 3.533 a 14 casos numa escala linear, tudo acima do
             corte 0.4 seria uma linha colada no chao */
          var h = curva[x] > 0
            ? Math.max(1, Math.round(log1p(curva[x]) / log1p(maxN) * ALT))
            : 0;
          /* so o topo e' desenhado: a curva e' um traco, nao uma area cheia —
             preencher embaixo devolveria a laje que a densidade produzia */
          l += (h === alt) ? '▄' : ' ';
        }
        linhas.push(tingir(l, marcas));
      }
      elHist.innerHTML = linhas.join('\n');

      var eixo = '';
      for (var x2 = 0; x2 < BINS; x2++) {
        if (x2 === colThr) eixo += '<span class="thr-marca">▲</span>';
        else if (x2 === colMax) eixo += '│';
        else if (x2 > colMax) eixo += '<span class="thr-vazio">·</span>';
        else eixo += '─';
      }
      var rotulo = '0.0' + new Array(Math.max(1, colMax - 8)).join(' ') + dados.max.toFixed(4);
      elEixo.innerHTML = eixo + '\n' + escapar(rotulo);
    }

    function tingir(linha, marcas) {
      var i = 0, saida = '';
      for (var k = 0; k < marcas.length; k++) {
        saida += escapar(linha.slice(i, marcas[k]))
              +  '<span class="thr-marca">' + escapar(linha.charAt(marcas[k])) + '</span>';
        i = marcas[k] + 1;
      }
      return saida + escapar(linha.slice(i));
    }

    function atualizar() {
      var corte = elRange.value / 1000;
      var r = entre(ancoras, corte);
      var ppv = r.n ? r.tp / r.n : null;

      elNum.textContent = corte.toFixed(3);
      resumo.querySelector('b').textContent = corte.toFixed(3);
      elN.textContent = r.n.toLocaleString('en-US');
      elPpv.textContent = ppv === null ? '—' : ppv.toFixed(3);
      elSens.textContent = (r.tp / dados.positivos).toFixed(3);

      if (r.n === 0) {
        elVer.className = 'thr-veredito thr-morta';
        elVer.innerHTML = '<b>Dead positive zone.</b> Not one of ' +
          dados.n.toLocaleString('en-US') + ' cases reaches ' + corte.toFixed(3) +
          ', so the branch that writes an affirmative sentence can never execute.';
      } else if (r.n < 50) {
        elVer.className = 'thr-veredito thr-fraca';
        elVer.innerHTML = 'Only ' + r.n + ' assertions. A PPV measured on this little sample ' +
          'describes the cut, not the model — the project requires at least 50.';
      } else if (ppv < 0.50) {
        elVer.className = 'thr-veredito thr-fraca';
        elVer.innerHTML = 'PPV below 0.50: the affirmative sentence would be wrong more often ' +
          'than not. Below the rule this project holds itself to.';
      } else {
        elVer.className = 'thr-veredito thr-ok';
        elVer.innerHTML = 'PPV ≥ 0.50 across ' + r.n.toLocaleString('en-US') +
          ' assertions. A cut the report generator can use.';
      }
      desenhar(corte);
    }

    elRange.addEventListener('input', atualizar);

    resumo.addEventListener('click', function () {
      var aberto = !corpo.hidden;
      corpo.hidden = aberto;
      resumo.setAttribute('aria-expanded', String(!aberto));
      resumo.classList.toggle('aberto', !aberto);
      /* medir so depois de visivel: o pre tem largura zero enquanto hidden,
         e o histograma sairia de um caractere */
      if (!aberto) atualizar();
    });

    atualizar();
  }

  var caixas = document.querySelectorAll('.thr-vivo');
  for (var i = 0; i < caixas.length; i++) ligar(caixas[i]);
})();
