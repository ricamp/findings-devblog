// Efeito "anel": porte do fundo pulso do devblog (assets/ascii-fx.js). Anel de densidade
// respirando. Anel e não disco: o miolo fica limpo, que é onde mora o texto.
//
// Mesmas contas do site, com t de tempo() e o ruído com semente do motor. O ruído já
// trabalha nos pontos inteiros da rede (ruido() de nucleo.mjs), então nada aqui sorteia
// com coordenada fracionária. A grade de 1 linha ou 1 coluna não divide por zero:
// cols e linhas são pelo menos 1.

import { registrar, por, ruido } from '../motor/nucleo.mjs';
import { tempo, limitar } from './_comum.mjs';

registrar('anel', {
  // centro: posição horizontal do centro, em fração da largura (0,42 no site).
  // raio: raio mínimo; folego: quanto o raio cresce no auge (raio vai de 0,16 a 0,38).
  // ritmo: frequência da respiração, em radianos por segundo (0,55 no site).
  // largura: meia-largura da gaussiana do anel (0,13 no site).
  padrao: {
    velocidade: 1, centro: 0.42, raio: 0.16, folego: 0.22, ritmo: 0.55, largura: 0.13,
    rampa: ' ·:-=+', tom: 'tinta-2',
  },
  predefinicoes: {
    respira: {},
    largo: { largura: 0.2 },
    fino: { largura: 0.075 },
  },
  desenhar(grade, ctx) {
    const { centro, raio: raioMin, folego, ritmo, largura, rampa, tom } = ctx.params;
    const { cols, linhas } = grade;
    const s = ctx.semente;
    const t = tempo(ctx);
    const asp = cols / linhas / 6.5;
    const raio = raioMin + (0.5 + Math.sin(t * ritmo) * 0.5) * folego;
    for (let y = 0; y < linhas; y++) {
      for (let x = 0; x < cols; x++) {
        const dx = (x / cols - centro) * asp, dy = (y + 0.5) / linhas - 0.5;
        const dist = Math.sqrt(dx * dx + dy * dy);
        let v = Math.exp(-Math.pow((dist - raio) / largura, 2));
        v *= 0.55 + ruido(x * 0.3, y * 0.5 + t * 0.4, s) * 0.9;
        const c = rampa[limitar(Math.floor(v * rampa.length), 0, rampa.length - 1)];
        if (c !== ' ') por(grade, x, y, c, tom);
      }
    }
  },
});
