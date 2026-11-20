// Efeito "tv": porte do fundo glitch do devblog (assets/ascii-fx.js). TV velha: linha de
// varredura em vai e volta, barra de rolagem solta subindo devagar, chuvisco e um rasgo
// raro que desloca uma linha inteira.
//
// Mesmas contas do site, com t de tempo(). Onde o site sorteia com hash(x * 0.5, quadro)
// e afins, aqui vai hash2 com coordenadas inteiras e um sal por uso (contrato, item 2);
// os limiares de probabilidade são os de lá. Lá a barra usa y + quadro * 0.01, mas o hash
// de seno muda inteiro a cada 0,01: na prática é um sorteio novo por quadro, e é isso
// que o porte faz (a linha entra na semente).

import { registrar, por, hash2 } from '../motor/nucleo.mjs';
import { tempo } from './_comum.mjs';

const SAL_VARREDURA = 0x2f6b1c3d;
const SAL_RASTRO = 0x51a7e9b3;
const SAL_BARRA = 0x6c0de4f1;
const SAL_FUNDO = 0x0b9e5a27;
const SAL_RASGO = 0x7d3c88a5;

registrar('tv', {
  // ciclo: segundos de uma ida e volta da varredura (7 no site).
  // barra: voltas da barra de rolagem por segundo (0,33 no site, subindo).
  // chuvisco: multiplica a chance dos pontos soltos (o rastro da varredura e o fundo).
  // rasgo: chance de um quadro rasgar (0,055 no site); deslocamento: largura máxima do
  // rasgo em colunas, para cada lado (±6 no site).
  padrao: {
    velocidade: 1, ciclo: 7, barra: 0.33, chuvisco: 1, rasgo: 0.055, deslocamento: 12, tom: 'tinta-2',
  },
  predefinicoes: {
    sinal: {},
    calmo: { rasgo: 0, chuvisco: 0.5 },
    ruim: { rasgo: 0.165 },
  },
  desenhar(grade, ctx) {
    const { ciclo, barra: voltas, chuvisco, rasgo, deslocamento, tom } = ctx.params;
    const s = ctx.semente;
    const { cols, linhas } = grade;
    const t = tempo(ctx);
    const quadro = Math.floor(t * 12); // trava o sorteio por quadro; sem isso cintila

    // a varredura sobe e desce em vez de reiniciar do topo
    const f = (t % ciclo) / ciclo;
    const tri = f < 0.5 ? f * 2 : 2 - f * 2;
    const e = tri < 0.5 ? 2 * tri * tri : 1 - Math.pow(-2 * tri + 2, 2) / 2;
    const pos = e * (linhas + 1) - 0.5;

    // barra de rolagem: mais lenta e no sentido contrário, como vertical hold solto
    const barra = ((((t * -voltas) % 1) + 1) % 1) * (linhas + 4) - 2;

    const linhasTxt = [];
    for (let y = 0; y < linhas; y++) {
      const linha = new Array(cols);
      const dScan = Math.abs(pos - y);
      const dBarra = Math.abs(barra - y);
      for (let x = 0; x < cols; x++) {
        let c = ' ';
        if (dScan < 0.6) {
          const r = hash2(x, quadro, s ^ SAL_VARREDURA);
          c = r < 0.38 ? '─' : r < 0.60 ? '┄' : r < 0.70 ? '╌' : ' ';
        } else if (dScan < 2.4) {
          if (hash2(x, y * 3 + quadro, s ^ SAL_RASTRO) < 0.09 * chuvisco) c = '·';
        } else if (dBarra < 1.7) {
          const b = hash2(x, quadro, ((s ^ SAL_BARRA) + y) | 0);
          c = b < 0.17 ? (b < 0.07 ? '·' : '˙') : ' ';
        } else if (hash2(x, y * 7 + quadro, s ^ SAL_FUNDO) < 0.007 * chuvisco) {
          c = '·';
        }
        linha[x] = c;
      }
      linhasTxt.push(linha);
    }

    // rasgo raro e curto. Mais que isso é o cabeçalho inteiro tremendo.
    if (linhas > 0 && hash2(quadro, 41, s ^ SAL_RASGO) < rasgo) {
      const alvo = Math.floor(hash2(quadro, 5, s ^ SAL_RASGO) * linhas);
      const desl = Math.round((hash2(quadro, 7, s ^ SAL_RASGO) - 0.5) * deslocamento);
      if (desl !== 0) {
        const l = linhasTxt[alvo];
        linhasTxt[alvo] = Array.from({ length: cols }, (_, x) => l[x - desl] ?? ' ');
      }
    }

    for (let y = 0; y < linhas; y++) {
      for (let x = 0; x < cols; x++) {
        const c = linhasTxt[y][x];
        if (c !== ' ') por(grade, x, y, c, tom);
      }
    }
  },
});
