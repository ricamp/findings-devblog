// Peças comuns aos efeitos (os portados do site, devblog assets/ascii-fx.js, e os novos).
// Lá cada efeito recebe t em segundos; aqui o tempo sai do quadro lógico, para o mesmo
// quadro dar sempre a mesma grade. Nada aqui guarda estado.

import { FPS_LOGICO } from '../motor/nucleo.mjs';
import { compor } from '../motor/letra.mjs';

// Segundos do site a partir do quadro: quadro / FPS_LOGICO * velocidade.
// Parado, o site congela em t = 3 s; aqui também, escalado pela velocidade.
export function tempo({ quadro = 0, params = {}, parado = false } = {}) {
  const velocidade = params.velocidade ?? 1;
  return parado ? 3 * velocidade : (quadro / FPS_LOGICO) * velocidade;
}

export function limitar(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

// Mistura linear: k = 0 dá a, k = 1 dá b.
export function misto(a, b, k) {
  return a + (b - a) * k;
}

// Ponteiro dentro da grade, ou null. O pintor manda a posição do ponteiro na página mesmo
// quando ele está longe do <pre>; fora da grade, o efeito reativo fica no automático.
export function ponteiroNaGrade(entrada, grade) {
  const p = entrada?.ponteiro;
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
  if (p.x < 0 || p.y < 0 || p.x >= grade.cols || p.y >= grade.linhas) return null;
  return p;
}

const MASCARA_VAZIA = Object.freeze({ tem: () => false, largura: 0, altura: 0, x0: 0, y0: 0 });

// Máscara de um texto na letra própria (compor, de motor/letra.mjs), centrada na grade.
// Cada ponto da letra ocupa escalaX colunas × 1 linha; tem(x, y) diz se a célula (x, y)
// cai num ponto aceso. Texto vazio ou que não cabe (na largura ou nas sete linhas) dá a
// máscara vazia; caractere que a letra não tem lança o erro de compor.
export function mascaraDeTexto(texto, cols, linhas, { escalaX = 2, entreLetras = 1 } = {}) {
  const bloco = compor(String(texto ?? ''), { entreLetras });
  const ex = Math.max(1, Math.round(escalaX));
  const largura = bloco[0].length * ex, altura = bloco.length;
  if (largura === 0 || largura > cols || altura > linhas) return MASCARA_VAZIA;
  const x0 = Math.floor((cols - largura) / 2), y0 = Math.floor((linhas - altura) / 2);
  return {
    largura, altura, x0, y0,
    tem(x, y) {
      const dx = x - x0, dy = y - y0;
      if (dx < 0 || dy < 0 || dx >= largura || dy >= altura) return false;
      return bloco[dy][Math.floor(dx / ex)] === '#';
    },
  };
}
