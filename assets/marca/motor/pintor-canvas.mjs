// Pintor de canvas: leva uma grade do motor para um CanvasRenderingContext2D. É o pintor
// das imagens e dos vídeos. Não lê DOM nem CSS: as cores e a fonte chegam por parâmetro,
// então o mesmo código serve no navegador e num canvas do Node.

import { TONS, CHAPAS } from './nucleo.mjs';

// cores: { tinta, 'tinta-2', 'tinta-3', achado, papel } → string CSS de cor. papel só é
//   preciso se houver célula com chapa (tons chapa e chapa-achado): a célula inteira é
//   pintada na cor da chapa (tinta ou achado) e o caractere vai em papel. As bordas da
//   chapa são arredondadas para px inteiros, então chapas vizinhas emendam sem fresta.
// fundo: cor de fundo, ou null para deixar transparente (só limpa a área da grade).
// fonte: string CSS completa, por exemplo '500 16px "JetBrains Mono"'.
// Cada caractere vai no centro da sua célula de celulaL × celulaA.
export function pintarCanvas(ctx, grade, { celulaL, celulaA, cores, fundo = null, fonte }) {
  const largura = grade.cols * celulaL;
  const altura = grade.linhas * celulaA;
  if (fundo === null) {
    ctx.clearRect(0, 0, largura, altura);
  } else {
    ctx.fillStyle = fundo;
    ctx.fillRect(0, 0, largura, altura);
  }
  ctx.font = fonte;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  // cor de um tom, ou erro (tom sem cor nunca vira tinta invisível)
  const cor = (nome) => {
    const c = cores[nome];
    if (!c) throw new Error(`sem cor para o tom ${nome}`);
    return c;
  };

  // chapas primeiro, todas, para nenhum caractere ficar por baixo da chapa vizinha
  for (let y = 0; y < grade.linhas; y++) {
    const y0 = Math.round(y * celulaA), y1 = Math.round((y + 1) * celulaA);
    for (let x = 0; x < grade.cols; x++) {
      const base = CHAPAS[TONS[grade.tom[y * grade.cols + x]]];
      if (!base) continue;
      const x0 = Math.round(x * celulaL), x1 = Math.round((x + 1) * celulaL);
      ctx.fillStyle = cor(base);
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
  }

  let tomAtual = -1;
  for (let y = 0; y < grade.linhas; y++) {
    for (let x = 0; x < grade.cols; x++) {
      const i = y * grade.cols + x;
      const c = grade.car[i];
      if (c === ' ') continue;
      const t = grade.tom[i];
      if (t !== tomAtual) {
        ctx.fillStyle = CHAPAS[TONS[t]] ? cor('papel') : cor(TONS[t]);
        tomAtual = t;
      }
      ctx.fillText(c, x * celulaL + celulaL / 2, y * celulaA + celulaA / 2);
    }
  }
}
