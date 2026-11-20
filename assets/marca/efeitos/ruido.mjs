// Efeito "ruido": porte do campo de densidade do devblog (assets/ascii-fx.js, efeito
// densidade). Grade fixa: nada translada, só o peso do glifo muda; uma curva agressiva
// deixa quase tudo vazio e só os picos do ruído chegam aos glifos pesados.
//
// Lá o tempo está em segundos e entra como t*0.20 no x da primeira oitava. Aqui ele vira
// T = quadro * velocidade, e os outros termos de tempo mantêm a proporção de lá
// (t*0.04 → T*0.2; t*0.09 → T*0.45). As escalas espaciais também mantêm a proporção
// com 0.09 (x da primeira oitava), para `escala` mexer no grão inteiro de uma vez.

import { registrar, por, ruido } from '../motor/nucleo.mjs';

const BASE = 0.09;

registrar('ruido', {
  // piso: valor do ruído abaixo do qual a célula fica vazia (0.48 no devblog). É o que
  // controla a ocupação: subir o piso esvazia, descer enche.
  padrao: { escala: 0.09, velocidade: 0.02, rampa: ' .:-=+*#', piso: 0.48 },
  predefinicoes: {
    calmo: { velocidade: 0.008, piso: 0.55 },
    denso: { piso: 0.38 },
    granulado: { escala: 0.2 },
  },
  desenhar(grade, { quadro, semente, params, parado }) {
    const { escala, velocidade, rampa, piso } = params;
    const k = escala / BASE;
    const T = parado ? 0 : quadro * velocidade;
    const faixa = 1 - piso;
    for (let y = 0; y < grade.linhas; y++) {
      for (let x = 0; x < grade.cols; x++) {
        let n = ruido(x * BASE * k - T, y * 0.30 * k + T * 0.2, semente);
        n = n * 0.78 + ruido(x * 0.23 * k + T * 0.45, y * 0.55 * k, semente ^ 0x5bd1e995) * 0.22;
        const i = Math.floor(Math.pow(Math.max(0, n - piso) / faixa, 2.2) * rampa.length * 0.95);
        const c = rampa[Math.max(0, Math.min(rampa.length - 1, i))];
        if (c !== ' ') por(grade, x, y, c, 'tinta-2');
      }
    }
  },
});
