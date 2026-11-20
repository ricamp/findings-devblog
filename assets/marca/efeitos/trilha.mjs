// Efeito "trilha": porte do fundo contorno do devblog (assets/ascii-fx.js). Metaballs
// desenhadas como trilha de placa: o campo é o de sempre, o que muda é o vocabulário.
//
// Duas passadas, como lá. A primeira marca as células que caem na banda do contorno; a
// segunda escolhe o glifo pela vizinhança (máscara N=1 S=2 L=4 O=8). Olhando uma célula
// por vez só se sabe a inclinação, e inclinação só dá hachura; canto e derivação existem
// na relação com o vizinho. O nó (três tracos ou mais) vai em achado, o único acento.
//
// O site não sorteia nada aqui. A semente só desloca o relógio das bolhas (até 60 s),
// para hospedeiros com sementes diferentes não mostrarem o mesmo circuito no mesmo
// instante; o desenho e a estatística são os de lá.

import { registrar, por, hash2 } from '../motor/nucleo.mjs';
import { tempo } from './_comum.mjs';

const SAL_RELOGIO = 0x3a91c5e7;

// Seis bolhas: com três a banda dava traços soltos numa faixa de 159 colunas, e traço
// solto lê como hífen. A rede só vira circuito quando os contornos se cruzam.
const BOLHAS = [
  { x: 0.14, y: 0.50, r: 0.026, vx: 0.11, vy: 0.26 },
  { x: 0.31, y: 0.50, r: 0.034, vx: 0.17, vy: 0.14 },
  { x: 0.47, y: 0.50, r: 0.042, vx: 0.08, vy: 0.19 },
  { x: 0.62, y: 0.50, r: 0.030, vx: 0.13, vy: 0.29 },
  { x: 0.78, y: 0.50, r: 0.038, vx: 0.15, vy: 0.31 },
  { x: 0.92, y: 0.50, r: 0.024, vx: 0.09, vy: 0.23 },
];

// Índice = máscara dos vizinhos. As pontas soltas (1, 2, 4, 8) usam o traço inteiro em
// vez dos meios glifos ╵╷╶╴, que faltam em várias fontes mono e desalinham a grade.
const TRACO = [
  '·', '│', '│', '│', '─', '└', '┌', '├',
  '─', '┘', '┐', '┤', '─', '┴', '┬', '┼',
];
const NO = new Set([7, 11, 13, 14, 15]);

// n bolhas tiradas das seis, espalhadas pela largura (4 → a 1ª, 3ª, 4ª e 6ª).
function escolher(n) {
  const k = Math.max(1, Math.min(BOLHAS.length, Math.round(n)));
  if (k === 1) return [[BOLHAS[2], 2]];
  return Array.from({ length: k }, (_, j) => {
    const i = Math.round((j * (BOLHAS.length - 1)) / (k - 1));
    return [BOLHAS[i], i];
  });
}

registrar('trilha', {
  // bolhas: quantas das seis bolhas do site entram (6 no site).
  // banda: meia-largura da faixa do contorno em torno do nível 1 do campo (0,22 no site).
  padrao: { velocidade: 1, bolhas: 6, banda: 0.22, tom: 'tinta-2' },
  predefinicoes: {
    placa: {},
    esparsa: { bolhas: 4 },
    fina: { banda: 0.14 },
  },
  desenhar(grade, ctx) {
    const { bolhas, banda: meia, tom } = ctx.params;
    const { cols, linhas } = grade;
    const t = tempo(ctx) + hash2(0, 0, ctx.semente ^ SAL_RELOGIO) * 60;
    // o campo trabalha em coordenadas corrigidas de aspecto: a célula mono é alta, e sem
    // correção as bolhas viram faixas e o contorno lê como hachura
    const asp = cols / linhas / 6.5;
    const centros = escolher(bolhas).map(([b, i]) => ({
      cx: b.x + Math.sin(t * b.vx + i) * 0.10,
      cy: b.y + Math.sin(t * b.vy + i * 2) * 0.20,
      r: b.r,
    }));
    const campo = (px, py) => {
      let s = 0;
      for (const { cx, cy, r } of centros) {
        const dx = (px - cx) * asp, dy = py - cy;
        s += r / (dx * dx + dy * dy + 1e-4);
      }
      return s;
    };

    const banda = new Uint8Array(cols * linhas);
    for (let y = 0; y < linhas; y++) {
      for (let x = 0; x < cols; x++) {
        banda[y * cols + x] = Math.abs(campo(x / cols, (y + 0.5) / linhas) - 1) <= meia ? 1 : 0;
      }
    }
    const viz = (x, y) => x >= 0 && y >= 0 && x < cols && y < linhas && banda[y * cols + x] === 1;

    for (let y = 0; y < linhas; y++) {
      for (let x = 0; x < cols; x++) {
        if (!banda[y * cols + x]) continue;
        const m = (viz(x, y - 1) ? 1 : 0) | (viz(x, y + 1) ? 2 : 0)
          | (viz(x + 1, y) ? 4 : 0) | (viz(x - 1, y) ? 8 : 0);
        por(grade, x, y, TRACO[m], NO.has(m) ? 'achado' : tom);
      }
    }
  },
});
