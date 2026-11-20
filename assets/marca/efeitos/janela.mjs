// Efeito "janela": porte do fundo janela do devblog (assets/ascii-fx.js). Janela de
// intensidade deslizando sobre um campo de tecido. O campo é FIXO (só depende da semente);
// só a janela se move. É isso que faz o efeito ler como um controle sendo girado e não
// como ruído: as mesmas estruturas reaparecem quando a janela volta.
//
// Reação (só quando o pintor manda entrada, com data-reativo): a rolagem da página gira a
// fase do nível; o ponteiro dentro da grade puxa o nível para a sua posição horizontal
// (esquerda = janela baixa, direita = janela alta). puxao 0 e rolagem 0 desligam.

import { registrar, por, ruido } from '../motor/nucleo.mjs';
import { tempo, misto, ponteiroNaGrade } from './_comum.mjs';

const RAMPA = ' .:-=+*#';
const SAL_FINO = 0x6e5a3b21; // a segunda oitava do tecido, para não repetir a rede da primeira

registrar('janela', {
  // largura: largura média da janela, em unidades do campo (0,19 no site); oscilacao:
  // quanto ela respira em volta disso (0,08). Piso alto de propósito: em sete linhas uma
  // janela estreita deixa cacos espalhados; a 0,34 dois terços da faixa acendiam.
  // rolagem: voltas da fase do nível por página rolada; puxao: peso do ponteiro no nível.
  // origem: linhas que o campo desce (0); outra fatia do mesmo tecido, para quem compõe
  // escolher onde caem as faixas numa área pequena.
  padrao: {
    velocidade: 1, largura: 0.19, oscilacao: 0.08, rolagem: 1, puxao: 0.6, tom: 'tinta-2', origem: 0,
  },
  predefinicoes: {
    tecido: {},
    estreita: { largura: 0.12, oscilacao: 0.05 },
    larga: { largura: 0.28 },
  },
  desenhar(grade, ctx) {
    const { largura: lMedia, oscilacao, rolagem, puxao, tom, origem } = ctx.params;
    const s = ctx.semente;
    const { cols, linhas } = grade;
    const t = tempo(ctx);

    let nivel = 0.50 + Math.sin(t * 0.23 + 2 * Math.PI * (ctx.entrada.rolagem ?? 0) * rolagem) * 0.26;
    const p = ponteiroNaGrade(ctx.entrada, grade);
    if (p) nivel = misto(nivel, 0.24 + (0.52 * p.x) / Math.max(1, cols - 1), puxao);
    const largura = lMedia + Math.sin(t * 0.17 + 1.3) * oscilacao;
    const baixo = nivel - largura / 2, alto = nivel + largura / 2;

    for (let yg = 0; yg < linhas; yg++) {
      const y = yg + origem;
      for (let x = 0; x < cols; x++) {
        // frequência vertical alta de propósito: em sete linhas um campo lento no y dá a
        // mesma linha sete vezes, e lê como listras em vez de tecido
        const v = ruido(x * 0.075, y * 0.50, s) * 0.68 + ruido(x * 0.19, y * 1.05, s ^ SAL_FINO) * 0.22
          + Math.sin(y * 0.90 + x * 0.02) * 0.05 + 0.05;
        const w = (v - baixo) / (alto - baixo);
        // os dois lados saem: abaixo da janela satura em vazio, acima também
        if (!(w > 0 && w < 1)) continue;
        // sem piso no índice: com piso 1 a borda inteira saía como '.', e a borda é a
        // maior área do efeito
        const c = RAMPA[Math.min(RAMPA.length - 1, Math.floor(w * RAMPA.length))];
        if (c !== ' ') por(grade, x, yg, c, tom);
      }
    }
  },
});
