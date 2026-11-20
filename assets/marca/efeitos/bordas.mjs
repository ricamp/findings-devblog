// Efeito "bordas": contorno por direção, como um detector de bordas desenhado à mão. Um
// campo escalar é cortado num nível; o que passa do nível é "dentro". O contorno tem UMA
// célula de espessura e o glifo sai do arranjo dos vizinhos (4-vizinhança):
//   lado de fora só acima/abaixo → -     só à esquerda/direita → |
//   canto superior esquerdo ou inferior direito → /     os outros dois cantos → \
// O interior recebe uma densidade leve (· e, onde um ruído lento passa do limiar, :).
// Fora fica vazio.
//
// Duas fontes de campo:
//   manchas — soma de duas bolhas lentas de ruído de valor (ilhas que vagueiam). A
//     fronteira é a célula de DENTRO com vizinho de fora; quando o arranjo não decide (três
//     lados de fora, ou dois opostos com um terceiro), decide o gradiente (Sobel 3×3, com o
//     gradiente horizontal em dobro porque a coluna é meia unidade).
//   texto — a máscara da letra própria (mascaraDeTexto). Cada ponto da letra tem 2 colunas,
//     e uma haste de 1 ponto viraria só "||" se o contorno fosse por dentro. Por isso, no
//     texto, o contorno corre por FORA: a célula de fora com vizinho de dentro (4-vizinhança,
//     mais os 4 cantos para fechar a quina), e o interior é a máscara inteira, pontilhada.
//
// Recuo (só manchas): com `recuo` > 0 o campo cai a zero perto das bordas da grade e do
// retângulo `vazio` ({x, y, cols, linhas}, ou null), numa faixa de `recuo` linhas (a coluna
// conta meia linha). As formas não são cortadas pela borda: o contorno fecha antes. A capa
// passa o halo do nome como `vazio`. recuo 0 (o padrão) não muda nada.
//
// Rolagem (com data-reativo): as manchas sobem `rolar` linhas por página rolada (o campo é
// amostrado mais abaixo); parado, ou rolagem 0 ou ausente, nada muda. O texto não rola.
//
// Limpeza: numa mesma linha, duas diagonais iguais seguidas (// \\) ou duas barras (||)
// sujam a leitura; a segunda sai do contorno (no texto fica vazia; nas manchas vira
// interior).

import { registrar, por, ruido } from '../motor/nucleo.mjs';
import { tempo, mascaraDeTexto } from './_comum.mjs';

const SAL_BOLHA = 0x6a09e667;
const SAL_MIOLO = 0x3c6ef372;

// Índice = faixa do ângulo do contorno (mod π, y para baixo).
const TRACO = ['-', '\\', '|', '/'];

// Fator de 0 a 1 do recuo: distância (em linhas; coluna = meia linha) até a borda da grade
// ou até o retângulo vazio, sobre o recuo, suavizada.
function atenuar(x, y, cols, linhas, recuo, vazio) {
  let d = Math.min(x / 2, (cols - 1 - x) / 2, y, linhas - 1 - y);
  if (vazio) {
    const dx = Math.max(vazio.x - x, 0, x - (vazio.x + vazio.cols - 1)) / 2;
    const dy = Math.max(vazio.y - y, 0, y - (vazio.y + vazio.linhas - 1));
    d = Math.min(d, Math.max(dx, dy));
  }
  const u = Math.min(1, Math.max(0, d / recuo));
  return u * u * (3 - 2 * u);
}

// Forma do quadro: dentro (1/0 por célula), campo e se veio do texto. Texto vazio ou que
// não cabe dá null. Exportada também para os testes conferirem a forma.
export function formaDeBordas(cols, linhas, ctx) {
  const { fonte, nivel, escala, aspereza, deriva, texto, escalaX, entreLetras, recuo, vazio } = ctx.params;
  const n = cols * linhas;
  const campo = new Float32Array(n);
  const dentro = new Uint8Array(n);
  if (fonte === 'texto') {
    const m = mascaraDeTexto(texto, cols, linhas, { escalaX, entreLetras });
    if (m.largura === 0) return null;
    for (let y = m.y0; y < m.y0 + m.altura; y++)
      for (let x = m.x0; x < m.x0 + m.largura; x++)
        if (m.tem(x, y)) { campo[y * cols + x] = 1; dentro[y * cols + x] = 1; }
    return { dentro, campo, texto: true };
  }
  const s = ctx.semente ?? 0;
  const c = tempo(ctx) * deriva;
  const rol = ctx.parado ? 0 : Math.min(1, Math.max(0, Number(ctx.entrada?.rolagem) || 0));
  const dy = rol * (ctx.params.rolar ?? 0);
  for (let y = 0; y < linhas; y++) {
    for (let x = 0; x < cols; x++) {
      const u = x * 0.5 * escala, v = (dy ? y + dy : y) * escala;
      const f = (1 - aspereza) * ruido(u + c, v - c * 0.6, s)
        + aspereza * ruido(u * 2.3 - c * 1.7, v * 2.3 + 5.1, s ^ SAL_BOLHA);
      const g = recuo > 0 ? f * atenuar(x, y, cols, linhas, recuo, vazio) : f;
      campo[y * cols + x] = g;
      dentro[y * cols + x] = g >= nivel ? 1 : 0;
    }
  }
  return { dentro, campo, texto: false };
}

registrar('bordas', {
  // fonte: 'manchas' ou 'texto'. nivel: corte do campo (só manchas).
  // escala: ciclos de ruído por linha nas manchas; aspereza: peso da segunda oitava (borda
  //   mais recortada). deriva: unidades de ruído por segundo.
  // interior: false deixa só o contorno. miolo: limiar do ruído lento que troca · por :.
  // texto, escalaX, entreLetras: a máscara da fonte 'texto'. recuo, vazio: ver acima.
  // rolar: linhas que as manchas sobem por página rolada (0 desliga).
  // tomBorda: o contorno; tom: o interior (textura).
  padrao: {
    velocidade: 1, fonte: 'manchas', nivel: 0.64, escala: 0.15, aspereza: 0.12, deriva: 0.06,
    interior: true, miolo: 0.68, texto: 'FINDINGS', escalaX: 2, entreLetras: 1, recuo: 0, vazio: null, rolar: 4,
    tomBorda: 'tinta', tom: 'tinta-2',
  },
  predefinicoes: {
    manchas: {},
    // vão de 2 pontos entre letras: com 1, os contornos de letras vizinhas encostavam
    nome: { fonte: 'texto', texto: 'FINDINGS', entreLetras: 2 },
    fino: { interior: false, nivel: 0.6 },
  },
  desenhar(grade, ctx) {
    const { interior, miolo, tomBorda, tom } = ctx.params;
    const s = ctx.semente;
    const { cols, linhas } = grade;
    const t = tempo(ctx);
    const forma = formaDeBordas(cols, linhas, ctx);
    if (!forma) return;
    const { dentro, campo, texto } = forma;

    // 1 = dentro, 0 = fora, -1 = fora da grade (não conta como lado nenhum)
    const em = (x, y) => (x < 0 || y < 0 || x >= cols || y >= linhas ? -1 : dentro[y * cols + x]);
    const f = (x, y) => campo[Math.min(linhas - 1, Math.max(0, y)) * cols + Math.min(cols - 1, Math.max(0, x))];
    const pelaInclinacao = (x, y) => {
      const gx = 2 * ((f(x + 1, y - 1) + 2 * f(x + 1, y) + f(x + 1, y + 1))
        - (f(x - 1, y - 1) + 2 * f(x - 1, y) + f(x - 1, y + 1)));
      const gy = (f(x - 1, y + 1) + 2 * f(x, y + 1) + f(x + 1, y + 1))
        - (f(x - 1, y - 1) + 2 * f(x, y - 1) + f(x + 1, y - 1));
      const a = ((Math.atan2(gx, -gy) % Math.PI) + Math.PI) % Math.PI;
      return TRACO[Math.floor(a / (Math.PI / 4) + 0.5) % 4];
    };
    // Glifo pelos lados marcados (c = cima, b = baixo, e = esquerda, d = direita);
    // null quando o arranjo não decide.
    const peloArranjo = (c, b, e, d) => {
      const vert = c || b, horiz = e || d;
      if (vert && !horiz) return '-';
      if (horiz && !vert) return '|';
      if ((c && e && !b && !d) || (b && d && !c && !e)) return '/';
      if ((c && d && !b && !e) || (b && e && !c && !d)) return '\\';
      return null;
    };

    // contorno: 0 = não é, senão o glifo
    const traco = new Array(cols * linhas).fill(null);
    for (let y = 0; y < linhas; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        if (texto) {
          if (dentro[i]) continue;
          // lados onde está a letra
          const c = em(x, y - 1) === 1, b = em(x, y + 1) === 1, e = em(x - 1, y) === 1, d = em(x + 1, y) === 1;
          let g;
          if (c || b || e || d) {
            g = peloArranjo(c, b, e, d) ?? (e && d ? '|' : '-');
          } else {
            // quina: só um canto encosta na letra; o glifo é o do canto da forma
            const ie = em(x + 1, y + 1) === 1 || em(x - 1, y - 1) === 1;
            const id = em(x - 1, y + 1) === 1 || em(x + 1, y - 1) === 1;
            if (ie === id) continue; // nenhum, ou dois cantos opostos: deixa vazio
            g = ie ? '/' : '\\';
          }
          traco[i] = g;
        } else {
          if (!dentro[i]) continue;
          // lados de fora (dentro da grade)
          const c = em(x, y - 1) === 0, b = em(x, y + 1) === 0, e = em(x - 1, y) === 0, d = em(x + 1, y) === 0;
          if (!(c || b || e || d)) continue;
          traco[i] = peloArranjo(c, b, e, d) ?? pelaInclinacao(x, y);
        }
      }
    }

    // limpeza: // \\ || seguidos numa linha perdem o segundo
    for (let y = 0; y < linhas; y++) {
      for (let x = 1; x < cols; x++) {
        const i = y * cols + x, g = traco[i];
        if (g && g !== '-' && traco[i - 1] === g) traco[i] = null;
      }
    }

    for (let y = 0; y < linhas; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        if (traco[i]) { por(grade, x, y, traco[i], tomBorda); continue; }
        if (!dentro[i] || !interior) continue;
        const k = ruido(x * 0.5 * 0.45 + t * 0.35, y * 0.45 - t * 0.2, s ^ SAL_MIOLO);
        por(grade, x, y, k > miolo ? ':' : '·', tom);
      }
    }
  },
});
