// Efeito "reconstrucao": o conteúdo aparece como a ressonância adquire a imagem. Começa
// borrado e com um fantasma ao lado, fecha devagar e termina nítido.
//
// Conteúdo: `texto` (a máscara da letra própria, mascaraDeTexto) ou `linhas` (vetor de
// strings, arte pronta, centrada e cortada no que não couber). A máscara M vale 1 nos
// pontos do desenho final: cada ponto da letra vira █; na arte, o próprio caractere.
//
// Progresso p de 0 a 1 em `duracao` segundos. A imagem do quadro é
//   I = B + w·B(x − eco),  B = média em caixa de M, de raio r = raioMax·(1 − p)²
// (vertical; na horizontal o raio é `razao` vezes maior, porque a coluna é meia linha), e
// w = pesoEco·(1 − p)^quedaEco o peso do eco, uma cópia deslocada `eco` colunas. O raio é
// fracionário: a borda da caixa entra com o peso da fração, para o borrão fechar liso.
//
// Desenho, célula a célula: enquanto I está longe do valor final (M), a célula leva a
// densidade ` ·:-=+*#` de I, em `tom` (ou `tomEco`, onde o eco pesa mais que o borrão);
// quando a célula chega perto do final (|B − M| mais o eco que sobra, abaixo de uma
// tolerância que varia por célula com hash2, entre `tolerancia` e o dobro dela), a célula
// passa ao desenho final: o glifo de M em tinta, ou vazio. Assim a troca da densidade
// pelo bloco não acontece de uma vez. No fim (p = 1), I = M e só fica o conteúdo.
//
// Uma linha de varredura (─ em achado) desce uma vez, de p = 0 a p = varredura, sobre a
// largura do conteúdo com folga; depois some. `parado` mostra o estado final; `laco`
// recomeça depois de duracao + pausa.

import { registrar, por, hash2 } from '../motor/nucleo.mjs';
import { tempo, limitar, mascaraDeTexto } from './_comum.mjs';

const DENSIDADE = ' ·:-=+*#';
const SAL_TROCA = 0x2545f491;

// Máscara e desenho final do conteúdo: { M (1/0 por célula), final (glifo por célula ou
// null), x0, x1 } com x0..x1 a faixa de colunas ocupada; sem conteúdo, null.
export function conteudoDaReconstrucao(cols, linhas, params) {
  const n = cols * linhas;
  const M = new Uint8Array(n);
  const final = new Array(n).fill(null);
  let x0 = Infinity, x1 = -Infinity;
  const marcar = (x, y, c) => {
    const i = y * cols + x;
    M[i] = 1; final[i] = c;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
  };
  if (Array.isArray(params.linhas)) {
    const arte = params.linhas.map((l) => [...String(l ?? '')]);
    const largura = arte.reduce((m, l) => Math.max(m, l.length), 0);
    const ax = Math.floor((cols - largura) / 2), ay = Math.floor((linhas - arte.length) / 2);
    arte.forEach((l, j) => l.forEach((c, k) => {
      const x = ax + k, y = ay + j;
      if (c !== ' ' && x >= 0 && y >= 0 && x < cols && y < linhas) marcar(x, y, c);
    }));
  } else {
    const m = mascaraDeTexto(params.texto, cols, linhas, { escalaX: params.escalaX, entreLetras: params.entreLetras });
    for (let y = m.y0; y < m.y0 + m.altura; y++)
      for (let x = m.x0; x < m.x0 + m.largura; x++)
        if (m.tem(x, y)) marcar(x, y, '█');
  }
  return x1 < x0 ? null : { M, final, x0, x1 };
}

// Média em caixa de raio fracionário r ao longo de um eixo: peso 1 até floor(r), a fração
// em floor(r) + 1. Fora da grade conta como 0.
function borrar(ent, cols, linhas, r, horizontal) {
  const sai = new Float32Array(ent.length);
  const ri = Math.floor(r), fr = r - ri;
  const norma = 2 * ri + 1 + 2 * fr;
  const comp = horizontal ? cols : linhas;
  for (let y = 0; y < linhas; y++) {
    for (let x = 0; x < cols; x++) {
      const at = horizontal ? x : y;
      const em = (j) => (j < 0 || j >= comp ? 0 : horizontal ? ent[y * cols + j] : ent[j * cols + x]);
      let s = 0;
      for (let d = -ri; d <= ri; d++) s += em(at + d);
      if (fr > 0) s += fr * (em(at - ri - 1) + em(at + ri + 1));
      sai[y * cols + x] = s / norma;
    }
  }
  return sai;
}

// Progresso de 0 a 1 do quadro. `progresso` numérico fixa o estado (parado também): é a
// textura parada que a capa do Ernst usa como fundo.
export function progressoDaReconstrucao(ctx) {
  if (Number.isFinite(ctx.params.progresso)) return limitar(ctx.params.progresso, 0, 1);
  if (ctx.parado) return 1;
  const { duracao, laco, pausa } = ctx.params;
  let t = tempo(ctx);
  if (laco) t %= Math.max(1e-6, duracao + pausa);
  return duracao > 0 ? limitar(t / duracao, 0, 1) : 1;
}

registrar('reconstrucao', {
  // texto, escalaX, entreLetras: o conteúdo na letra própria; linhas: vetor de strings
  //   (arte pronta), que, se dado, toma o lugar do texto.
  // duracao (s), laco, pausa (s): o contrato dos efeitos com começo e fim. progresso: null
  //   (o tempo manda) ou um número de 0 a 1 que congela o estado.
  // raioMax: raio vertical do borrão no começo (linhas); razao: horizontal / vertical.
  // eco: deslocamento do fantasma (colunas); pesoEco, quedaEco: w = pesoEco·(1 − p)^quedaEco.
  // tolerancia: quão perto do final a célula precisa chegar para trocar (varia até o dobro).
  // tom: a densidade; tomEco: as células em que o eco pesa mais que a imagem.
  // varredura: p em que a linha de varredura chega ao pé; folga: colunas além do conteúdo.
  padrao: {
    velocidade: 1, texto: 'ABREU', linhas: null, escalaX: 2, entreLetras: 1,
    duracao: 4, laco: false, pausa: 1.5, progresso: null,
    raioMax: 1.2, razao: 1.5, eco: 8, pesoEco: 0.5, quedaEco: 1, tolerancia: 0.1,
    varredura: 0.75, folga: 4, tom: 'tinta-2', tomEco: 'tinta-3',
  },
  predefinicoes: {
    aquisicao: {},
    rapida: { duracao: 1.6 },
    fantasma: { eco: 10, pesoEco: 0.85, quedaEco: 0.6 },
  },
  desenhar(grade, ctx) {
    const { params: q } = ctx;
    const s = ctx.semente ?? 0;
    const { cols, linhas } = grade;
    const c = conteudoDaReconstrucao(cols, linhas, q);
    if (!c) return;
    const { M, final } = c;
    const p = progressoDaReconstrucao(ctx);

    const r = q.raioMax * (1 - p) ** 2;
    const mf = Float32Array.from(M);
    const B = r > 0 ? borrar(borrar(mf, cols, linhas, r * q.razao, true), cols, linhas, r, false) : mf;
    const w = p < 1 ? q.pesoEco * (1 - p) ** q.quedaEco : 0;
    const eco = Math.round(q.eco);

    for (let y = 0; y < linhas; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        const xe = x - eco;
        const e = w > 0 && xe >= 0 && xe < cols ? w * B[y * cols + xe] : 0;
        const v = Math.min(1, B[i] + e);
        // distância ao final: o borrão que falta mais o eco que sobra
        const tol = q.tolerancia * (1 + hash2(x, y, s ^ SAL_TROCA));
        if (Math.abs(B[i] - M[i]) + e < tol) {
          if (M[i]) por(grade, x, y, final[i], 'tinta');
          continue;
        }
        const k = Math.min(DENSIDADE.length - 1, Math.ceil(v * (DENSIDADE.length - 1)));
        // onde o eco pesa mais que a imagem, o fantasma vai mais apagado
        if (k > 0) por(grade, x, y, DENSIDADE[k], e > B[i] ? q.tomEco : q.tom);
      }
    }

    // linha de varredura
    if (p < q.varredura && linhas > 0) {
      const y = Math.min(linhas - 1, Math.floor((p / q.varredura) * linhas));
      const a = Math.max(0, c.x0 - q.folga), b = Math.min(cols - 1, c.x1 + q.folga);
      for (let x = a; x <= b; x++) por(grade, x, y, '─', 'achado');
    }
  },
});
