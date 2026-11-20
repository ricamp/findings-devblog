// Efeito "relevo": campo de altura (o ruído do kit, motor/nucleo.mjs) visto em perspectiva,
// como um mapa de ativação em 3D: uma placa quadrada cujo relevo sobe e desce. Desenhado em
// linhas, não em massa: a superfície vai só para um z-buffer (amostras densas, sem buraco na
// tela) e o que se vê são linhas que correm sobre ela, testadas contra esse z-buffer: a
// linha de trás some atrás do morro da frente (linha escondida). O glifo diz por onde a
// linha passa na célula (`_ - ‾ / \ |`); o tom, a distância (frente em tinta, meio em
// tinta-2, fundo em tinta-3).
//
// Desenhos (`desenho`):
//   cristas  — uma linha por fileira da placa, como um "joy plot": as cristas da frente
//              escondem as de trás;
//   varrer   — as mesmas cristas em tinta-3, e uma faixa (a crista ativa e as vizinhas) que
//              atravessa a placa de trás para a frente e volta, em tinta;
//   niveis   — curvas de nível (marching squares no campo), cada uma na altura dela, com a
//              borda da placa e a base com quatro pés.
// Campos (`campo`): ruido (duas oitavas do ruído do kit), picos (três montes que passeiam
// sobre um piso de ruído; o topo do mais alto em achado) ou faixa (uma faixa central de
// picos estreitos sobre um chão quieto, como o gráfico de pulsar em cristas).
//
// Laço exato: o ruído é lido num círculo (o campo anda e volta ao começo) e a vista balança
// uma vez em `volta` quadros. Reação: ponteiro inclina, rolagem gira. Parado: três-quartos.

import { registrar, ruido } from '../motor/nucleo.mjs';
import {
  vista, enquadrar, matrizDaVista, aplicar, projetar, zbuffer, tracarAscii, porZ,
  tomDaProfundidade,
} from './tres-d.mjs';
import { limitar } from './_comum.mjs';

const TAU = Math.PI * 2;
const G = 48; // amostras do campo por lado (a placa é interpolada entre elas)

// Campo de altura em [0, 1] na grade G × G, para a fração f da volta.
function campoDe(q, f, semente) {
  const H = new Float32Array(G * G);
  const th = TAU * f;
  const ox = q.deriva * Math.cos(th), oz = q.deriva * Math.sin(th);
  const montes = q.campo === 'picos'
    ? [[-0.35, -0.25, 1, 0.26, 0], [0.4, 0.1, 0.72, 0.3, 2.1], [-0.05, 0.5, 0.55, 0.22, 4.2]]
    : null;
  for (let j = 0; j < G; j++) {
    for (let i = 0; i < G; i++) {
      const x = (i / (G - 1)) * 2 - 1, z = (j / (G - 1)) * 2 - 1;
      const n = ruido(x * q.escala + 7.3 + ox, z * q.escala + 3.1 + oz, semente) * 0.7
        + ruido(x * q.escala * 2.3 + 1.7 - oz, z * q.escala * 2.3 + 9.4 + ox, semente ^ 0x5bd1e995) * 0.3;
      let h;
      if (montes) {
        h = 0.1 * n;
        for (const [cx, cz, a, r, fase] of montes) {
          const mx = cx + 0.16 * Math.cos(th + fase), mz = cz + 0.16 * Math.sin(th + fase);
          const d2 = ((x - mx) ** 2 + (z - mz) ** 2) / (r * r);
          h += a * Math.exp(-d2);
        }
        h = Math.min(1, h);
      } else if (q.campo === 'faixa') {
        // picos estreitos só no meio da placa, chão quieto dos lados
        const env = Math.exp(-((x / 0.42) ** 2) * 1.6);
        const m = ruido(x * q.escala * 3.1 + 2.2 + ox, z * q.escala * 1.3 + 5.5 + oz, semente ^ 0x27d4eb2d);
        h = 0.04 * n + env * Math.pow(limitar((m - 0.25) / 0.6, 0, 1), 2.2) * 0.95 + env * 0.06;
      } else {
        h = limitar((n - 0.22) / 0.6, 0, 1);
        h = h * h * (3 - 2 * h);
      }
      H[j * G + i] = h;
    }
  }
  return H;
}

// Altura bilinear em (x, z) ∈ [−1, 1]².
function altura(H, x, z) {
  const u = ((x + 1) / 2) * (G - 1), v = ((z + 1) / 2) * (G - 1);
  const i = Math.min(G - 2, Math.max(0, Math.floor(u))), j = Math.min(G - 2, Math.max(0, Math.floor(v)));
  const a = u - i, b = v - j;
  return (H[j * G + i] * (1 - a) + H[j * G + i + 1] * a) * (1 - b) + (H[(j + 1) * G + i] * (1 - a) + H[(j + 1) * G + i + 1] * a) * b;
}

registrar('relevo', {
  // campo: ruido | picos | faixa; escala: frequência do ruído; deriva: raio do passeio no
  //   ruído (o campo anda num círculo e volta); altura: altura máxima do relevo (a placa
  //   tem 2 de lado).
  // desenho: cristas | varrer | niveis; cristas: quantas linhas de crista; niveis: quantas
  //   curvas de nível; base: a base com quatro pés; borda: a borda da placa.
  // volta, modo, guinada, balanco, inclinacao, guinadaParada, puxao, giroRolagem: a vista.
  padrao: {
    campo: 'ruido', escala: 1.5, deriva: 0.55, altura: 0.5, desenho: 'cristas', cristas: 18,
    niveis: 7, base: true, borda: true,
    volta: 120, modo: 'balanco', guinada: 0.28, balanco: 0.22, inclinacao: 0.5, guinadaParada: 0.28,
    fracaoParada: 0.15, puxao: 0.2, giroRolagem: 1, preenche: 0.9, distancia: 6,
  },
  predefinicoes: {
    calmo: { escala: 1.2, altura: 0.42, cristas: 15 },
    picos: { campo: 'picos', altura: 0.8, escala: 2, cristas: 20 },
    varredura: { desenho: 'varrer', altura: 0.48, cristas: 20 },
    'curvas-de-nivel': { campo: 'picos', desenho: 'niveis', niveis: 7, altura: 0.7, escala: 2, inclinacao: 0.62, base: true },
    cristas: { campo: 'faixa', altura: 0.55, escala: 1.6, cristas: 26, guinada: 0.12, balanco: 0.18, guinadaParada: 0.12, inclinacao: 0.42, borda: false },
  },
  desenhar(grade, ctx) {
    const q = ctx.params;
    const { cols, linhas } = grade;
    if (cols < 1 || linhas < 1) return;
    const vi = vista(ctx, grade);
    const H = campoDe(q, vi.f, ctx.semente ?? 0);
    const alt = q.altura, y0 = -alt / 2, yb = y0 - 0.12;
    const Y = (x, z) => y0 + altura(H, x, z) * alt;

    const pontos = [];
    for (const x of [-1, 1]) for (const z of [-1, 1]) pontos.push([x, yb, z], [x, y0 + alt, z]);
    const poses = q.modo === 'balanco' ? [-1, -0.5, 0, 0.5, 1].map((k) => q.guinada + k * q.balanco)
      : q.modo === 'giro' ? Array.from({ length: 8 }, (_, k) => q.guinada + (k * TAU) / 8) : [q.guinada];
    poses.push(q.guinadaParada);
    const cam = enquadrar(cols, linhas, pontos,
      poses.map((g) => matrizDaVista({ guinada: g, inclinacao: q.inclinacao })),
      { preenche: q.preenche, distancia: q.distancia });

    const M = matrizDaVista(vi);
    const proj = (x, y, z) => { const w = aplicar(M, x, y, z); return projetar(cam, w[0], w[1], w[2]); };
    // profundidade normalizada: a placa inteira
    const R = Math.hypot(1, 1, alt);
    const zn = (z) => limitar((z + R * 0.75) / (R * 1.5), 0, 1);

    // a superfície só no z-buffer: o passo projetado fica abaixo de meia célula
    const zs = zbuffer(grade);
    const S = Math.min(240, Math.max(8, Math.ceil(cam.esc * 2 * 1.4) + 6));
    let pico = null;
    for (let j = 0; j < S; j++) {
      const z = (j / (S - 1)) * 2 - 1;
      for (let i = 0; i < S; i++) {
        const x = (i / (S - 1)) * 2 - 1;
        const h = altura(H, x, z);
        const P = proj(x, y0 + h * alt, z);
        const px = Math.floor(P.sx), py = Math.floor(P.sy);
        if (px < 0 || py < 0 || px >= cols || py >= linhas) continue;
        const c = py * cols + px;
        if (P.z > zs[c]) zs[c] = P.z;
        if (q.campo === 'picos' && (!pico || h > pico.h)) pico = { h, x, z };
      }
    }
    // a linha só aparece onde a superfície não está na frente dela
    const tol = 0.06 * R;
    const visivel = (x, y, z) => x >= 0 && y >= 0 && x < cols && y < linhas && z >= zs[y * cols + x] - tol;
    const zl = zbuffer(grade);

    // uma polilinha 3D de pontos [x, y, z] do objeto
    const linha = (pts, tom, tomDe) => {
      let ant = null;
      for (const p of pts) {
        const P = proj(p[0], p[1], p[2]);
        if (ant) tracarAscii(grade, zl, ant, P, tom, { folga: 0.01, tomDe, visivel });
        ant = P;
      }
    };
    // As cristas correm no eixo da placa que fica mais deitado na tela (pela guinada de
    // repouso, para não trocar de eixo no meio do balanço).
    const M0 = matrizDaVista({ guinada: q.guinada, inclinacao: q.inclinacao });
    const ex = aplicar(M0, 1, 0, 0), ez = aplicar(M0, 0, 0, 1);
    const emX = Math.abs(ex[1]) * Math.abs(ez[0]) <= Math.abs(ez[1]) * Math.abs(ex[0]);
    const N = Math.max(32, Math.round(cols * 1.6));
    const crista = (w) => Array.from({ length: N + 1 }, (_, k) => {
      const s = (k / N) * 2 - 1;
      return emX ? [s, Y(s, w), w] : [w, Y(w, s), s];
    });
    const nc = Math.max(2, Math.min(Math.round(q.cristas), Math.round(linhas * 0.75)));
    const zDe = (k) => (k / (nc - 1)) * 2 - 1;
    const porProfundidade = (z) => tomDaProfundidade(zn(z));
    // Horizonte flutuante: cristas da frente para trás; numa coluna, um trecho só aparece
    // acima do mais alto já desenhado (ou abaixo do mais baixo). É o "joy plot" exato
    // para planos paralelos, sem depender da tolerância do z-buffer.
    const alto = new Float32Array(cols).fill(Infinity), baixo = new Float32Array(cols).fill(-Infinity);
    const cristaComHorizonte = (pts, tom, tomDe) => {
      const P = pts.map((p) => proj(p[0], p[1], p[2]));
      const vis = P.map((p) => {
        const c = Math.floor(p.sx);
        if (c < 0 || c >= cols) return false;
        return p.sy < alto[c] - 0.25 || p.sy > baixo[c] + 0.25;
      });
      for (let k = 1; k < P.length; k++) {
        if (vis[k - 1] && vis[k]) tracarAscii(grade, zl, P[k - 1], P[k], tom, { folga: 0.01, tomDe });
      }
      // o horizonte sobe com a crista inteira, entre as amostras também
      for (let k = 1; k < P.length; k++) {
        const a = P[k - 1], b = P[k];
        const c0 = Math.max(0, Math.floor(Math.min(a.sx, b.sx))), c1 = Math.min(cols - 1, Math.floor(Math.max(a.sx, b.sx)));
        for (let c = c0; c <= c1; c++) {
          const t = Math.abs(b.sx - a.sx) < 1e-9 ? 0 : limitar((c + 0.5 - a.sx) / (b.sx - a.sx), 0, 1);
          const y = a.sy + (b.sy - a.sy) * t;
          if (y < alto[c]) alto[c] = y;
          if (y > baixo[c]) baixo[c] = y;
        }
      }
    };
    // ordem da frente para trás pela profundidade do meio de cada crista
    const ordem = Array.from({ length: nc }, (_, k) => k).map((k) => {
      const w = zDe(k);
      const m = emX ? aplicar(M, 0, y0, w) : aplicar(M, w, y0, 0);
      return { k, z: m[2] };
    }).sort((a, b) => b.z - a.z);

    if (q.desenho === 'niveis') {
      const nv = Math.max(1, Math.round(q.niveis));
      for (let l = 1; l <= nv; l++) {
        const lim = l / (nv + 1);
        const tom = l >= nv - 1 ? 'tinta' : l >= nv / 2 ? 'tinta-2' : 'tinta-3';
        for (const [a, b] of isolinhas(H, lim)) {
          linha([[a[0], y0 + lim * alt, a[1]], [b[0], y0 + lim * alt, b[1]]], tom);
        }
      }
    } else if (q.desenho === 'varrer') {
      // a faixa ativa vai de trás para a frente e volta (laço exato)
      const ativa = (0.5 - 0.5 * Math.cos(TAU * vi.f)) * (nc - 1);
      for (const { k } of ordem) {
        const d = Math.abs(k - ativa);
        const tom = d < 0.5 ? 'tinta' : d < 1.5 ? 'tinta-2' : 'tinta-3';
        cristaComHorizonte(crista(zDe(k)), tom);
      }
    } else {
      for (const { k } of ordem) cristaComHorizonte(crista(zDe(k)), null, porProfundidade);
    }

    // borda da placa: as quatro arestas sobre o relevo, em tinta-3
    if (q.borda) {
      const B = 40;
      const lados = [[(t) => [t, -1]], [(t) => [1, t]], [(t) => [-t, 1]], [(t) => [-1, -t]]];
      for (const [f] of lados) {
        const pts = [];
        for (let k = 0; k <= B; k++) { const [x, z] = f((k / B) * 2 - 1); pts.push([x, Y(x, z), z]); }
        linha(pts, 'tinta-3');
      }
    }
    if (q.base) {
      const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      for (let k = 0; k < 4; k++) {
        const [x, z] = cs[k], [x2, z2] = cs[(k + 1) % 4];
        linha([[x, yb, z], [x2, yb, z2]], 'tinta-3');
        linha([[x, yb, z], [x, Y(x, z), z]], 'tinta-3');
      }
    }
    if (pico) {
      const P = proj(pico.x, y0 + pico.h * alt, pico.z);
      const px = Math.floor(P.sx), py = Math.floor(P.sy);
      if (px >= 0 && py >= 0 && px < cols && py < linhas) porZ(grade, zl, px, py, Math.max(P.z, zs[py * cols + px]) + 1, '●', 'achado', 0);
    }
  },
});

// Segmentos da curva de nível `lim` no campo H (marching squares), em (x, z) da placa.
function isolinhas(H, lim) {
  const segs = [];
  const pos = (i) => (i / (G - 1)) * 2 - 1;
  for (let j = 0; j < G - 1; j++) {
    for (let i = 0; i < G - 1; i++) {
      const a = H[j * G + i], b = H[j * G + i + 1], c = H[(j + 1) * G + i + 1], d = H[(j + 1) * G + i];
      const pts = [];
      const borda = (v0, v1, p0, p1) => {
        if ((v0 >= lim) === (v1 >= lim)) return;
        const t = (lim - v0) / (v1 - v0);
        pts.push([p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t]);
      };
      const A = [pos(i), pos(j)], B = [pos(i + 1), pos(j)], C = [pos(i + 1), pos(j + 1)], D = [pos(i), pos(j + 1)];
      borda(a, b, A, B); borda(b, c, B, C); borda(c, d, C, D); borda(d, a, D, A);
      if (pts.length === 2) segs.push([pts[0], pts[1]]);
      else if (pts.length === 4) segs.push([pts[0], pts[1]], [pts[2], pts[3]]);
    }
  }
  return segs;
}
