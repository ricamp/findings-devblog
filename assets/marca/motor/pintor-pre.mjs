// Pintor de <pre>: o pintor do site. Leva a grade do motor para um <pre class="fx"> com um
// innerHTML por quadro lógico, e só quando o quadro muda. As cores ficam no CSS (classes
// t-… sobre as variáveis do tema), então trocar o tema não exige redesenho.
//
// Economia e acessibilidade:
// - fora da tela (IntersectionObserver) ou com a aba escondida, para;
// - com prefers-reduced-motion: reduce, desenha uma vez com parado: true e não agenda nada;
// - depois de `limite` ms sem interação (ponteiro, rolagem, tecla, toque), congela no
//   quadro em que está, sem requestAnimationFrame rodando; a interação reagenda;
// - pausa global em localStorage['findings-movimento'] = 'pausado', avisada pelo evento
//   'findings:movimento' no document;
// - o <pre> é decorativo: recebe aria-hidden="true" se não tiver role.
//
// As funções medirGrade, lerOpcoes e lerProgresso são puras (testadas no Node); o resto
// precisa de DOM, mas nada aqui toca o DOM ao importar o módulo.
//
// Controle por fora (rolagem, paralaxe): a instância montada fica no próprio elemento,
// em `pre.marcaMotor` (e `instanciaDe(pre)`), e o elemento dispara 'marca:montado' com
// ela em `detail` a cada montagem (remontar por tema cria outra instância). Ela tem
// `definir(params)` (soma aos params e redesenha o quadro em que está; um valor
// undefined tira o param), `irPara(quadro)` (congela nesse quadro lógico; `retomar()`
// volta a andar dali) e `params` (cópia dos atuais). Sem script: o atributo
// `data-marca-progresso` (ou `data-progresso`) no <pre>, de 0 a 1, vira
// `params.progresso` e é observado; tirar o atributo tira o param. A capa usa
// `progresso` para se montar pela rolagem, e `params.camadas` para desenhar só a
// moldura, o fundo ou o nome. Todo efeito recebe `entrada.naJanela` (o <pre> está na
// tela, pelo IntersectionObserver).

import { renderizar, gradeParaHTML, sementeDe } from './nucleo.mjs';
import { quadroLogico, deveParar, criarRelogio, msDoQuadro } from './ritmo.mjs';

const CHAVE_MOVIMENTO = 'findings-movimento';
const EVENTO_MOVIMENTO = 'findings:movimento';
const LIMITE_OCIOSO = 6000;

// ---------------------------------------------------------------- partes puras

// Colunas e linhas inteiras que cabem na caixa interna. cols/linhas dados fixam o valor.
export function medirGrade({ largura, altura, larguraCar, alturaLinha, cols, linhas }) {
  const c = cols > 0 ? cols : Math.max(1, Math.floor(largura / larguraCar));
  const l = linhas > 0 ? linhas : Math.max(1, Math.floor(altura / alturaLinha));
  return { cols: c, linhas: l };
}

// Semente: número inteiro como tal; qualquer outro texto passa por sementeDe.
export function lerSemente(v) {
  if (v === undefined || v === null || v === '') return 0;
  if (typeof v === 'number') return v >>> 0;
  const s = String(v).trim();
  return /^\d+$/.test(s) ? Number(s) >>> 0 : sementeDe(s);
}

function inteiroOuNada(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

// Lê as opções de um dataset (data-efeito, data-predefinicao, data-semente, data-params,
// data-reativo, data-cols, data-linhas).
export function lerOpcoes(ds) {
  return {
    nome: ds.efeito,
    predefinicao: ds.predefinicao || undefined,
    semente: lerSemente(ds.semente),
    params: ds.params ? JSON.parse(ds.params) : {},
    reativo: ds.reativo !== undefined && ds.reativo !== 'false',
    cols: inteiroOuNada(ds.cols),
    linhas: inteiroOuNada(ds.linhas),
  };
}

// Valor do atributo de progresso → número de 0 a 1, ou undefined (sem atributo, vazio
// ou texto que não é número).
export function lerProgresso(v) {
  if (v === undefined || v === null || String(v).trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : undefined;
}

// Trilha do ponteiro para efeitos que lembram por onde ele passou (rastro): um ponto
// {x, y, quadro} por quadro lógico com ponteiro. Pura: devolve vetor novo. Não acrescenta
// com ponteiro nulo nem duas vezes o mesmo quadro; descarta o que tem quadro < atual − max
// e o que é mais novo que o atual (o quadro volta numa remontagem ou com movimento reduzido).
export function atualizarTrilha(trilha, ponteiro, quadro, max = 40) {
  const nova = (trilha || []).filter((p) => p.quadro >= quadro - max && p.quadro <= quadro);
  if (ponteiro && !nova.some((p) => p.quadro === quadro)) nova.push({ ...ponteiro, quadro });
  return nova;
}

// ---------------------------------------------------------------- atividade (compartilhada)

// Um só conjunto de ouvintes em window para todos os pintores. Guarda o instante da última
// interação e acorda quem estiver congelado por ociosidade.
const atividade = {
  ultima: 0,
  inscritos: new Set(),
  ligado: false,
  ponteiro: null, // {clientX, clientY} da última posição conhecida
  aoInteragir(ev) {
    atividade.ultima = performance.now();
    // pointerdown também: no celular o toque faz o papel do ponteiro (um toque sem
    // arrastar não gera pointermove)
    if (ev.type === 'pointermove' || ev.type === 'pointerdown') atividade.ponteiro = { clientX: ev.clientX, clientY: ev.clientY };
    for (const f of atividade.inscritos) f();
  },
  inscrever(f) {
    if (!atividade.ligado) {
      atividade.ultima = performance.now();
      for (const tipo of ['pointermove', 'pointerdown', 'scroll', 'keydown', 'touchstart'])
        window.addEventListener(tipo, atividade.aoInteragir, { passive: true });
      atividade.ligado = true;
    }
    atividade.inscritos.add(f);
  },
  desinscrever(f) {
    atividade.inscritos.delete(f);
    if (atividade.inscritos.size === 0 && atividade.ligado) {
      for (const tipo of ['pointermove', 'pointerdown', 'scroll', 'keydown', 'touchstart'])
        window.removeEventListener(tipo, atividade.aoInteragir);
      atividade.ligado = false;
    }
  },
};

function lerPausaGlobal() {
  try {
    return localStorage.getItem(CHAVE_MOVIMENTO) === 'pausado';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- medida da célula

// Mede a célula com uma sonda dentro do próprio <pre> (mesma fonte, mesmo line-height):
// 10 caracteres na primeira linha e uma segunda linha, para tirar a altura da linha.
function medirCelula(pre) {
  const sonda = document.createElement('span');
  sonda.textContent = 'MMMMMMMMMM\nM';
  sonda.style.cssText = 'position:absolute;visibility:hidden;display:inline-block;padding:0;border:0;margin:0';
  pre.appendChild(sonda);
  const r = sonda.getBoundingClientRect();
  pre.removeChild(sonda);
  return { l: r.width / 10, a: r.height / 2 };
}

function caixaInterna(pre) {
  const cs = getComputedStyle(pre);
  const px = (v) => parseFloat(v) || 0;
  return {
    largura: pre.clientWidth - px(cs.paddingLeft) - px(cs.paddingRight),
    altura: pre.clientHeight - px(cs.paddingTop) - px(cs.paddingBottom),
  };
}

// ---------------------------------------------------------------- montar

const MONTADOS = new WeakMap();
const ATRIBUTOS_PROGRESSO = ['data-marca-progresso', 'data-progresso'];

// A instância montada num <pre> (ou undefined).
export function instanciaDe(pre) {
  return MONTADOS.get(pre);
}

// opcoes: { semente, params, predefinicao, reativo, dados, limite, aoDesenhar, quadroInicial }
// quadroInicial (padrão 0): o relógio já começa nesse quadro lógico. Serve para remontar
// (outra semente, outra predefinição) sem voltar ao quadro 0, por exemplo com a pausa
// global ligada: o pintor novo mostra o mesmo momento em que o anterior estava congelado.
// aoDesenhar(grade, quadro) é chamado depois de cada desenho (serve para espelhar o mesmo
// quadro num canvas). Devolve { pausar, retomar, destruir } e, para diagnóstico, os
// getters quadro, grade e celula.
export function montar(pre, nome, opcoes = {}) {
  const {
    semente: sementeBruta = 0, params: paramsIniciais = {}, predefinicao, reativo = false, dados = {},
    limite = LIMITE_OCIOSO, aoDesenhar = null, quadroInicial = 0,
  } = opcoes;
  const semente = lerSemente(sementeBruta);
  let params = { ...paramsIniciais };
  const progressoDoAtributo = () => {
    for (const a of ATRIBUTOS_PROGRESSO) if (pre.hasAttribute(a)) return lerProgresso(pre.getAttribute(a));
    return undefined;
  };
  {
    const p0 = progressoDoAtributo();
    if (p0 !== undefined) params.progresso = p0;
  }
  const fixas = {
    cols: inteiroOuNada(opcoes.cols ?? pre.dataset.cols),
    linhas: inteiroOuNada(opcoes.linhas ?? pre.dataset.linhas),
  };

  if (!pre.hasAttribute('role')) pre.setAttribute('aria-hidden', 'true');
  pre.classList.add('fx');

  let relogio = criarRelogio(quadroInicial > 0 ? msDoQuadro(quadroInicial) : 0);
  const movimento = window.matchMedia('(prefers-reduced-motion: reduce)');
  const estado = {
    pronto: false,     // fonte carregada e grade medida
    visivel: true,     // IntersectionObserver
    aba: document.visibilityState !== 'hidden',
    global: lerPausaGlobal(),
    manual: false,
    ocioso: false,
    reduzido: movimento.matches,
    destruido: false,
  };
  let dims = null;          // {cols, linhas}
  let celula = null;        // {l, a} em px
  let quadroDesenhado = -1;
  let ultimaGrade = null;
  let raf = 0;
  let trilha = []; // só com reativo: pontos do ponteiro dentro da grade deste <pre>

  function entrada(quadro) {
    const e = { tema: document.documentElement.dataset.tema || 'claro', dados, naJanela: estado.visivel };
    if (reativo) {
      const p = atividade.ponteiro;
      if (p && celula) {
        const r = pre.getBoundingClientRect();
        e.ponteiro = { x: Math.floor((p.clientX - r.left) / celula.l), y: Math.floor((p.clientY - r.top) / celula.a) };
      } else {
        e.ponteiro = null;
      }
      const max = document.documentElement.scrollHeight - window.innerHeight;
      e.rolagem = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      // na trilha só entra o ponteiro dentro da grade; e.ponteiro segue como está (os
      // efeitos que puxam para o ponteiro já tratam o de fora como ausente)
      const p2 = e.ponteiro;
      const dentro = p2 && dims && p2.x >= 0 && p2.y >= 0 && p2.x < dims.cols && p2.y < dims.linhas;
      trilha = atualizarTrilha(trilha, dentro ? { x: p2.x, y: p2.y } : null, quadro);
    }
    e.trilha = trilha;
    return e;
  }

  function desenhar(quadro) {
    if (!dims) return;
    const grade = renderizar(nome, {
      cols: dims.cols, linhas: dims.linhas, quadro, semente, params, predefinicao,
      entrada: entrada(quadro), parado: estado.reduzido,
    });
    pre.innerHTML = gradeParaHTML(grade);
    quadroDesenhado = quadro;
    ultimaGrade = grade;
    if (aoDesenhar) aoDesenhar(grade, quadro);
  }

  const podeAndar = () => estado.pronto && estado.visivel && estado.aba && !estado.global
    && !estado.manual && !estado.ocioso && !estado.reduzido && !estado.destruido;

  function quadroAgora() {
    return quadroLogico(relogio.ms(performance.now()));
  }

  function passo() {
    raf = 0;
    const agora = performance.now();
    if (deveParar({ msSemInteracao: agora - atividade.ultima, limite })) {
      estado.ocioso = true;
      atualizar();
      return;
    }
    const q = quadroAgora();
    if (q !== quadroDesenhado) desenhar(q);
    raf = requestAnimationFrame(passo);
  }

  // Liga ou desliga o relógio e o agendamento conforme o estado.
  function atualizar() {
    const agora = performance.now();
    if (podeAndar()) {
      relogio.andar(agora);
      if (!raf) raf = requestAnimationFrame(passo);
    } else {
      relogio.parar(agora);
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
    }
  }

  // Mede de novo; se a grade mudou de tamanho, redesenha o quadro em que está.
  function remedir() {
    if (estado.destruido) return;
    celula = medirCelula(pre);
    const novo = medirGrade({ ...caixaInterna(pre), larguraCar: celula.l, alturaLinha: celula.a, ...fixas });
    if (!dims || novo.cols !== dims.cols || novo.linhas !== dims.linhas) {
      dims = novo;
      trilha = []; // a grade mudou: os pontos antigos não caem mais nas mesmas células
      desenhar(estado.reduzido ? 0 : quadroAgora());
    }
  }

  // ---- ouvintes
  const aoAcordar = () => {
    if (estado.ocioso) { estado.ocioso = false; atualizar(); }
  };
  const aoMovimentoGlobal = () => { estado.global = lerPausaGlobal(); atualizar(); };
  const aoVisibilidade = () => { estado.aba = document.visibilityState !== 'hidden'; atualizar(); };
  const aoReduzido = () => {
    estado.reduzido = movimento.matches;
    if (dims) desenhar(estado.reduzido ? 0 : quadroAgora());
    atualizar();
  };
  const io = new IntersectionObserver((entradas) => {
    estado.visivel = entradas[entradas.length - 1].isIntersecting;
    atualizar();
  });
  // o atributo de progresso, observado
  const mo = new MutationObserver(() => {
    const p = progressoDoAtributo();
    instancia.definir({ progresso: p });
  });
  mo.observe(pre, { attributes: true, attributeFilter: ATRIBUTOS_PROGRESSO });
  // Callback do ResizeObserver adiado um quadro: evita o aviso de laço quando o próprio
  // desenho mexe no tamanho do <pre>.
  let rafMedida = 0;
  const ro = new ResizeObserver(() => {
    if (!estado.pronto || rafMedida) return;
    rafMedida = requestAnimationFrame(() => { rafMedida = 0; remedir(); });
  });

  atividade.inscrever(aoAcordar);
  document.addEventListener(EVENTO_MOVIMENTO, aoMovimentoGlobal);
  document.addEventListener('visibilitychange', aoVisibilidade);
  movimento.addEventListener('change', aoReduzido);
  io.observe(pre);
  ro.observe(pre);

  const fontes = document.fonts ? document.fonts.ready : Promise.resolve();
  fontes.then(() => {
    if (estado.destruido) return;
    estado.pronto = true;
    remedir();
    atualizar();
  });

  // redesenha o quadro em que está (ou o 0, com movimento reduzido)
  const redesenhar = () => {
    if (!dims || estado.destruido) return;
    desenhar(estado.reduzido ? 0 : (quadroDesenhado >= 0 ? quadroDesenhado : quadroAgora()));
  };

  const instancia = {
    definir(novos = {}) {
      const p = { ...params, ...novos };
      for (const [k, v] of Object.entries(novos)) if (v === undefined) delete p[k];
      params = p;
      redesenhar();
    },
    irPara(quadro) {
      const q = Math.max(0, Math.floor(Number(quadro) || 0));
      estado.manual = true;
      atualizar();
      relogio.parar(performance.now());
      relogio = criarRelogio(msDoQuadro(q));
      if (dims && !estado.destruido) desenhar(q);
    },
    get params() { return { ...params }; },
    pausar() { estado.manual = true; atualizar(); },
    retomar() { estado.manual = false; atualizar(); },
    destruir() {
      estado.destruido = true;
      atualizar();
      if (rafMedida) cancelAnimationFrame(rafMedida);
      atividade.desinscrever(aoAcordar);
      document.removeEventListener(EVENTO_MOVIMENTO, aoMovimentoGlobal);
      document.removeEventListener('visibilitychange', aoVisibilidade);
      movimento.removeEventListener('change', aoReduzido);
      io.disconnect();
      ro.disconnect();
      mo.disconnect();
      MONTADOS.delete(pre);
      if (pre.marcaMotor === instancia) delete pre.marcaMotor;
    },
    get quadro() { return quadroDesenhado; },
    get grade() { return ultimaGrade; },
    get celula() { return celula; },
    get agendado() { return raf !== 0; },
  };
  MONTADOS.set(pre, instancia);
  pre.marcaMotor = instancia;
  if (typeof CustomEvent === 'function') pre.dispatchEvent(new CustomEvent('marca:montado', { detail: instancia }));
  return instancia;
}

// Monta em todo pre[data-efeito] dentro de raiz que ainda não esteja montado.
export function montarTodos(raiz = document) {
  const lista = [];
  for (const pre of raiz.querySelectorAll('pre[data-efeito]')) {
    if (MONTADOS.has(pre)) { lista.push(MONTADOS.get(pre)); continue; }
    const o = lerOpcoes(pre.dataset);
    lista.push(montar(pre, o.nome, o));
  }
  return lista;
}
