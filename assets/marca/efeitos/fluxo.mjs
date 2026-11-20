// Efeito "fluxo": linhas de corrente finas e curvas de um campo invisível. O ângulo do
// campo sai de ruído de valor em duas oitavas e balança devagar com o tempo; só aparece
// onde uma segunda amostra de ruído, a intensidade, passa do piso.
//
// Fios: sementes esparsas (hash2 da posição, em ordem de leitura) e, de cada uma, o fio é
// integrado passo a passo para os dois lados, reamostrando o ângulo a cada passo, até
// `comprimento` células por lado, a saída da grade ou da região acesa, ou o encontro com
// outro fio (que também não pode ficar colado ao lado, na mesma linha).
//
// Glifo: vem do passo do fio NA GRADE, entre a célula anterior e a seguinte: mesma linha
// → ─, mesma coluna (ou duas linhas por coluna) → │, diagonal → ╲ ou ╱. Um fio nunca põe
// duas diagonais lado a lado na mesma linha (a segunda vira ─): é isso que evita as
// escadas ╲╲╲ que liam como hachura.
//
// Correção de aspecto: a célula mono é 2:1 (alta). O campo é amostrado em coordenadas
// físicas (x vale meia unidade, y uma) e o passo físico vira (2·cos, sin) em células.

import { registrar, por, ruido, hash2 } from '../motor/nucleo.mjs';
import { tempo } from './_comum.mjs';

const SAL_OITAVA = 0x51ed270b;
const SAL_INTENSIDADE = 0x2f6b0c1d;
const SAL_SEMENTE = 0x7c3f9a21;
const SAL_GIRO = 0x1b2e4d6f;

const DIAGONAL = new Set(['╲', '╱']);

// Glifo pelo deslocamento na grade (dx, dy) entre a célula anterior e a seguinte. Duas
// linhas para uma coluna conta como mesma coluna: a coluna vale meia linha, então esse
// passo tem 76° físicos, mais perto do │ que do ╲ (que a fonte desenha a ~63°). Sem isso
// o │ ficava em 9% das células.
function glifoDoPasso(dx, dy) {
  if (dy === 0) return '─';
  if (dx === 0 || Math.abs(dy) >= 2 * Math.abs(dx)) return '│';
  return dx * dy > 0 ? '╲' : '╱';
}

// Os fios do quadro: lista de listas de { x, y, c }. Exportada para os testes.
export function tracarFios(cols, linhas, ctx) {
  const { escala, piso, giro, ritmo, rumo, voltas, fios, comprimento, deriva } = ctx.params;
  const s = ctx.semente ?? 0;
  const t = tempo(ctx);
  const corre = t * deriva;
  const passos = Math.max(0, Math.round(comprimento));
  // o giro vai e volta: girando sem parar, em poucos minutos o campo perdia o rumo
  const balanco = 2 * giro * Math.sin(t * ritmo);

  // ângulo físico na posição contínua (px, py), em células
  const angulo = (px, py) => {
    const u = px * 0.5 * escala, v = py * escala;
    const n = 0.65 * ruido(u + corre, v, s) + 0.35 * ruido(2 * u + 3.1, 2 * v - corre, s ^ SAL_OITAVA);
    // sentido do giro: outra amostra, mais larga, para o giro torcer o campo em vez de só
    // esticar a variação do ângulo
    const m = ruido(u * 0.6 + 11.7, v * 0.6 - corre, s ^ SAL_GIRO);
    return rumo + 2 * Math.PI * voltas * (n - 0.5) + balanco * (2 * m - 1);
  };
  const acesa = new Uint8Array(cols * linhas);
  for (let y = 0; y < linhas; y++)
    for (let x = 0; x < cols; x++) {
      const u = x * 0.5 * escala, v = y * escala;
      acesa[y * cols + x] = ruido(u * 0.5 - corre * 1.3, v * 0.8 + 7.3, s ^ SAL_INTENSIDADE) > piso ? 1 : 0;
    }

  const dono = new Int32Array(cols * linhas); // 0 = livre, senão número do fio + 1
  const livre = (x, y, id) => {
    if (x < 0 || y < 0 || x >= cols || y >= linhas) return false;
    const i = y * cols + x;
    if (!acesa[i] || dono[i]) return false;
    // sem fio vizinho colado na mesma linha
    if (x > 0 && dono[i - 1] && dono[i - 1] !== id) return false;
    if (x + 1 < cols && dono[i + 1] && dono[i + 1] !== id) return false;
    return true;
  };

  // anda a partir do centro da célula (x0, y0) no sentido dado; devolve as células novas
  const andar = (x0, y0, sentido, id) => {
    const celulas = [];
    let px = x0 + 0.5, py = y0 + 0.5, cx = x0, cy = y0;
    for (let k = 0; k < passos * 4 && celulas.length < passos; k++) {
      const a = angulo(px, py);
      let dx = 2 * Math.cos(a) * sentido, dy = Math.sin(a) * sentido;
      const maior = Math.max(Math.abs(dx), Math.abs(dy));
      dx *= 0.5 / maior; dy *= 0.5 / maior; // meio passo de célula na direção maior
      px += dx; py += dy;
      const nx = Math.floor(px), ny = Math.floor(py);
      if (nx === cx && ny === cy) continue;
      if (!livre(nx, ny, id)) break;
      dono[ny * cols + nx] = id;
      celulas.push([nx, ny]);
      cx = nx; cy = ny;
    }
    return celulas;
  };

  const lista = [];
  for (let y = 0; y < linhas; y++) {
    for (let x = 0; x < cols; x++) {
      if (hash2(x, y, s ^ SAL_SEMENTE) >= fios) continue;
      const id = lista.length + 1;
      if (!livre(x, y, id)) continue;
      dono[y * cols + x] = id;
      const atras = andar(x, y, -1, id), frente = andar(x, y, 1, id);
      const cel = [...atras.reverse(), [x, y], ...frente];
      if (cel.length < 2) { dono[y * cols + x] = 0; continue; } // ponto solto não é fio
      const fio = cel.map(([cx, cy], i) => {
        const [ax, ay] = cel[Math.max(0, i - 1)], [bx, by] = cel[Math.min(cel.length - 1, i + 1)];
        return { x: cx, y: cy, c: glifoDoPasso(bx - ax, by - ay) };
      });
      // nunca duas diagonais do mesmo fio lado a lado na mesma linha
      const naLinha = new Map(fio.map((p) => [p.y * cols + p.x, p]));
      for (const p of fio) {
        if (!DIAGONAL.has(p.c)) continue;
        const esq = p.x > 0 ? naLinha.get(p.y * cols + p.x - 1) : undefined;
        if (esq && DIAGONAL.has(esq.c)) p.c = '─';
      }
      lista.push(fio);
    }
  }
  return lista;
}

registrar('fluxo', {
  // escala: tamanho das voltas do ângulo, em ciclos de ruído por linha (menor = maior).
  // piso: a intensidade precisa passar dele para a região acender.
  // giro: quanto o ângulo gira (rad, perto do máximo), indo e voltando no ritmo (rad/s);
  //   regiões giram em sentidos opostos, o que dá os redemoinhos.
  // rumo: direção média, em rad (0 = deitado). voltas: quanto o ângulo varre em torno do
  //   rumo ao longo do campo (1 = uma volta inteira).
  // fios: fração das células que são semente de fio; comprimento: células por lado.
  // deriva: velocidade com que o campo escorre, em unidades de ruído por segundo.
  padrao: {
    velocidade: 1, escala: 0.09, piso: 0.36, giro: 0.35, ritmo: 0.15, rumo: 0, voltas: 2,
    fios: 0.04, comprimento: 7, deriva: 0.05, tom: 'tinta-2',
  },
  predefinicoes: {
    brisa: {},
    corrente: { escala: 0.05, giro: 0.25, voltas: 0.7, comprimento: 14, fios: 0.022, deriva: 0.08 },
    redemoinho: { escala: 0.12, giro: 1.6, ritmo: 0.3, voltas: 2.6, comprimento: 9 },
  },
  desenhar(grade, ctx) {
    const { tom } = ctx.params;
    for (const fio of tracarFios(grade.cols, grade.linhas, ctx))
      for (const { x, y, c } of fio) por(grade, x, y, c, tom);
  },
});
