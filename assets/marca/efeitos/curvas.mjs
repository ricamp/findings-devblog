// Efeito "curvas": uma curva de avaliação (ROC, calibração, loss) em meio-blocos. Cada
// célula tem duas amostras verticais: ▀ acende só a de cima, ▄ só a de baixo, █ as duas.
// Com a célula duas vezes mais alta que larga, a amostra fica quase quadrada.
//
// Área de desenho: a grade inteira, ou, com `eixos`, tudo menos a coluna 0 (│) e a última
// linha (─), com └ no canto, em tinta-3. Na área, a coluna c vale x = c/(L − 1) e a amostra
// v (0 embaixo) vale y = v/(2A − 1), para L colunas e A linhas.
//
// `pontos`: vetor de [x, y], limitados a 0..1 (NaN sai; ±Infinity vira a borda) e ordenados
// por x. Sem `pontos`, a curva de exemplo do tipo, matemática e fixa (41 pontos):
//   roc        y = x^0,35
//   calibracao y = x + 0,08·sin(2πx)
//   loss       y = 0,15 + 0,8·exp(−4x)
// A curva vai da coluna do primeiro ponto à do último, por interpolação linear. Para não
// haver buraco quando ela sobe mais que uma amostra de uma coluna para a outra, o salto é
// dividido ao meio: cada coluna estende a sua amostra até a metade do caminho para cada
// vizinha, e as duas metades se encostam.
//
// `referencia` (null = sim em roc e calibracao): a diagonal y = x em ·, tinta-3. Eixos e
// diagonal vão por baixo: nunca cobrem a curva. `marcar`: índice de um ponto (de `pontos`,
// ou dos 41 do exemplo) que vira █ em achado, na célula da curva na coluna do ponto. Progresso p de 0 a 1 em `duracao`: a curva
// se desenha da esquerda para a direita (as primeiras ⌊p·L⌋ colunas da área). `parado`
// mostra o fim; `laco` recomeça depois de duracao + pausa.

import { registrar, por } from '../motor/nucleo.mjs';
import { tempo, limitar } from './_comum.mjs';

const EXEMPLOS = {
  roc: (x) => x ** 0.35,
  calibracao: (x) => x + 0.08 * Math.sin(2 * Math.PI * x),
  loss: (x) => 0.15 + 0.8 * Math.exp(-4 * x),
};
const PONTOS_DO_EXEMPLO = 41;

// Área de desenho da grade: { x0, y0, largura, altura } em células.
export function areaDasCurvas(cols, linhas, { eixos = true } = {}) {
  if (!eixos) return { x0: 0, y0: 0, largura: cols, altura: linhas };
  return { x0: 1, y0: 0, largura: Math.max(0, cols - 1), altura: Math.max(0, linhas - 1) };
}

// Pontos do quadro, limitados à faixa: vetor de { x, y, i } (i: o índice de origem),
// ordenado por x.
function pontosDe(q) {
  let bruto;
  if (q.pontos === null || q.pontos === undefined) {
    const f = EXEMPLOS[q.tipo] ?? EXEMPLOS.roc;
    bruto = Array.from({ length: PONTOS_DO_EXEMPLO }, (_, i) => {
      const x = i / (PONTOS_DO_EXEMPLO - 1);
      return [x, f(x)];
    });
  } else bruto = Array.isArray(q.pontos) ? q.pontos : [];
  const ps = [];
  bruto.forEach((p, i) => {
    if (!Array.isArray(p)) return;
    const x = Number(p[0]), y = Number(p[1]);
    if (Number.isNaN(x) || Number.isNaN(y)) return;
    ps.push({ x: limitar(x, 0, 1), y: limitar(y, 0, 1), i });
  });
  return ps.sort((a, b) => a.x - b.x || a.i - b.i);
}

// y em x por interpolação linear (x dentro da faixa dos pontos).
function interpolar(ps, x) {
  if (x <= ps[0].x) return ps[0].y;
  for (let k = 1; k < ps.length; k++) {
    const a = ps[k - 1], b = ps[k];
    if (x <= b.x) return b.x === a.x ? b.y : a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y);
  }
  return ps[ps.length - 1].y;
}

function progresso(ctx) {
  if (ctx.parado) return 1;
  const { duracao, laco, pausa } = ctx.params;
  let t = tempo(ctx);
  if (laco) t %= Math.max(1e-6, duracao + pausa);
  return duracao > 0 ? limitar(t / duracao, 0, 1) : 1;
}

registrar('curvas', {
  // tipo: roc, calibracao ou loss (a curva de exemplo e a referência padrão); pontos: [x, y]
  //   em 0..1, ou null para o exemplo; eixos; referencia: null (pelo tipo), true ou false;
  //   marcar: índice de um ponto, em achado (null: nenhum).
  // duracao (s), laco, pausa (s): o contrato dos efeitos com começo e fim.
  // tom: o da curva; eixos e diagonal vão em tinta-3.
  padrao: {
    velocidade: 1, tipo: 'roc', pontos: null, eixos: true, referencia: null, marcar: null,
    duracao: 2, laco: false, pausa: 1.5, tom: 'tinta',
  },
  predefinicoes: {
    roc: { tipo: 'roc' },
    calibracao: { tipo: 'calibracao' },
    loss: { tipo: 'loss' },
  },
  desenhar(grade, ctx) {
    const { params: q } = ctx;
    const { cols, linhas } = grade;
    const area = areaDasCurvas(cols, linhas, { eixos: q.eixos });
    const L = area.largura, A = area.altura;

    if (q.eixos) {
      for (let y = 0; y < linhas - 1; y++) por(grade, 0, y, '│', 'tinta-3');
      for (let x = 1; x < cols; x++) por(grade, x, linhas - 1, '─', 'tinta-3');
      por(grade, 0, linhas - 1, '└', 'tinta-3');
    }
    if (L < 1 || A < 1) return;

    const S = 2 * A; // amostras na vertical
    const colunaDe = (x) => (L > 1 ? Math.round(x * (L - 1)) : 0);
    const nivelDe = (y) => Math.round(y * (S - 1));
    // célula (x, y da grade) e meia (0 embaixo, 1 em cima) de um nível
    const linhaDe = (v) => area.y0 + A - 1 - Math.floor(v / 2);

    const referencia = q.referencia ?? q.tipo !== 'loss';
    if (referencia) {
      for (let c = 0; c < L; c++) por(grade, area.x0 + c, linhaDe(nivelDe(L > 1 ? c / (L - 1) : 0)), '·', 'tinta-3');
    }

    const ps = pontosDe(q);
    if (!ps.length) return;
    const c0 = colunaDe(ps[0].x), c1 = colunaDe(ps[ps.length - 1].x);
    const v = new Map();
    for (let c = c0; c <= c1; c++) {
      const x = L > 1 ? c / (L - 1) : ps[0].x;
      v.set(c, nivelDe(interpolar(ps, limitar(x, ps[0].x, ps[ps.length - 1].x))));
    }

    const p = progresso(ctx);
    const ate = Math.min(c1, Math.floor(p * L + 1e-9) - 1); // última coluna já desenhada
    for (let c = c0; c <= ate; c++) {
      const vc = v.get(c);
      let lo = vc, hi = vc;
      for (const viz of [c - 1, c + 1]) {
        if (!v.has(viz)) continue;
        const e = vc + Math.trunc((v.get(viz) - vc) / 2);
        if (e < lo) lo = e;
        if (e > hi) hi = e;
      }
      // as amostras lo..hi, juntadas por célula
      for (let r = Math.floor(lo / 2); r <= Math.floor(hi / 2); r++) {
        const baixo = 2 * r >= lo && 2 * r <= hi, cima = 2 * r + 1 >= lo && 2 * r + 1 <= hi;
        por(grade, area.x0 + c, area.y0 + A - 1 - r, baixo && cima ? '█' : cima ? '▀' : '▄', q.tom);
      }
    }

    if (Number.isInteger(q.marcar)) {
      const m = ps.find((pt) => pt.i === q.marcar);
      if (m && colunaDe(m.x) <= ate) por(grade, area.x0 + colunaDe(m.x), linhaDe(v.get(colunaDe(m.x))), '█', 'achado');
    }
  },
});
