// Versao C · Editorial — interacoes de rolagem e profundidade, na camada do site.
//
// Nada aqui edita o motor (assets/marca/ e' copia do kit). O que se usa dele e' a API:
//   - montar() de motor/pintor-pre.mjs, a instancia em pre.marcaMotor e o evento
//     'marca:montado' (o include remonta ao trocar tema ou largura);
//   - definir(params) e o atributo observado data-marca-progresso;
//   - no efeito `capa`, params.progresso (0 a 1) e params.camadas ('moldura', 'fundo', 'nome').
//
// O que faz:
//   1. Capa que se monta no tempo (1,25 s, ease-out), uma vez: a que tem a maior parte na
//      tela ao abrir, logo; as outras, quando 25% dela entra na janela. A posicao da
//      rolagem nao manda no progresso. Completa, fica viva e nao desmonta mais.
//   2. Profundidade: a capa em tres <pre> (moldura, fundo, nome), um por camada do motor;
//      o nome vem para a frente com o ponteiro, o fundo vai para tras, a moldura fica, e na
//      rolagem cada camada anda numa velocidade. Na margem das entradas, o efeito anda com
//      o ponteiro e, se nao tiver planos proprios (heatmap profundo), ganha um de pontos atras.
//   3. Titulos grandes entram por mascara, linha a linha, ao chegar pela rolagem.
//   4. Numeros das entradas (0007) assentam digito a digito ao entrar.
//   5. Filetes se tracam (em passos, como caracteres) ao entrar.
//   6. Na entrada: barra de leitura feita de caracteres, presa no alto.
//
// Movimento reduzido: nada disso roda (a capa do motor inteira e parada, num <pre> so),
// menos a barra de leitura, que nao anima. Sem JS: nada e' escondido (todo estado
// escondido depende de classe posta aqui). So o que esta na tela e' atualizado; rolagem e
// ponteiro so marcam "sujo" e o trabalho vai para um requestAnimationFrame.

const raiz = document.documentElement;
const reduzido = matchMedia('(prefers-reduced-motion: reduce)').matches;
const estreito = matchMedia('(max-width: 640px)');

const limitar = (v, a, b) => (v < a ? a : v > b ? b : v);

// ------------------------------------------------------------------ laco unico
const tarefas = new Set();
let rafLaco = 0;
function pedirQuadro() {
  if (!rafLaco) rafLaco = requestAnimationFrame(laco);
}
function laco(agora) {
  rafLaco = 0;
  let mais = false;
  for (const t of tarefas) if (t(agora)) mais = true;
  if (mais) pedirQuadro();
}
const ponteiro = { x: null, y: null };
addEventListener('scroll', pedirQuadro, { passive: true });
addEventListener('resize', pedirQuadro, { passive: true });
if (!reduzido) {
  addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    ponteiro.x = e.clientX; ponteiro.y = e.clientY;
    pedirQuadro();
  }, { passive: true });
  document.addEventListener('pointerleave', () => { ponteiro.x = ponteiro.y = null; pedirQuadro(); });
}

// direcao do ponteiro (ou do centro da janela) em relacao a um retangulo, de -1 a 1
function direcao(r) {
  const px = ponteiro.x ?? innerWidth / 2;
  const py = ponteiro.y ?? innerHeight / 2;
  return {
    x: limitar((px - (r.left + r.width / 2)) / (innerWidth / 2), -1, 1),
    y: limitar((py - (r.top + r.height / 2)) / (innerHeight / 2), -1, 1),
  };
}

// ------------------------------------------------------------------ revelar ao entrar
// armar: estado escondido, posto so quando o elemento esta logo abaixo da janela (nunca
// no que ja esta visivel: nada pisca); tocar: quando entra de fato.
function revelar(els, { armar, tocar, soltar }) {
  if (!els.length) return;
  const armados = new Set();
  const perto = new IntersectionObserver((es) => {
    for (const e of es) {
      const el = e.target;
      const r = e.boundingClientRect;
      if (e.isIntersecting && !armados.has(el) && r.top > innerHeight * 0.96) {
        if (armar(el) !== false) armados.add(el);
      } else if (!e.isIntersecting && armados.has(el) && r.bottom < 0) {
        // pulou por cima sem entrar (ancora, tecla End): mostra pronto
        armados.delete(el); soltar(el); perto.unobserve(el); dentro.unobserve(el);
      }
    }
  }, { rootMargin: '0px 0px 20% 0px' });
  const dentro = new IntersectionObserver((es) => {
    for (const e of es) {
      if (!e.isIntersecting) continue;
      const el = e.target;
      perto.unobserve(el); dentro.unobserve(el);
      if (armados.has(el)) { armados.delete(el); tocar(el); }
    }
  }, { rootMargin: '0px 0px -7% 0px' });
  for (const el of els) {
    // o que ja esta na tela ao abrir fica como esta
    if (el.getBoundingClientRect().top < innerHeight) continue;
    perto.observe(el); dentro.observe(el);
  }
}

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ------------------------------------------------------------------ 3. titulos
function titulos() {
  const els = [...document.querySelectorAll(
    '.manchete .lede, .destaque .entrada-titulo, .sumario .entrada-titulo, .linhagem-nome, .navega-antes a, .navega-depois a',
  )];
  const originais = new WeakMap();
  revelar(els, {
    armar(el) {
      const alvo = el.matches('h2') && el.children.length === 1 && el.firstElementChild.matches('a') ? el.firstElementChild : el;
      if (alvo.children.length) return false; // so texto puro
      const texto = alvo.textContent.trim();
      if (!texto) return false;
      originais.set(el, { alvo, html: alvo.innerHTML });
      // mede as linhas como o navegador quebrou (balance incluido) e prende cada uma num bloco
      alvo.innerHTML = texto.split(/\s+/).map((p) => `<span class="ed-p">${esc(p)}</span>`).join(' ');
      const linhas = [];
      let topo = null;
      for (const s of alvo.querySelectorAll('.ed-p')) {
        const t = s.offsetTop;
        if (topo === null || Math.abs(t - topo) > 3) { linhas.push([]); topo = t; }
        linhas[linhas.length - 1].push(s.textContent);
      }
      alvo.innerHTML = linhas.map((l, i) => `<span class="ed-linha" style="--i:${i}">${esc(l.join(' '))}</span>`).join(' ');
      el.classList.add('ed-titulo-armado');
    },
    tocar(el) {
      el.classList.add('ed-titulo-tocando');
      const o = originais.get(el);
      const ultima = el.querySelector('.ed-linha:last-of-type');
      const fim = () => devolver(el, o);
      if (ultima) ultima.addEventListener('animationend', fim, { once: true });
      setTimeout(fim, 2000); // garantia
    },
    soltar(el) { devolver(el, originais.get(el)); },
  });
  function devolver(el, o) {
    el.classList.remove('ed-titulo-armado', 'ed-titulo-tocando');
    // os eggs (bugfix) trocam o texto do titulo por spans proprios; so devolve o nosso
    if (o && o.alvo.querySelector('.ed-linha')) o.alvo.innerHTML = o.html;
  }
}

// ------------------------------------------------------------------ 4. numeros
function numeros() {
  const els = [...document.querySelectorAll('.cartao-numero, .cabeca-numero')];
  revelar(els, {
    armar(el) { return /^\d+$/.test(el.textContent.trim()); },
    tocar(el) {
      const final = el.textContent.trim();
      const n = final.length;
      const t0 = performance.now();
      const DUR = 520;
      let ultimo = '';
      tarefas.add(function digitos(agora) {
        const k = (agora - t0) / DUR;
        if (k >= 1) { el.textContent = final; tarefas.delete(digitos); return false; }
        // cada digito gira e assenta da esquerda para a direita; o que ja assentou fica
        let s = '';
        for (let i = 0; i < n; i++) {
          const assenta = (i + 1) / (n + 1);
          s += k >= assenta ? final[i] : String((Math.floor(agora / 45) * 7 + i * 3) % 10);
        }
        if (s !== ultimo) { el.textContent = s; ultimo = s; }
        return true;
      });
      pedirQuadro();
    },
    soltar() {},
  });
}

// ------------------------------------------------------------------ 5. filetes
function filetes() {
  const els = [...document.querySelectorAll(
    '.indice-rotulo, .sumario > .entrada, .linhagem:not(.indice-rotulo + .linhagem), .navega > .navega-antes, .navega > .navega-depois, .prosa h2',
  )];
  revelar(els, {
    armar(el) { el.classList.add('ed-filete'); },
    tocar(el) {
      el.classList.add('ed-filete-tocando');
      const fim = () => el.classList.remove('ed-filete', 'ed-filete-tocando');
      setTimeout(fim, 1000);
    },
    soltar(el) { el.classList.remove('ed-filete', 'ed-filete-tocando'); },
  });
}

// ------------------------------------------------------------------ 6. barra de leitura
function leitura() {
  const folha = document.querySelector('.folha');
  const prosa = folha && folha.querySelector('.prosa');
  const h1 = folha && folha.querySelector('.cabeca h1');
  if (!prosa || !h1) return;
  const rot = folha.querySelector('.cabeca .rotulo');
  const num = (rot && (rot.textContent.match(/\d{4}/) || [])[0]) || '';
  const barra = document.createElement('div');
  barra.className = 'ed-leitura';
  barra.setAttribute('aria-hidden', 'true');
  barra.innerHTML = '<div class="ed-leitura-interno"><span class="ed-l-num"></span>'
    + '<span class="ed-l-trilha"><span class="ed-l-feito"></span><span class="ed-l-falta"></span></span>'
    + '<span class="ed-l-pct"></span></div>';
  barra.querySelector('.ed-l-num').textContent = num;
  document.body.appendChild(barra);
  const trilha = barra.querySelector('.ed-l-trilha');
  const feito = barra.querySelector('.ed-l-feito');
  const falta = barra.querySelector('.ed-l-falta');
  const pct = barra.querySelector('.ed-l-pct');
  let celula = 0;
  let antes = '';
  function medir() {
    const s = document.createElement('span');
    s.textContent = '──────────';
    s.style.cssText = 'position:absolute;visibility:hidden';
    trilha.appendChild(s);
    celula = s.getBoundingClientRect().width / 10;
    trilha.removeChild(s);
  }
  tarefas.add(() => {
    const mostrar = h1.getBoundingClientRect().bottom < 0;
    barra.classList.toggle('ed-leitura-visivel', mostrar);
    if (!mostrar) return false;
    if (!celula) medir();
    const r = prosa.getBoundingClientRect();
    const k = limitar((innerHeight - r.top) / Math.max(1, r.height), 0, 1);
    const total = Math.max(4, Math.floor(trilha.clientWidth / (celula || 7)));
    const n = Math.round(k * total);
    const chave = `${n}/${total}`;
    if (chave !== antes) {
      feito.textContent = '━'.repeat(n);
      falta.textContent = '─'.repeat(total - n);
      pct.textContent = `${String(Math.round(k * 100)).padStart(3, ' ')}%`;
      antes = chave;
    }
    return false;
  });
  addEventListener('resize', () => { celula = 0; antes = ''; }, { passive: true });
  pedirQuadro();
}

// ------------------------------------------------------------------ 2b. margem em dois planos
function margem() {
  const fig = document.querySelector('.margem-efeito');
  const pre = fig && fig.querySelector('pre[data-marca-efeito]');
  if (!pre) return;
  // heatmap com profundidade: os planos sao do proprio motor (andam com o ponteiro e a
  // rolagem dentro da grade); o de pontos em CSS so entra nos efeitos de um plano so
  const proprios = pre.dataset.marcaEfeito === 'heatmap'
    && ['profundo', 'nevoa', 'cometa', 'lupa'].includes(pre.dataset.marcaPredefinicao);
  let plano = null;
  if (!proprios) {
    plano = document.createElement('div');
    plano.className = 'ed-plano';
    plano.setAttribute('aria-hidden', 'true');
    fig.insertBefore(plano, pre);
  }
  fig.classList.add('ed-margem');
  const atual = { x: 0, y: 0, px: 0, py: 0 };
  let antes = '';
  tarefas.add(() => {
    const r = pre.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return false;
    const d = direcao(r);
    // efeito para a frente (com o ponteiro), pontos para tras (contra); a rolagem empurra
    // os pontos devagar, enquanto o efeito fica preso (sticky): paralaxe
    const alvo = { x: d.x * 3, y: d.y * 2, px: -d.x * 4, py: -d.y * 3 };
    let mexe = false;
    for (const c of ['x', 'y', 'px', 'py']) {
      const dv = alvo[c] - atual[c];
      atual[c] = Math.abs(dv) < 0.05 ? alvo[c] : atual[c] + dv * 0.14;
      if (atual[c] !== alvo[c]) mexe = true;
    }
    const deriva = Math.round(scrollY * 0.08);
    const s = `${Math.round(atual.x)},${Math.round(atual.y)},${Math.round(atual.px)},${Math.round(atual.py)},${deriva}`;
    if (s !== antes) {
      pre.style.transform = `translate(${Math.round(atual.x)}px, ${Math.round(atual.y)}px)`;
      if (plano) {
        plano.style.transform = `translate(${Math.round(atual.px)}px, ${Math.round(atual.py)}px)`;
        plano.style.backgroundPosition = `0 ${-deriva}px`;
      }
      antes = s;
    }
    return mexe;
  });
  pedirQuadro();
}

// ------------------------------------------------------------------ 1+2. capas
// A capa e' toda do motor. Aqui so se decide quando ela se monta e se empilham as camadas:
// o <pre> do include (o que tem role=img) fica com params.camadas ['moldura'] e ganha dois
// <pre> irmaos, montados aqui com o mesmo montar() do motor, um com ['fundo'] e outro com
// ['nome']. As tres camadas nao se sobrepoem; deslocadas em px (so transform), fazem
// paralaxe com o ponteiro e a rolagem.
//
// Montagem no tempo, disparada pela entrada na tela (nunca pela posicao da rolagem):
// - capa com a maior parte na tela ao abrir: monta logo que o motor desenhou;
// - as outras: quando 25% dela entra na janela;
// - uma vez so, em TEMPO_MONTAGEM com ease-out, progresso continuo a cada quadro
//   (instancia.definir({progresso}) nas tres camadas, com o relogio do motor pausado);
//   no fim as tres saltam juntas para QUADRO_VIVO e voltam a andar: a capa fica viva e
//   nao desmonta ao sair e voltar.
// Antes de montar, o atributo data-marca-progresso fica no piso (so o canto da moldura),
// e a remontagem do include (tema, largura) le de novo o atributo.
// Aquecimento: a primeira grade completa de um fundo pode ser cara (reacao-difusao simula
// 180 quadros, ~160 ms). Com a capa a uma janela de distancia, num requestIdleCallback,
// renderiza-se uma vez o quadro final da camada do fundo; o cache do proprio efeito guarda o
// estado maduro e a animacao ja comeca com ele pronto.
const PISO = 0.001;           // progresso antes de montar: so o canto (nunca um <pre> vazio)
const TEMPO_MONTAGEM = 1250;  // ms da montagem
// quadro logico em que a capa volta a viver: depois da maturidade da reacao-difusao
// (preparo 20 + 160 quadros), para o fundo vivo ser o mesmo estado maduro da montagem
// (antes dele, o efeito recomecaria a simulacao do zero, com o padrao ainda nascendo)
const QUADRO_VIVO = 200;
const EXTRAS = ['fundo', 'nome'];
const suave = (t) => 1 - (1 - t) ** 3; // ease-out cubico

function capas() {
  const lista = [...document.querySelectorAll('figure.marca-capa')]
    .map((fig) => ({ fig, pre: fig.querySelector('pre[data-marca-efeito="capa"]') }))
    .filter((c) => c.pre);
  if (!lista.length) return;
  // o motor pelas mesmas URLs que o include importa (o mapa de imports poe o carimbo):
  // o mesmo modulo, o mesmo registro de efeitos e o mesmo cache da reacao-difusao
  const url = (r) => new URL(r, import.meta.url).href;
  const motor = Promise.all([
    import(url('../marca/motor/pintor-pre.mjs')),
    import(url('../marca/motor/nucleo.mjs')),
    import(url('../marca/efeitos/indice.mjs')),
  ]).then(([pintor, nucleo]) => ({ montar: pintor.montar, renderizar: nucleo.renderizar }));
  let m = null;
  motor.then((x) => { m = x; pedirQuadro(); }).catch((e) => console.warn(`editorial: capa sem camadas (${e.message})`));
  const ocioso = window.requestIdleCallback || ((f) => setTimeout(f, 50));
  const inteiro = (v) => (Number.parseInt(v, 10) > 0 ? Number.parseInt(v, 10) : undefined);
  const gradeDe = (ds) => {
    const estreita = estreito.matches && ds.marcaColunasEstreita !== undefined;
    return {
      cols: inteiro(estreita ? ds.marcaColunasEstreita : ds.marcaColunas),
      linhas: inteiro(estreita ? (ds.marcaLinhasEstreita ?? ds.marcaLinhas) : ds.marcaLinhas),
    };
  };

  for (const c of lista) {
    const ds = c.pre.dataset;
    c.params = ds.marcaParams ? JSON.parse(ds.marcaParams) : {};
    c.dados = ds.marcaDados ? JSON.parse(ds.marcaDados) : {};
    // a remontagem do include le o dataset: a camada da moldura fica gravada nele
    ds.marcaParams = JSON.stringify({ ...c.params, camadas: ['moldura'] });
    c.extras = EXTRAS.map((nome) => {
      const pre = document.createElement('pre');
      pre.className = `ed-camada ed-camada-${nome}`;
      pre.setAttribute('aria-hidden', 'true');
      pre.setAttribute('style', c.pre.getAttribute('style') || '');
      for (const a of ['data-marca-colunas', 'data-marca-linhas', 'data-marca-colunas-estreita', 'data-marca-linhas-estreita']) {
        if (c.pre.hasAttribute(a)) pre.setAttribute(a, c.pre.getAttribute(a));
      }
      c.fig.insertBefore(pre, nome === 'fundo' ? c.pre : c.pre.nextSibling);
      return { nome, pre, inst: null };
    });
    c.todos = [c.pre, ...c.extras.map((e) => e.pre)];
    for (const pre of c.todos) pre.setAttribute('data-marca-progresso', String(PISO));
    c.modo = 'espera';   // espera -> montando -> viva
    c.inicio = 0;
    c.aquecida = '';     // grade (cols x linhas) ja aquecida
    {
      const r = c.fig.getBoundingClientRect();
      const visivel = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
      c.disparada = r.height > 0 && visivel / r.height > 0.5; // maior parte na tela ao abrir
    }
    c.atual = { nx: 0, ny: 0, fx: 0, fy: 0 };
    c.antes = '';

    const aoMontar = (inst) => {
      if (!inst.params.camadas) inst.definir({ camadas: ['moldura'] });
      motor.then(({ montar }) => montarExtras(c, montar, inst)).catch(() => {});
      pedirQuadro();
    };
    c.pre.addEventListener('marca:montado', (ev) => aoMontar(ev.detail));
    if (c.pre.marcaMotor) aoMontar(c.pre.marcaMotor);
    // a uma janela de distancia: aquece no ocioso
    const perto = new IntersectionObserver((es) => {
      if (!es[es.length - 1].isIntersecting) return;
      perto.disconnect();
      motor.then(() => ocioso(() => aquecer(c), { timeout: 1500 })).catch(() => {});
    }, { rootMargin: '100% 0px 100% 0px' });
    perto.observe(c.fig);
    // 25% na janela: dispara a montagem
    const entra = new IntersectionObserver((es) => {
      const e = es[es.length - 1];
      if (!e.isIntersecting || e.intersectionRatio < 0.25) return;
      entra.disconnect();
      c.disparada = true;
      pedirQuadro();
    }, { threshold: [0.25] });
    entra.observe(c.fig);
  }

  // Renderiza uma vez, fora da tela, a camada do fundo no ponto em que a montagem a mostra
  // (progresso 1: o fundo parado e maduro). So enche o cache do efeito; a grade e' descartada.
  function aquecer(c) {
    if (!m) return;
    const g = gradeDe(c.pre.dataset);
    const chave = `${g.cols}x${g.linhas}`;
    if (c.aquecida === chave || !g.cols || !g.linhas) return;
    c.aquecida = chave;
    try {
      m.renderizar('capa', {
        cols: g.cols, linhas: g.linhas, quadro: 0, semente: 0,
        params: { ...c.params, camadas: ['fundo'], progresso: 1 },
        entrada: { tema: raiz.dataset.tema || 'claro', dados: c.dados }, parado: false,
      });
    } catch (e) {
      console.warn(`editorial: aquecimento da capa falhou (${e.message})`);
    }
  }

  function montarExtras(c, montar, inst) {
    if (inst !== c.pre.marcaMotor) return; // ja houve outra montagem depois desta
    const ds = c.pre.dataset;
    const g = gradeDe(ds);
    for (const e of c.extras) {
      e.inst?.destruir();
      e.inst = montar(e.pre, 'capa', {
        semente: ds.marcaSemente ?? 0,
        params: { ...c.params, camadas: [e.nome] },
        dados: c.dados,
        reativo: true,
        cols: g.cols,
        linhas: g.linhas,
        quadroInicial: Math.max(0, inst.quadro),
      });
    }
    pedirQuadro();
  }

  const instancias = (c) => [c.pre.marcaMotor, ...c.extras.map((e) => e.inst)];
  // as tres camadas montadas pelo motor e ja desenhadas (fonte pronta, grade medida)
  const prontas = (c) => instancias(c).every((i) => i && i.grade);

  function terminar(c) {
    c.modo = 'viva';
    const insts = instancias(c).filter(Boolean);
    // as tres no mesmo quadro, depois da maturidade do fundo (desenhado ainda com o
    // progresso da montagem, o fundo parado e maduro, do cache)
    const q = Math.max(QUADRO_VIVO, ...insts.map((i) => i.quadro));
    for (const i of insts) i.irPara(q);
    // sem o atributo, o motor tira o param sozinho (o observador dele redesenha a capa viva
    // no mesmo quadro) e as remontagens ja nascem vivas
    for (const pre of c.todos) pre.removeAttribute('data-marca-progresso');
    for (const i of insts) i.retomar();
  }

  tarefas.add(function capasNoQuadro(agora) {
    let mais = false;
    const vh = innerHeight;
    for (const c of lista) {
      if (c.modo === 'espera' && c.disparada) {
        if (!m || !prontas(c)) { mais = true; }
        else {
          aquecer(c); // se o ocioso ainda nao veio, aquece agora, antes do primeiro quadro
          c.modo = 'montando';
          c.inicio = performance.now();
          mais = true;
          continue; // o aquecimento pode ter levado o quadro inteiro: anima no proximo
        }
      }
      if (c.modo === 'montando') {
        const t = limitar((agora - c.inicio) / TEMPO_MONTAGEM, 0, 1);
        if (t >= 1) terminar(c);
        else {
          const k = Math.max(PISO, suave(t));
          // relogio do motor parado durante a montagem: um desenho por quadro, o nosso
          for (const i of instancias(c)) if (i) { i.pausar(); i.definir({ progresso: k }); }
          mais = true;
        }
      }
      const r = c.fig.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) continue;
      // profundidade: o nome vem para a frente (com o ponteiro), o fundo vai para tras
      // (contra), a moldura fica. Na rolagem o nome anda mais que a pagina e o fundo menos.
      // Deslocamento menor que a folga do kit (2 colunas e 1 linha em volta do nome, 3
      // colunas e 1 linha entre o fundo e a moldura): as camadas nunca se encostam.
      const d = direcao(r);
      const rel = limitar((r.top + r.height / 2 - vh / 2) / vh, -1, 1);
      const cel = c.pre.marcaMotor?.celula;
      const f = limitar((cel?.l || 7) / 7, 0.5, 1); // capa miuda, deslocamento menor
      const alvo = {
        nx: d.x * 3 * f, ny: (d.y * 1.8 - rel * 5) * f,
        fx: -d.x * 4.5 * f, fy: (-d.y * 2.8 + rel * 4) * f,
      };
      for (const k of ['nx', 'ny', 'fx', 'fy']) {
        alvo[k] = limitar(alvo[k], -6, 6);
        const dv = alvo[k] - c.atual[k];
        c.atual[k] = Math.abs(dv) < 0.05 ? alvo[k] : c.atual[k] + dv * 0.14;
        if (c.atual[k] !== alvo[k]) mais = true;
      }
      const nx = Math.round(c.atual.nx), ny = Math.round(c.atual.ny);
      const fx = Math.round(c.atual.fx), fy = Math.round(c.atual.fy);
      const s = `${nx},${ny},${fx},${fy}`;
      if (s !== c.antes) {
        c.extras[1].pre.style.transform = `translate(${nx}px, ${ny}px)`;
        c.extras[0].pre.style.transform = `translate(${fx}px, ${fy}px)`;
        c.antes = s;
      }
    }
    return mais;
  });
  pedirQuadro();
}

// ------------------------------------------------------------------ partida
leitura();
if (!reduzido) {
  raiz.classList.add('ed-js');
  titulos();
  numeros();
  filetes();
  margem();
  capas();
}
