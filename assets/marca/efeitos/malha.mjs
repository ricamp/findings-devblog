// Efeito "malha": arame em 3D. Arestas projetadas com a célula alta corrigida
// (efeitos/tres-d.mjs) e traçadas com o glifo da inclinação (─ │ ╱ ╲ e os de meia célula).
// Linha escondida de verdade: cada sólido declara oclusores (caixas, esfera, anel); um trecho
// de aresta só aparece se o raio do olho até ele não bate antes num oclusor. Aresta forte
// escondida vira pontilhado em tinta-3; linha fina escondida some. O que fica à vista
// tem o tom da profundidade: frente em tinta, meio em tinta-2, fundo em tinta-3 (as fortes
// sobem um nível). Um ponto só vai em terracota.
//
// Sólidos (`solido`):
//   cubo     — cubo de voxels: arestas fortes, a grade das faces fina, um voxel em achado;
//   grade    — rede 3D de nós (● perto, • no meio, · longe) dentro de uma caixa; um nó em achado;
//   gantry   — esquema de tomógrafo: um anel grosso (as duas bocas, a borda e as placas do
//              detector na face), a mesa que o atravessa num pé, o tubo girando no anel com
//              o feixe até o detector; o isocentro em achado. Esquemático, sem paciente;
//   orbita   — esfera de arame (meridianos e paralelos) com um anel inclinado em volta e um
//              ponto em achado correndo nele, com rastro;
//   voxels   — a rede de um volume 4 × 4 × 4 com poucos voxels cheios (uma máscara
//              geométrica): os cheios são sólidos, com as faces na rampa da luz; um tem o
//              achado no centro da face;
//   octaedro, piramide — os da base de referências.
//
// Laço exato: a volta inteira (modo giro) ou o balanço (modo balanco) em `volta` quadros; o
// tubo e o satélite dão um número inteiro de voltas no mesmo laço. Reação: ponteiro
// inclina e leva a luz (voxels); rolagem gira. Parado: três-quartos.

import { registrar } from '../motor/nucleo.mjs';
import {
  vista, enquadrar, matrizDaVista, transpor, aplicar, projetar, zbuffer, tracar, porZ,
  raioDaCelula, luzDe, daRampa, tomDaProfundidade, RAMPA_LUZ,
} from './tres-d.mjs';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------- oclusores (objeto)

// Caixa [x0, x1] × [y0, y1] × [z0, z1]: t de entrada (> 0) ou Infinity.
function caixaT(b) {
  return (o, d) => {
    let t0 = -Infinity, t1 = Infinity;
    for (let e = 0; e < 3; e++) {
      const lo = b[e * 2], hi = b[e * 2 + 1];
      if (Math.abs(d[e]) < 1e-12) { if (o[e] < lo || o[e] > hi) return Infinity; continue; }
      let ta = (lo - o[e]) / d[e], tb = (hi - o[e]) / d[e];
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) return Infinity;
    }
    return t0 > 1e-6 ? t0 : Infinity;
  };
}

function esferaT(r) {
  return (o, d) => {
    const b = o[0] * d[0] + o[1] * d[1] + o[2] * d[2];
    const c = o[0] * o[0] + o[1] * o[1] + o[2] * o[2] - r * r;
    const h = b * b - c;
    if (h < 0) return Infinity;
    const t = -b - Math.sqrt(h);
    return t > 1e-6 ? t : Infinity;
  };
}

// Anel de eixo z: raio de dentro ri, de fora re, espessura ±e.
function anelT(ri, re, e) {
  return (o, d) => {
    let melhor = Infinity;
    for (const zc of [-e, e]) {
      if (Math.abs(d[2]) < 1e-12) continue;
      const t = (zc - o[2]) / d[2];
      if (t <= 1e-6 || t >= melhor) continue;
      const x = o[0] + d[0] * t, y = o[1] + d[1] * t, r2 = x * x + y * y;
      if (r2 >= ri * ri && r2 <= re * re) melhor = t;
    }
    const a = d[0] * d[0] + d[1] * d[1];
    if (a > 1e-12) {
      const b = o[0] * d[0] + o[1] * d[1];
      for (const r of [ri, re]) {
        const c = o[0] * o[0] + o[1] * o[1] - r * r;
        const h = b * b - a * c;
        if (h < 0) continue;
        const s = Math.sqrt(h);
        for (const t of [(-b - s) / a, (-b + s) / a]) {
          if (t <= 1e-6 || t >= melhor) continue;
          const z = o[2] + d[2] * t;
          if (z >= -e && z <= e) melhor = t;
        }
      }
    }
    return melhor;
  };
}

// ---------------------------------------------------------------- construtores

// { s: [[a, b, forte, opcoes?]], p: [[ponto, car, tom|null]], oc: [oclusores] } no objeto.
function circulo(s, n, f, forte, extra = {}) {
  let ant = f(0);
  for (let k = 1; k <= n; k++) {
    const p = f(k / n);
    s.push([ant, p, forte, extra]);
    ant = p;
  }
}

function caixa(s, x0, x1, y0, y1, z0, z1, forte, extra = {}) {
  const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  for (const [i, j] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) {
    s.push([v[i], v[j], forte, extra]);
  }
  return v;
}

// Voxels cheios da máscara (índices na rede 4 × 4 × 4) e o do achado.
const MASCARA = [[1, 0, 1], [1, 1, 1], [2, 1, 1], [1, 2, 1], [1, 1, 2], [2, 1, 2], [2, 2, 2], [1, 2, 2], [0, 1, 1]];
const VOXEL_ACHADO = 6;

// Normal da face da caixa b mais perto do ponto h.
const normalDaCaixa = (b) => (h) => {
  let nm = [0, 0, 0], dm = Infinity;
  for (let e = 0; e < 3; e++) {
    for (const [lim, sg] of [[b[e * 2], -1], [b[e * 2 + 1], 1]]) {
      const dist = Math.abs(h[e] - lim);
      if (dist < dm) { dm = dist; nm = [0, 0, 0]; nm[e] = sg; }
    }
  }
  return nm;
};

const SOLIDOS = {
  cubo(q) {
    const s = [], p = [];
    const v = caixa(s, -1, 1, -1, 1, -1, 1, true);
    const d = Math.max(1, Math.round(q.divisoes));
    for (let k = 1; k < d; k++) {
      const c = -1 + (2 * k) / d;
      for (const e of [-1, 1]) {
        s.push([[c, -1, e], [c, 1, e], false], [[-1, c, e], [1, c, e], false]); // frente e trás
        s.push([[e, -1, c], [e, 1, c], false], [[e, c, -1], [e, c, 1], false]); // lados
        s.push([[-1, e, c], [1, e, c], false], [[c, e, -1], [c, e, 1], false]); // topo e base
      }
    }
    if (q.vertices) for (const x of v) p.push([x, '●', null]);
    // o voxel do canto de cima, da frente, à direita: o centro da face da frente em achado
    const m = 1 - 1 / d;
    p.push([[m, m, 1], '■', 'achado']);
    return { s, p, oc: [caixaT([-1, 1, -1, 1, -1, 1])] };
  },
  grade(q) {
    const s = [], p = [];
    const d = Math.max(2, Math.round(q.divisoes) + 1);
    caixa(s, -1, 1, -1, 1, -1, 1, false);
    for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) for (let k = 0; k < d; k++) {
      const x = -1 + (2 * i) / (d - 1), y = -1 + (2 * j) / (d - 1), z = -1 + (2 * k) / (d - 1);
      const eh = i === d - 2 && j === d - 1 && k === 1;
      p.push([[x, y, z], eh ? '●' : null, eh ? 'achado' : null]);
    }
    return { s, p, oc: [] };
  },
  gantry(q, f, ver) {
    const s = [], p = [];
    const Ro = 1, Ri = 0.6, e = 0.24;
    // as duas bocas do anel (fora e dentro), em cada face
    for (const z of [-e, e]) {
      for (const r of [Ro, Ri]) circulo(s, 64, (t) => [r * Math.cos(TAU * t), r * Math.sin(TAU * t), z], true);
      // placas do detector: poucos raios curtos na face, finos
      for (let k = 0; k < q.placas; k++) {
        const a = (k / q.placas) * TAU + 0.2;
        s.push([[Ri * 1.12 * Math.cos(a), Ri * 1.12 * Math.sin(a), z], [Ro * 0.9 * Math.cos(a), Ro * 0.9 * Math.sin(a), z], false, { tom: 'tinta-3' }]);
      }
    }
    // a borda do anel: as geratrizes de silhueta, onde a normal do cilindro é perpendicular ao
    // olho (ver = direção do olho no objeto)
    for (const r of [Ro, Ri]) {
      const a0 = Math.atan2(ver[1], ver[0]) + Math.PI / 2;
      for (const a of [a0, a0 + Math.PI]) {
        s.push([[r * Math.cos(a), r * Math.sin(a), -e], [r * Math.cos(a), r * Math.sin(a), e], true]);
      }
    }
    // mesa: o tampo atravessando o anel, num pé
    const mesa = [-0.26, 0.26, -0.5, -0.42, -1.75, 1.15];
    caixa(s, ...mesa, true);
    const pe = [-0.14, 0.14, -1.05, -0.5, -1.55, -1.25];
    caixa(s, ...pe, false);
    // tubo e detector, do lado oposto: giram `voltasTubo` vezes por laço
    const th = TAU * f * q.voltasTubo + 1.1;
    const tubo = [Ri * Math.cos(th), Ri * Math.sin(th), 0];
    const abre = 0.36;
    const det = (t) => [Ri * Math.cos(th + Math.PI + t), Ri * Math.sin(th + Math.PI + t), 0];
    circulo(s, 8, (t) => det(-abre + 2 * abre * t), true, { tom: 'tinta' });
    s.push([tubo, det(-abre), false, { pontilhado: 2, tom: 'tinta-2', semOclusao: true }],
      [tubo, det(abre), false, { pontilhado: 2, tom: 'tinta-2', semOclusao: true }]);
    p.push([tubo, '■', 'tinta']);
    p.push([[0, 0, 0], '●', 'achado', true]);
    // o anel é cheio: as faces dele recebem a luz, em tinta-3 (o arame fica por cima)
    const normalAnel = (h) => {
      if (Math.abs(Math.abs(h[2]) - e) < 1e-3) return [0, 0, Math.sign(h[2])];
      const r = Math.hypot(h[0], h[1]) || 1;
      const sg = r > (Ri + Ro) / 2 ? 1 : -1;
      return [(sg * h[0]) / r, (sg * h[1]) / r, 0];
    };
    return {
      s, p, oc: [anelT(Ri, Ro, e), caixaT(mesa), caixaT(pe)],
      sup: [{ t: anelT(Ri, Ro, e), n: normalAnel, tom: 'tinta-3', ganho: 0.5 }],
    };
  },
  orbita(q, f) {
    const s = [], p = [];
    const r = 0.6;
    for (let m = 0; m < 3; m++) {
      const a = (m * Math.PI) / 3;
      circulo(s, 40, (t) => [r * Math.cos(TAU * t) * Math.cos(a), r * Math.sin(TAU * t), r * Math.cos(TAU * t) * Math.sin(a)], false);
    }
    for (const lat of [-0.7, 0, 0.7]) {
      const y = r * Math.sin(lat), rr = r * Math.cos(lat);
      circulo(s, 40, (t) => [rr * Math.cos(TAU * t), y, rr * Math.sin(TAU * t)], lat === 0);
    }
    // órbita inclinada e o satélite
    const inc = 0.5, R = 1.2;
    const orb = (t) => {
      const x = R * Math.cos(TAU * t), z = R * Math.sin(TAU * t);
      return [x, -z * Math.sin(inc), z * Math.cos(inc)];
    };
    circulo(s, 72, orb, true);
    const t0 = f * q.voltasSatelite;
    for (let k = 3; k >= 1; k--) p.push([orb(t0 - k * 0.025), '·', 'tinta-2']);
    p.push([orb(t0), '●', 'achado']);
    // a esfera esconde o que passa atrás dela (um pouco menor: o arame dela fica à vista)
    return { s, p, oc: [esferaT(r * 0.985)] };
  },
  voxels(q) {
    const s = [], p = [];
    const n = 4, h = 2 / n;
    // a caixa do volume, fina, e a grade só no chão dela (y = −1)
    caixa(s, -1, 1, -1, 1, -1, 1, false);
    for (let k = 1; k < n; k++) {
      const c = -1 + k * h;
      s.push([[c, -1, -1], [c, -1, 1], false, { tom: 'tinta-3' }], [[-1, -1, c], [1, -1, c], false, { tom: 'tinta-3' }]);
    }
    const caixas = MASCARA.map(([i, j, k]) => [-1 + i * h, -1 + (i + 1) * h, -1 + j * h, -1 + (j + 1) * h, -1 + k * h, -1 + (k + 1) * h]);
    for (const b of caixas) caixa(s, ...b, true);
    const a = caixas[VOXEL_ACHADO];
    p.push([[(a[0] + a[1]) / 2, a[3], (a[4] + a[5]) / 2], '●', 'achado']); // centro da face de cima
    return {
      s, p, oc: caixas.map((b) => caixaT(b)),
      sup: caixas.map((b) => ({ t: caixaT(b), n: normalDaCaixa(b), ganho: 0.82 })),
    };
  },
  octaedro(q) {
    const s = [], p = [];
    const v = [[1.3, 0, 0], [-1.3, 0, 0], [0, 1.3, 0], [0, -1.3, 0], [0, 0, 1.3], [0, 0, -1.3]];
    for (const [i, j] of [[0, 2], [0, 3], [0, 4], [0, 5], [1, 2], [1, 3], [1, 4], [1, 5], [2, 4], [4, 3], [3, 5], [5, 2]]) s.push([v[i], v[j], true]);
    if (q.vertices) for (const x of v) p.push([x, '●', null]);
    return { s, p, oc: [] };
  },
  piramide(q) {
    const s = [], p = [];
    const v = [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1], [0, 1.2, 0]];
    for (const [i, j] of [[0, 1], [1, 2], [2, 3], [3, 0], [0, 4], [1, 4], [2, 4], [3, 4]]) s.push([v[i], v[j], true]);
    if (q.vertices) for (const x of v) p.push([x, '●', null]);
    return { s, p, oc: [] };
  },
};

registrar('malha', {
  // solido: cubo | grade | gantry | orbita | voxels | octaedro | piramide; divisoes: voxels
  //   por aresta (cubo) ou intervalos da rede (grade); vertices: marca os cantos (●).
  // voltasTubo, voltasSatelite: voltas do tubo e do satélite por laço (inteiras).
  // perspectiva: distância da câmera (0 = paralela); giroX, giroY: inclinação e giro a
  //   mais na pose (a base de referências sorteia estes).
  // escondidas: fraco (aresta forte escondida em pontilhado tinta-3) ou some.
  // volta, modo, guinada, balanco, inclinacao, guinadaParada, puxao, giroRolagem: a vista.
  // luzX, luzY, luzZ, puxaLuz, rampa: a luz das faces cheias (voxels).
  padrao: {
    solido: 'cubo', divisoes: 3, vertices: true, voltasTubo: 2, voltasSatelite: 2, placas: 12,
    perspectiva: 5, giroX: 0, giroY: 0, preenche: 0.84, escondidas: 'fraco',
    volta: 120, modo: 'giro', guinada: 0, balanco: 0.35, inclinacao: 0.42, guinadaParada: 0.62,
    fracaoParada: 0.1, puxao: 0.2, puxaLuz: 0.8, giroRolagem: 1,
    luzX: -0.7, luzY: 0.8, luzZ: 0.5, rampa: RAMPA_LUZ,
  },
  predefinicoes: {
    cubo: { solido: 'cubo' },
    grade: { solido: 'grade', inclinacao: 0.36 },
    gantry: { solido: 'gantry', modo: 'balanco', guinada: 0.62, balanco: 0.22, inclinacao: 0.26, guinadaParada: 0.62, vertices: false, perspectiva: 6, escondidas: 'some' },
    orbita: { solido: 'orbita', inclinacao: 0.3, vertices: false, escondidas: 'some' },
    voxels: { solido: 'voxels', inclinacao: 0.5, guinada: 0.3, guinadaParada: 0.7, vertices: false, escondidas: 'some' },
  },
  desenhar(grade, ctx) {
    const q = ctx.params;
    const { cols, linhas } = grade;
    if (cols < 1 || linhas < 1) return;
    const vi = vista(ctx, grade);
    vi.guinada += q.giroY;
    vi.inclinacao += q.giroX;
    const M = matrizDaVista(vi);
    const Mt = transpor(M);
    const ver = aplicar(Mt, 0, 0, 1); // direção do olho, no objeto
    const construir = SOLIDOS[q.solido] ?? SOLIDOS.cubo;
    const { s, p, oc, sup } = construir(q, vi.f, ver);

    // enquadramento estável: todas as poses do laço
    const pontos = [];
    for (const [a, b] of s) pontos.push(a, b);
    for (const [x] of p) pontos.push(x);
    const poses = [];
    if (q.modo === 'giro') for (let k = 0; k < 8; k++) poses.push(q.guinada + (k * TAU) / 8);
    else if (q.modo === 'balanco') for (const k of [-1, -0.5, 0, 0.5, 1]) poses.push(q.guinada + k * q.balanco);
    else poses.push(q.guinada);
    poses.push(q.guinadaParada);
    const vistas = poses.map((g) => matrizDaVista({ guinada: g + q.giroY, inclinacao: q.inclinacao + q.giroX }));
    const cam = enquadrar(cols, linhas, pontos, vistas, { preenche: q.preenche, distancia: q.perspectiva });

    // profundidade normalizada: o raio do objeto
    let raio = 0;
    for (const x of pontos) raio = Math.max(raio, Math.hypot(x[0], x[1], x[2]));
    const zn = (z) => (z + raio) / (2 * raio || 1);
    // olho no objeto
    const olho = q.perspectiva > 0 ? aplicar(Mt, 0, 0, q.perspectiva) : null;
    const visivel = (x) => {
      if (!oc.length) return true;
      let o, d, L;
      if (olho) {
        d = [x[0] - olho[0], x[1] - olho[1], x[2] - olho[2]];
        L = Math.hypot(d[0], d[1], d[2]);
        d = [d[0] / L, d[1] / L, d[2] / L];
        o = olho;
      } else {
        o = [x[0] + ver[0] * 50, x[1] + ver[1] * 50, x[2] + ver[2] * 50];
        d = [-ver[0], -ver[1], -ver[2]];
        L = 50;
      }
      for (const f of oc) if (f(o, d) < L - 0.012) return false;
      return true;
    };
    const proj = (x) => { const w = aplicar(M, x[0], x[1], x[2]); return projetar(cam, w[0], w[1], w[2]); };
    const zb = zbuffer(grade);

    // faces cheias (anel do gantry, voxels): raio por célula, a luz na rampa
    if (sup) {
      const L = luzDe(q, vi);
      for (let y = 0; y < linhas; y++) {
        for (let x = 0; x < cols; x++) {
          const { o, d } = raioDaCelula(cam, x, y);
          const oo = aplicar(Mt, o[0], o[1], o[2]), dd = aplicar(Mt, d[0], d[1], d[2]);
          let tm = Infinity, km = -1;
          for (let k = 0; k < sup.length; k++) { const t = sup[k].t(oo, dd); if (t < tm) { tm = t; km = k; } }
          if (km < 0) continue;
          const su = sup[km];
          const nm = su.n([oo[0] + dd[0] * tm, oo[1] + dd[1] * tm, oo[2] + dd[2] * tm]);
          const nw = aplicar(M, nm[0], nm[1], nm[2]);
          const v = 0.12 + 0.88 * Math.max(0, nw[0] * L[0] + nw[1] * L[1] + nw[2] * L[2]);
          const z = o[2] + d[2] * tm;
          porZ(grade, zb, x, y, z, daRampa(q.rampa, v * su.ganho, 1), su.tom ?? (v > 0.6 ? 'tinta-2' : 'tinta-3'), 0);
        }
      }
    }

    // arestas: trechos de ~meia célula, cada um com a sua visibilidade e o seu tom
    const ordenados = s.map(([a, b, forte, o = {}]) => ({ a, b, forte, o, z: (aplicar(M, ...a)[2] + aplicar(M, ...b)[2]) / 2 }))
      .sort((u, v) => (u.forte - v.forte) || (u.z - v.z));
    for (const { a, b, forte, o } of ordenados) {
      const A = proj(a), B = proj(b);
      const passos = Math.max(1, Math.ceil(Math.hypot(B.sx - A.sx, (B.sy - A.sy) * 2) / 1.4));
      let ant = a, antP = A;
      for (let k = 1; k <= passos; k++) {
        const t = k / passos;
        const x = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
        const X = proj(x);
        const meio = [(ant[0] + x[0]) / 2, (ant[1] + x[1]) / 2, (ant[2] + x[2]) / 2];
        const ve = o.semOclusao || visivel(meio);
        const z = (antP.z + X.z) / 2;
        if (ve) {
          const tom = o.tom ?? tomDaProfundidade(zn(z), forte ? 1 : 0);
          const fino = o.fino && tom === 'tinta' ? 'tinta-2' : tom;
          tracar(grade, zb, antP, X, fino, { folga: forte ? 0.15 : 0.02, pontilhado: o.pontilhado ?? 0 });
        } else if (forte && q.escondidas === 'fraco') {
          tracar(grade, zb, antP, X, 'tinta-3', { car: '·', folga: -0.5, pontilhado: 2 });
        }
        ant = x; antP = X;
      }
    }
    for (const [x, car, tom, sempre] of p) {
      const P = proj(x);
      const px = Math.floor(P.sx), py = Math.floor(P.sy);
      if (car) {
        if (!sempre && !visivel(x)) continue;
        porZ(grade, zb, px, py, P.z + 0.5, car, tom ?? tomDaProfundidade(zn(P.z), 1), 10);
        continue;
      }
      // nó da rede: o glifo pela profundidade
      const zz = zn(P.z);
      const c = zz > 0.62 ? '●' : zz > 0.32 ? '•' : '·';
      porZ(grade, zb, px, py, P.z + 0.5, c, tomDaProfundidade(zz), 10);
    }
  },
});

