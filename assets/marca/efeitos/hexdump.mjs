// Efeito "hexdump": porte do fundo dump do devblog (assets/ascii-fx.js). Hexdump com
// cabeça de leitura: o único efeito que usa a grade mono para o que ela existe, colunas
// alinhadas de dado.
//
// Cada linha tem cabeça própria, que anda para a direita; atrás dela o byte perde o valor
// e vira `··`, depois some. O valor acompanha o pacote (indexado pela distância até a
// cabeça), não a coluna: o mesmo punhado de dígitos atravessa a faixa. Só o byte recém-
// lido vai em achado. Sem calha de endereço, como no site: coisa fixa num efeito cujo
// assunto é o movimento vira coluna de números parada.
//
// Lá a fase da linha é hash(y, 7) e o byte é hash(d + passe * 31, y * 13 + 5), já com
// argumentos inteiros; aqui são hash2 nos mesmos argumentos, com um sal por uso.

import { registrar, por, hash2 } from '../motor/nucleo.mjs';
import { tempo } from './_comum.mjs';

const HEX = '0123456789abcdef';
const COL = 3; // 'ff ': dois dígitos e o respiro entre colunas
const SAL_FASE = 0x4d2b7a19;
const SAL_BYTE = 0x1f83c6d5;

registrar('hexdump', {
  // ritmo: passes de cabeça por segundo, em unidades de ciclo (0,30 no site).
  // periodo: ciclo de cada linha; a sobra acima de 1 é a pausa com a linha apagada, que
  // impede o dump de virar bloco sólido de hex (2,1 no site; 2,8 deixava a faixa vazia).
  // corpo: bytes com valor legível atrás da cabeça (9); cauda: bytes de casca `··` (12).
  padrao: { velocidade: 1, ritmo: 0.30, periodo: 2.1, corpo: 9, cauda: 12, tom: 'tinta-2' },
  predefinicoes: {
    leitura: {},
    rapida: { ritmo: 0.6 },
    rala: { periodo: 2.8 },
  },
  desenhar(grade, ctx) {
    const { ritmo, periodo, corpo, cauda, tom } = ctx.params;
    const s = ctx.semente;
    const { linhas } = grade;
    const t = tempo(ctx);
    const bytes = Math.max(1, Math.floor(grade.cols / COL));

    for (let y = 0; y < linhas; y++) {
      // fase própria por linha: em uníssono as cabeças viram uma barra vertical descendo
      const ciclo = t * ritmo + hash2(y, 7, s ^ SAL_FASE) * 3.0;
      const passe = Math.floor(ciclo / periodo);
      const cab = (ciclo % periodo) * bytes;

      for (let b = 0; b < bytes; b++) {
        const d = cab - b; // idade do byte, em colunas
        if (d < 0 || d > corpo + cauda) continue;
        const x = b * COL;
        if (d > corpo) { // já esfriou: só a casca
          por(grade, x, y, '·', tom);
          por(grade, x + 1, y, '·', tom);
          continue;
        }
        const v = Math.floor(hash2(Math.floor(d) + passe * 31, y * 13 + 5, s ^ SAL_BYTE) * 256);
        const tomByte = d < 1 ? 'achado' : tom;
        por(grade, x, y, HEX[v >> 4], tomByte);
        por(grade, x + 1, y, HEX[v & 15], tomByte);
      }
    }
  },
});
