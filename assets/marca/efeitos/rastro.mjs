// Efeito "rastro": porte do fundo rastro do devblog (assets/ascii-fx.js). O ponteiro deixa
// um rastro que some sozinho, sobre uma textura de base que existe para quem não tem
// ponteiro (toque, teclado, leitor de tela): sem trilha, o efeito é um fundo comum.
//
// Lá o rastro é memória: um buffer por célula que a cada quadro é multiplicado por 0,90 e
// recebe 0,55·exp(−d²/7) enquanto o ponteiro está dentro. Aqui não há estado: o pintor
// entrega em entrada.trilha um ponto {x, y, quadro} por quadro lógico com ponteiro na
// grade, e a soma Σ 0,55·exp(−d²/7)·decaimento^(quadro − q_i) dá o mesmo buffer. A única
// diferença é o teto: lá o min(1,15) entra a cada quadro, aqui só no fim da soma (sob o
// mesmo ponto parado, lá o buffer encosta no teto e decai dele; aqui a soma passa do teto
// e leva alguns quadros a mais para descer abaixo de 1). Ponto mais novo que o quadro
// (remontagem) ou com coordenada inválida não conta.
//
// Distância na métrica do site: x dividido por 2 (a célula mono é cerca de duas vezes mais
// alta que larga; sem isso o rastro sai achatado, um risco horizontal). Só células com
// d² < 26 recebem, como lá.
//
// Limiar da base: 0,32, não o 0,42 do site. Com 0,42 o porte enche 25,5% da faixa 159×7,
// e o site mede 45,8% ali. A conta é a mesma; quem difere é o ruído: num domínio grande o
// ruído de seno do site passa do corte em 24,3% dos pontos, como o nosso, mas a faixa do
// site (x de −8 a 14, só as linhas 0 a 2 da malha) caiu em valores altos da malha. Em
// 80×24 o site mede 31,7%. Com 0,32 o porte fica em 35,4% (159×7), 35,0% (80×24) e
// 34,2% (159×24): dentro de 30% do site nos três tamanhos.

import { registrar, por, ruido } from '../motor/nucleo.mjs';
import { tempo, limitar } from './_comum.mjs';

const RAMPA = ' ·:-=+*#';
const ASP = 2.0;
const ALCANCE = 26; // d² máximo que recebe, como no site

registrar('rastro', {
  // limiar: corte do ruído da base (ver acima; 0,42 no site).
  // decaimento: fator por quadro lógico (0,90 no site). ganho: pico de um ponto (0,55).
  // espalhamento: o 7 de exp(−d²/7). teto: limite do buffer (1,15).
  padrao: { velocidade: 1, limiar: 0.32, decaimento: 0.90, ganho: 0.55, espalhamento: 7, teto: 1.15, tom: 'tinta-2' },
  predefinicoes: {
    mao: {},
    longo: { decaimento: 0.95 },
    curto: { decaimento: 0.80 },
  },
  desenhar(grade, ctx) {
    const { limiar, decaimento, ganho, espalhamento, teto, tom } = ctx.params;
    const s = ctx.semente;
    const { cols, linhas } = grade;
    const t = tempo(ctx);

    // movimento reduzido: o site pinta uma vez em t = 3 e não volta a pintar, então o
    // ponteiro nunca aparece; aqui a trilha fica de fora do mesmo jeito
    const pontos = [];
    const trilha = ctx.parado ? null : ctx.entrada?.trilha;
    if (Array.isArray(trilha)) {
      for (const p of trilha) {
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.quadro)) continue;
        if (p.quadro > ctx.quadro) continue;
        pontos.push([p.x, p.y, p.quadro]);
      }
    }

    pontos.sort((a, b) => a[2] - b[2]);

    for (let y = 0; y < linhas; y++) {
      for (let x = 0; x < cols; x++) {
        // Mesma conta do buffer do site, refeita do ponto mais velho ao atual: decai,
        // soma o ponto e aplica o teto a cada passo. Somar tudo e cortar só no fim
        // deixava a mancha saturada por mais tempo do que no site.
        let buf = 0, ultimo = null;
        for (const [px, py, q] of pontos) {
          if (ultimo !== null) buf *= Math.pow(decaimento, q - ultimo);
          ultimo = q;
          const dx = (x - px) / ASP, dy = y - py, d2 = dx * dx + dy * dy;
          if (d2 < ALCANCE) buf = Math.min(teto, buf + Math.exp(-d2 / espalhamento) * ganho);
        }
        if (ultimo !== null) buf *= Math.pow(decaimento, ctx.quadro - ultimo);
        const base = Math.pow(Math.max(0, ruido(x * 0.09 - t * 0.14, y * 0.28, s) - limiar) / (1 - limiar), 1.7) * 0.55;
        const v = Math.min(1, base + buf);
        const i = limitar(Math.floor(v * RAMPA.length), 0, RAMPA.length - 1);
        if (i > 0) por(grade, x, y, RAMPA[i], tom);
      }
    }
  },
});
