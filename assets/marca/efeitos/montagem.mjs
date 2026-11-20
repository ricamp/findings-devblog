// Efeito "montagem": bytes soltos se juntam num texto (o logo `findings/devblog`, o ícone
// `f/`) e depois se desfazem nele, no mesmo sentido. Feito para o vídeo de marca
// (video/cena.mjs), mas é um efeito como os outros: função pura do quadro.
//
// O texto é `pecas`: um vetor de linhas, cada linha um vetor de trechos [texto, tom]. O
// bloco fica centrado na grade, uma célula por caractere (mais largo que a grade começa na
// coluna 0 e corta na borda). O caractere `acento` (a barra do logo) fica fora da onda: a
// célula dele fica vazia enquanto as letras chegam, e ele é o último a encaixar, em achado.
//
// Tempo em quadros lógicos q (12 por segundo; o passo de terminal é de propósito: nada se
// move em fração de célula). Fases (`fase`):
//
//   entrada  q < 0: vazio. Do quadro 0 a `nuvem` − 1 nasce a nuvem de bytes hex: uma faixa
//            em volta do texto, mais densa na linha dele (`densidade[d]`, d = linhas de
//            distância) e mais rala para os lados (até `alcance` colunas além do texto).
//            Entre `inicio` e `fim` passa a onda, da esquerda para a direita: a letra de
//            posição p (0 na primeira coluna, 1 na última) encaixa no quadro
//            F = inicio + p·(fim − inicio). Nos `voo` quadros antes de F um byte vem de
//            cima ou de baixo, pela esquerda, até a célula dela; em F a letra aparece em
//            chapa (o encaixe, um quadro); depois, no tom dela. A nuvem da coluna é
//            engolida junto: os bytes descem (ou sobem) uma linha por quadro em direção ao
//            texto e somem. Por fim o acento: três bytes chegam à vizinhança dele de três
//            lados (de baixo pela esquerda, de cima pela direita e de cima), em quadros
//            diferentes, `passoAcento` quadros um do outro, e pousam sem entrar na célula
//            (um algarismo ali cobriria o desenho); a célula mostra . (o pé da
//            barra) e depois / em tinta-3 (a barra apagada) e, no quadro `acendeAcento`
//            (quando o terceiro encaixa), o acento acende em chapa achado por um quadro, e
//            fica em achado. Do quadro `acendeAcento` + 2 em diante a grade é o texto parado.
//   saida    as letras saem na mesma onda da esquerda para a direita, entre `saidaInicio`
//            e `saidaFim`: cada uma vira um byte no lugar e solta dois bytes que voam para
//            a direita, afastando-se da linha, por `vooSaida` quadros, e somem. O acento é
//            o último: fica em achado sozinho e, no quadro `saidaAcento`, perde a cor
//            (tinta-2), no seguinte vira . e some. No fim, a grade vazia.
//   laco     o texto parado, e a cada `periodo` quadros, a partir de `pulso`, o último
//            caractere (a barra do f/) pulsa de tom e um par de bytes pisca à direita
//            dele. q é tomado módulo `periodo`: o quadro N é o quadro 0, exatamente.
//
// `parado` mostra o texto parado (o fim da entrada) em qualquer fase.

import { registrar, por, hash2 } from '../motor/nucleo.mjs';

export const HEX = '0123456789abcdef';

const SAL_NUVEM = 0x3d1f6b27;
const SAL_VIDA = 0x58a2c4e1;
const SAL_DIGITO = 0x1e9b73d5;
const SAL_VOO = 0x6c47a90b;

// O logo: findings em tinta, a barra em achado (a terracota da marca), devblog em tinta-2.
export const LOGO = [[['findings', 'tinta'], ['/', 'achado'], ['devblog', 'tinta-2']]];
export const ICONE = [[['f', 'tinta'], ['/', 'tinta-3']]];

// Onde cada caractere fica: { celulas: [{ x, y, c, tom, p, acento }], x0, x1, y0, y1 } (só
// as células dentro da grade e que não são espaço; x0..x1, y0..y1: a caixa do texto).
// Com `escala` > 1 cada caractere ocupa um bloco de escala × escala células (o caractere
// fica na célula do canto superior esquerdo; quem pinta o desenha em tamanho escala×), e
// os blocos caem em múltiplos de escala: o texto fica onde ficaria numa grade de células
// escala vezes maiores. Os bytes continuam do tamanho de uma célula.
export function leiaute(pecas, cols, linhas, acento = '', escala = 1) {
  const e = escala;
  const C = Math.floor(cols / e), Lg = Math.floor(linhas / e);
  const linhasDoTexto = (pecas ?? []).map((l) => l.flatMap(([t, tom]) => [...String(t)].map((c) => [c, tom])));
  const H = linhasDoTexto.length;
  const y0 = H >= Lg ? 0 : Math.floor((Lg - H) / 2);
  const celulas = [];
  let x0 = Infinity, x1 = -Infinity;
  linhasDoTexto.forEach((l, j) => {
    const y = y0 + j;
    const xi = l.length >= C ? 0 : Math.floor((C - l.length) / 2);
    x0 = Math.min(x0, xi);
    x1 = Math.max(x1, xi + l.length - 1);
    if (y >= Lg) return;
    l.forEach(([c, tom], k) => {
      const x = xi + k;
      if (c === ' ' || x >= C) return;
      celulas.push({ x: x * e, y: y * e, c, tom, acento: c === acento });
    });
  });
  // posição na onda: 0 na primeira coluna das letras, 1 na última (o acento fica fora)
  const letras = celulas.filter((c) => !c.acento);
  const a = Math.min(...letras.map((c) => c.x)), b = Math.max(...letras.map((c) => c.x));
  for (const c of celulas) c.p = c.acento ? 1 : b > a ? (c.x - a) / (b - a) : 0;
  return {
    celulas, a, b, escala: e,
    x0: x0 * e, x1: Math.min((x1 + 1) * e - 1, cols - 1),
    y0: y0 * e, y1: Math.min((y0 + H) * e - 1, linhas - 1),
  };
}

const digito = (x, y, passo, s) => HEX[Math.floor(hash2(x * 31 + y, passo, s ^ SAL_DIGITO) * 16)];
const sinal = (v) => (v < 0 ? -1 : 1);

// Posição inteira de um voo de (xa, ya) a (xb, yb) com fração k em [0, 1].
const noVoo = (xa, ya, xb, yb, k) => [Math.round(xa + (xb - xa) * k), Math.round(ya + (yb - ya) * k)];

// A nuvem: as células em volta do texto, cada uma com { x, y, d, nasce, h }.
function nuvem(L, cols, linhas, q, s) {
  const dens = q.densidade;
  const R = dens.length - 1;
  const out = [];
  for (let y = Math.max(0, L.y0 - R); y <= Math.min(linhas - 1, L.y1 + R); y++) {
    const d = y < L.y0 ? L.y0 - y : y > L.y1 ? y - L.y1 : 0;
    for (let x = Math.max(0, L.x0 - q.alcance); x <= Math.min(cols - 1, L.x1 + q.alcance); x++) {
      const fora = x < L.x0 ? L.x0 - x : x > L.x1 ? x - L.x1 : 0;
      const p = dens[d] * (1 - fora / (q.alcance + 1));
      if (hash2(x, y, s ^ SAL_NUVEM) >= p) continue;
      out.push({ x, y, d, h: hash2(x, y, s ^ SAL_VIDA) });
    }
  }
  return out;
}

// Quadro em que a onda passa pela coluna x (a mesma conta das letras).
function quadroDaColuna(L, x, q) {
  const { a, b } = L;
  const p = b > a ? Math.min(1, Math.max(0, (x - a) / (b - a))) : 0;
  return q.inicio + p * (q.fim - q.inicio);
}

function parado(grade, L) {
  for (const e of L.celulas) por(grade, e.x, e.y, e.c, e.acento ? 'achado' : e.tom);
}

function entrada(grade, L, n, q, s) {
  const { cols, linhas } = grade;
  if (n < 0) return;
  if (n > q.acendeAcento + 1) { parado(grade, L); return; }
  const yLinha = (y) => (y < L.y0 ? L.y0 : y > L.y1 ? L.y1 : y);

  // 1. a nuvem: nasce nos primeiros quadros; é engolida quando a onda passa pela coluna,
  //    andando uma linha por quadro em direção ao texto nos dois quadros antes de sumir
  for (const c of nuvem(L, cols, linhas, q, s)) {
    const nasce = Math.floor(c.h * q.nuvem);
    const some = Math.round(quadroDaColuna(L, c.x, q) + (Math.floor(c.h * 7) % 4) - 1 - (c.d >= 2 ? 1 : 0));
    if (n < nasce || n >= some) continue;
    const passos = Math.max(0, n - (some - 2)); // 0, 1 ou 2
    const yl = yLinha(c.y);
    const y = c.y - sinal(c.y - yl) * Math.min(Math.abs(c.y - yl), passos);
    const tom = c.d === 0 || (c.d === 1 && c.h < 0.3) ? 'tinta-2' : 'tinta-3';
    por(grade, c.x, y, digito(c.x, c.y, Math.floor((n + Math.floor(c.h * 5)) / 2), s), tom);
  }

  // 2. os bytes em voo até as letras, e as letras que já encaixaram
  for (const e of L.celulas) {
    if (e.acento) continue;
    const F = Math.round(q.inicio + e.p * (q.fim - q.inicio));
    const k0 = F - q.voo;
    if (n >= k0 && n < F) {
      const h = hash2(e.x, e.y, s ^ SAL_VOO);
      const dy = (h < 0.5 ? -1 : 1) * (1 + Math.floor(hash2(e.x, 3, s ^ SAL_VOO) * 2));
      const ya = Math.min(linhas - 1, Math.max(0, e.y + dy));
      const xa = e.x - 2 - Math.floor(hash2(e.x, 5, s ^ SAL_VOO) * 3);
      const u = (n - k0 + 1) / q.voo;            // chega à célula em F − 1
      const k = 1 - (1 - u) * (1 - u);            // sai rápido e pousa devagar
      const [x, y] = noVoo(xa, ya, e.x, e.y, k);
      por(grade, x, y, digito(e.x, e.y, n, s), 'tinta-2');
    }
  }
  for (const e of L.celulas) {
    if (e.acento) continue;
    const F = Math.round(q.inicio + e.p * (q.fim - q.inicio));
    if (n === F) por(grade, e.x, e.y, e.c, 'chapa');
    else if (n > F) por(grade, e.x, e.y, e.c, e.tom);
  }

  // 3. o acento: três bytes chegam à célula dele de três lados e em quadros diferentes,
  //    `passoAcento` quadros um do outro, cada um em `vooAcento` quadros; o terceiro pousa
  //    em `acendeAcento`. A barra se forma na célula: . (tinta-2), depois / apagada
  //    (tinta-3) e, quando o terceiro encaixa, a barra em chapa achado (um quadro só);
  //    depois em achado. Os voos vêm na diagonal ou na vertical: não cruzam a linha do
  //    texto, onde a barra tem letras dos dois lados.
  const A = q.acendeAcento;
  for (const e of L.celulas) {
    if (!e.acento) continue;
    let pousados = 0;
    const voos = [];
    ORIGENS_DO_ACENTO.forEach(([dx, dy], j) => {
      const F = A - (ORIGENS_DO_ACENTO.length - 1 - j) * q.passoAcento;
      const k0 = F - q.vooAcento;
      if (n >= F) { pousados++; return; }
      if (n < k0) return;
      // passo constante (sem a freada das letras). O byte para na célula vizinha em F − 1 e
      // não entra na da barra: entrando, um algarismo cobria o . ou a barra apagada e a
      // linha se lia findings1devblog por um quadro
      const k = (n - k0) / q.vooAcento;            // vizinho da célula em F − 1
      const xa = Math.min(cols - 1, Math.max(0, e.x + dx));
      const ya = Math.min(linhas - 1, Math.max(0, e.y + dy));
      voos.push([...noVoo(xa, ya, e.x, e.y, k), digito(e.x + j, e.y, n, s)]);
    });
    if (pousados === ORIGENS_DO_ACENTO.length) por(grade, e.x, e.y, e.c, n === A ? 'chapa-achado' : 'achado');
    else if (pousados > 0) por(grade, e.x, e.y, ...PASSOS_DO_ACENTO[pousados - 1]);
    for (const [x, y, c] of voos) por(grade, x, y, c, 'tinta-2');
  }
}

// De onde vem cada byte do acento (em células, a partir dele): de baixo pela esquerda (o
// pé da barra), de cima pela direita (o topo dela) e de cima. O que a célula mostra com 1
// e 2 bytes pousados.
const ORIGENS_DO_ACENTO = [[-3, 3], [3, -3], [0, -3]];
const PASSOS_DO_ACENTO = [['.', 'tinta-2'], ['/', 'tinta-3']];

function saida(grade, L, n, q, s) {
  const { linhas } = grade;
  if (n < 0) { parado(grade, L); return; }
  for (const e of L.celulas) {
    if (e.acento) {
      const SA = q.saidaAcento;
      if (n < SA) por(grade, e.x, e.y, e.c, 'achado');
      else if (n === SA) por(grade, e.x, e.y, e.c, 'tinta-2');
      else if (n === SA + 1) por(grade, e.x, e.y, '.', 'tinta-3');
      continue;
    }
    const S = Math.round(q.saidaInicio + e.p * (q.saidaFim - q.saidaInicio));
    if (n < S) { por(grade, e.x, e.y, e.c, e.tom); continue; }
    if (n === S) { por(grade, e.x, e.y, digito(e.x, e.y, n, s), 'tinta'); continue; }
    const j = n - S; // 1..vooSaida
    if (j > q.vooSaida) continue;
    const u = j / q.vooSaida;
    const k = u * (0.4 + 0.6 * u); // arranca devagar e acelera para fora
    for (const lado of [-1, 1]) {
      const h = hash2(e.x, lado, s ^ SAL_VOO);
      const xb = e.x + 2 + Math.floor(h * 4);
      const yb = Math.min(linhas - 1, Math.max(0, e.y + lado * (1 + Math.floor(hash2(e.x, lado + 7, s ^ SAL_VOO) * 2))));
      const [x, y] = noVoo(e.x, e.y, xb, yb, k);
      por(grade, x, y, digito(e.x + lado, e.y, n, s), u <= 0.5 ? 'tinta-2' : 'tinta-3');
    }
  }
}

function laco(grade, L, n, q, s) {
  const P = q.periodo;
  const t = ((n % P) + P) % P;
  const j = t - q.pulso;
  const ultimo = L.celulas.reduce((m, e) => (e.x > m.x ? e : m), L.celulas[0]);
  // a barra: tinta-3 → tinta-2 → tinta (dois quadros) → tinta-2 → tinta-3
  const tons = ['tinta-2', 'tinta', 'tinta', 'tinta-2'];
  for (const e of L.celulas) {
    const tom = e === ultimo && j >= 0 && j < tons.length ? tons[j] : e.acento ? 'achado' : e.tom;
    por(grade, e.x, e.y, e.c, tom);
  }
  // um par de bytes pisca à direita, como um cursor que escreve e apaga
  const bytes = [[1], [1, 2], [1, 2], [1, 2], [2]];
  const b = j - 1;
  if (b >= 0 && b < bytes.length) {
    // (com escala, logo depois do bloco do caractere, na última linha dele)
    const xb = ultimo.x + L.escala - 1, yb = ultimo.y + L.escala - 1;
    for (const dx of bytes[b]) por(grade, xb + dx, yb, digito(xb + dx, yb, t, s), 'tinta-3');
  }
}

const FASES = { entrada, saida, laco };

registrar('montagem', {
  // pecas: [[ [texto, tom], ... ], ...] (uma linha por item); acento: o caractere que
  // encaixa por último e sai por último, em achado (no logo, a barra). escala: células por caractere em cada direção (1 =
  // uma célula; 2 = o texto em bloco de 2 × 2, com os bytes do tamanho de uma célula). Tempos em quadros lógicos (os do vídeo estão em
  // video/tempos.mjs, que passa os seus).
  padrao: {
    pecas: LOGO, acento: '/', fase: 'entrada',
    nuvem: 4, densidade: [0.5, 0.32, 0.14, 0.05], alcance: 3,
    inicio: 7, fim: 25, voo: 5, acendeAcento: 30, passoAcento: 3, vooAcento: 3,
    saidaInicio: 0, saidaFim: 8, vooSaida: 4, saidaAcento: 10,
    periodo: 48, pulso: 26, escala: 1,
  },
  predefinicoes: {
    entrada: { fase: 'entrada' },
    saida: { fase: 'saida' },
    laco: { fase: 'laco' },
  },
  desenhar(grade, ctx) {
    const q = ctx.params;
    const fase = FASES[q.fase];
    if (!fase) throw new Error(`fase desconhecida em montagem: ${q.fase}`);
    if (!Number.isInteger(q.escala) || q.escala < 1) throw new Error(`escala tem de ser inteiro ≥ 1 em montagem: ${q.escala}`);
    const L = leiaute(q.pecas, grade.cols, grade.linhas, q.acento, q.escala);
    if (!L.celulas.length || L.celulas.every((e) => e.acento)) {
      if (L.celulas.length) parado(grade, L);
      return;
    }
    if (ctx.parado) { parado(grade, L); return; }
    fase(grade, L, Math.floor(ctx.quadro), q, ctx.semente ?? 0);
    // com escala, o resto do bloco de cada caractere à mostra fica vazio (o desenho grande o
    // cobre); o bloco de um caractere que ainda não chegou ou já virou byte fica livre
    if (L.escala > 1) {
      for (const c of L.celulas) {
        if (grade.car[c.y * grade.cols + c.x] !== c.c) continue;
        for (let dy = 0; dy < L.escala; dy++)
          for (let dx = 0; dx < L.escala; dx++)
            if (dx || dy) por(grade, c.x + dx, c.y + dy, ' ', 'tinta');
      }
    }
  },
});
