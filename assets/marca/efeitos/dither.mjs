// Efeito "dither": porte do fundo dither do devblog (assets/ascii-fx.js). Dither ordenado
// Bayer 4×4 sobre um gradiente lento de ruído.
//
// Mesmas contas do site, com t de tempo() e o ruído com semente do motor. No site o
// expoente alto (3,2) e o ganho abaixo de 1 (0,9) fazem só o quinto mais claro do ruído
// acender; com 1,7/1,5 a grade passava de metade e virava textura sólida atrás do texto.

import { registrar, por, ruido } from '../motor/nucleo.mjs';
import { tempo } from './_comum.mjs';

const BAYER = [
  [0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5],
];

registrar('dither', {
  // escala: frequência do ruído no x (0,055 no site); o y mantém a proporção de lá
  // (0,20), para `escala` mexer no grão inteiro. Metade da escala = grão do dobro.
  // expoente e ganho: a curva que decide quanto do ruído acende.
  // forte: folga acima do limiar de Bayer a partir da qual o ponto vira '▪'.
  padrao: { velocidade: 1, escala: 0.055, expoente: 3.2, ganho: 0.9, forte: 0.5, tom: 'tinta-2' },
  predefinicoes: {
    brisa: {},
    denso: { expoente: 2.2, ganho: 1 },
    grosso: { escala: 0.0275 },
  },
  desenhar(grade, ctx) {
    const { escala, expoente, ganho, forte, tom } = ctx.params;
    const s = ctx.semente;
    const t = tempo(ctx);
    const ky = 0.20 / 0.055;
    for (let y = 0; y < grade.linhas; y++) {
      for (let x = 0; x < grade.cols; x++) {
        const v = Math.pow(ruido(x * escala + t * 0.11, y * escala * ky - t * 0.03, s), expoente) * ganho;
        const lim = (BAYER[y & 3][x & 3] + 0.5) / 16;
        if (v > lim) por(grade, x, y, v > lim + forte ? '▪' : '·', tom);
      }
    }
  },
});
