// Efeito "pilha": pilha de cortes. Planos em perspectiva, cada um com o contorno do corte do
// fantoma sintético (efeitos/tres-d.mjs) naquele plano; um plano "ativo" percorre a pilha,
// como quem rola os cortes de uma série. O ativo é o único em tinta e é opaco: mostra o corte
// cheio (densidade na rampa, janela `centro` ± `largura`/2) e esconde o que está atrás dele.
// Os outros são de vidro: só a moldura e o contorno, em tinta-2 os da frente e em tinta-3 os
// do fundo. O achado do fantoma (um elipsoide pequeno) sai em terracota, numa célula, quando
// o ativo passa por ele (o parado mostra esse plano).
//
// Arranjos (`plano`):
//   axial    — planos deitados, empilhados na vertical;
//   coronal  — planos de pé, um atrás do outro;
//   sagital  — planos de pé, de lado;
//   leque    — páginas presas numa lombada (a aresta de baixo, deitada) que se abrem para
//              trás, como um livro folheado: cada página é um corte oblíquo do fantoma;
//   tres     — três planos ortogonais (axial, coronal, sagital) que se cruzam num ponto, com
//              as linhas de cruzamento tracejadas: a reconstrução multiplanar. Um por vez
//              fica ativo e desliza; o cruzamento anda junto.
// `espaco` afasta os planos (a explodida) e `deslocamento` empurra cada um para o lado.
//
// Profundidade de verdade: cada célula de cada plano é achada pelo raio da célula (sem
// buracos) com a sua profundidade; o contorno é a troca de rótulo (conjunto de elipsoides)
// entre células vizinhas do mesmo plano. Na célula, o contorno de vidro só passa por cima do
// ativo se estiver na frente dele; molduras atrás do ativo somem.
//
// Laço exato: em `volta` quadros a vista balança uma vez e o ativo vai e volta na pilha.
// Reação: ponteiro inclina; rolagem gira. Parado: três-quartos, ativo no plano do achado.

import { registrar, por } from '../motor/nucleo.mjs';
import {
  vista, enquadrar, raioDaCelula, matrizDaVista, transpor, aplicar, projetar, zbuffer,
  tracar, rotuloDoFantoma, densidadeDoRotulo, ACHADO_DO_FANTOMA, FANTOMA, daRampa,
} from './tres-d.mjs';
import { limitar } from './_comum.mjs';

const TAU = Math.PI * 2;
const objetoParaFantoma = (x, y, z) => [x, z, y];
const ACHADO = (() => { const e = FANTOMA[ACHADO_DO_FANTOMA]; return objetoParaFantoma(e[4], e[5], e[6]); })();

// Plano: origem c, eixos u e v (unitários) com meia-largura mu, mv; a e b andam em
// [a0, 1] × [b0, 1] (−1 = plano inteiro; 0 = meia página, presa na origem).
const P = (c, u, v, mu, mv, a0 = -1, b0 = -1) => ({ c, u, v, mu, mv, a0, b0 });

// Cruzamento dos três planos do arranjo `tres` no quadro: o do ativo desliza.
function cruzamento(q, f, parado, ativo) {
  if (parado) return [ACHADO[0], ACHADO[1], ACHADO[2]];
  const base = Number.isFinite(q.corte) ? (limitar(q.corte, 0, 1) - 0.5) * 2 * 0.78 : 0;
  const c = [base, base, base];
  // cada plano é ativo num terço da volta; nele, desliza ida e volta (sen, laço exato)
  const g = (f * 3 + 0.5) % 1;
  const s = 0.42 * Math.sin(TAU * g);
  const eixo = ativo === 0 ? 1 : ativo === 1 ? 2 : 0; // axial anda em y, coronal em z, sagital em x
  c[eixo] += s;
  return c;
}

function planosDe(q, c3) {
  const lista = [];
  const n = Math.max(1, Math.round(q.planos));
  const meio = (n - 1) / 2;
  const alcance = 0.78 * q.espaco;
  const nivel = (k) => (n === 1 ? 0 : ((k - meio) / meio) * alcance);
  const lado = (k) => (n === 1 ? 0 : ((k - meio) / meio) * q.deslocamento);
  if (q.plano === 'tres') {
    const [cx, cy, cz] = c3;
    lista.push(P([0, cy, 0], [1, 0, 0], [0, 0, 1], 0.95, 0.95)); // axial
    lista.push(P([0, 0, cz], [1, 0, 0], [0, 1, 0], 0.95, 0.9));  // coronal
    lista.push(P([cx, 0, 0], [0, 0, 1], [0, 1, 0], 0.95, 0.9));  // sagital
    return lista;
  }
  for (let k = 0; k < n; k++) {
    const s = nivel(k), d = lado(k);
    if (q.plano === 'coronal') lista.push(P([d, 0, s], [1, 0, 0], [0, 1, 0], 0.95, 0.88));
    else if (q.plano === 'sagital') lista.push(P([s, 0, d], [0, 0, 1], [0, 1, 0], 0.98, 0.88));
    else if (q.plano === 'leque') {
      // páginas presas na lombada (y = −0,92, ao longo de x), de pé a deitadas para trás
      const fi = n === 1 ? 0 : (k / (n - 1) - 0.5) * q.abertura;
      lista.push(P([0, -0.92, 0.02], [1, 0, 0], [0, Math.cos(fi), -Math.sin(fi)], 0.95, 1.86, -1, 0));
    } else lista.push(P([d, s, 0], [1, 0, 0], [0, 0, 1], 0.95, 0.98)); // axial
  }
  return lista;
}

// Índice do plano ativo: vai e volta na pilha uma vez por volta (degraus, como a rolagem
// dos cortes); `corte` numérico fixa o plano. Em `tres`, um terço da volta para cada.
function ativoDe(q, n, f, parado, perto) {
  // degraus deslocados meio passo: a troca de plano nunca cai na emenda do laço
  if (q.plano === 'tres') return parado ? 0 : Math.floor(f * 3 + 0.5) % 3;
  if (Number.isFinite(q.corte)) return Math.round(limitar(q.corte, 0, 1) * (n - 1));
  if (n === 1) return 0;
  if (parado) return perto;
  const passos = 2 * (n - 1);
  const k = Math.floor(f * passos + 0.5) % passos;
  return k < n ? k : passos - k;
}

registrar('pilha', {
  // plano: axial | coronal | sagital | leque | tres; planos: quantos; espaco: afastamento
  //   (1 = a pilha cobre o fantoma); deslocamento: empurrão lateral por plano (explodida);
  //   abertura: radianos entre a primeira e a última página do leque.
  // corte: null (o ativo anda) ou 0..1 (fixo; em tres, onde os planos se cruzam); centro,
  //   largura: janela da densidade do ativo; rampa: densidade do ativo.
  // volta, modo, guinada, balanco, inclinacao, guinadaParada, puxao, giroRolagem: a vista
  //   (efeitos/tres-d.mjs); preenche, distancia: o enquadramento.
  padrao: {
    plano: 'axial', planos: 9, espaco: 1, deslocamento: 0, abertura: 1.6, corte: null,
    centro: 0.3, largura: 0.5, rampa: ' ·:-=+*#',
    volta: 120, modo: 'balanco', guinada: 0.6, balanco: 0.32, inclinacao: 0.5, guinadaParada: 0.6,
    fracaoParada: 0, puxao: 0.2, giroRolagem: 1, preenche: 0.86, distancia: 6,
  },
  predefinicoes: {
    axial: {},
    coronal: { plano: 'coronal', planos: 8, guinada: 0.75, inclinacao: 0.32, guinadaParada: 0.75 },
    leque: { plano: 'leque', planos: 7, guinada: 0.95, balanco: 0.2, inclinacao: 0.28, guinadaParada: 0.95 },
    explodida: { plano: 'axial', planos: 5, espaco: 1.6, deslocamento: 0.4, inclinacao: 0.55 },
    multiplanar: { plano: 'tres', guinada: 0.68, balanco: 0.28, inclinacao: 0.42, guinadaParada: 0.68 },
  },
  desenhar(grade, ctx) {
    const q = ctx.params;
    const { cols, linhas } = grade;
    if (cols < 1 || linhas < 1) return;
    const vi = vista(ctx, grade);
    // ativo de `tres` antes dos planos (o cruzamento depende dele)
    const ativo3 = q.plano === 'tres' ? ativoDe(q, 3, vi.f, ctx.parado, 0) : 0;
    const c3 = q.plano === 'tres' ? cruzamento(q, vi.f, ctx.parado, ativo3) : null;
    const planos = planosDe(q, c3);
    const n = planos.length;
    // o achado é um ponto: aparece só no plano mais perto dele, quando esse é o ativo (o
    // parado mostra esse plano)
    const ach = planos.map((p) => achadoNoPlano(p));
    let perto = 0;
    for (let k = 1; k < n; k++) if (ach[k].dist < ach[perto].dist) perto = k;
    const ativo = q.plano === 'tres' ? ativo3 : ativoDe(q, n, vi.f, ctx.parado, perto);

    // enquadramento: os cantos dos planos (em tres, na posição do centro), nos extremos do
    // balanço; estável no laço inteiro
    const cantos = [];
    const fixos = q.plano === 'tres' ? planosDe(q, [0, 0, 0]) : planos;
    for (const p of fixos) {
      for (const [a, b] of [[p.a0, p.b0], [1, p.b0], [1, 1], [p.a0, 1]]) cantos.push(pontoDe(p, a, b));
    }
    const vistas = [-1, -0.5, 0, 0.5, 1].map((s) => matrizDaVista({
      guinada: q.guinada + s * (q.modo === 'balanco' ? q.balanco : 0), inclinacao: q.inclinacao,
    }));
    vistas.push(matrizDaVista({ guinada: q.guinadaParada, inclinacao: q.inclinacao }));
    const cam = enquadrar(cols, linhas, cantos, vistas, { preenche: q.preenche, distancia: q.distancia });

    const M = matrizDaVista(vi);
    const Mt = transpor(M);
    const N = cols * linhas;
    // profundidade de cada plano (centro), normalizada: 1 = o mais perto
    const zc = planos.map((p) => aplicar(M, ...pontoDe(p, (p.a0 + 1) / 2, (p.b0 + 1) / 2))[2]);
    const z0 = Math.min(...zc), z1 = Math.max(...zc);
    const zn = (k) => (z1 - z0 < 1e-6 ? 1 : (zc[k] - z0) / (z1 - z0));
    const tomVidro = (k) => (zn(k) >= 0.5 ? 'tinta-2' : 'tinta-3');

    // o ativo: rótulo e profundidade
    const rotA = new Int32Array(N), zA = new Float32Array(N), densA = new Float32Array(N);
    rotularPlano(planos[ativo], cam, Mt, rotA, zA, densA, cols, linhas);
    // vidro: o contorno mais perto em cada célula
    const zI = new Float32Array(N).fill(-Infinity);
    const carI = new Array(N), tomI = new Array(N);
    const rot = new Int32Array(N), zp = new Float32Array(N), dens = new Float32Array(N);
    for (let k = 0; k < n; k++) {
      if (k === ativo) continue;
      rotularPlano(planos[k], cam, Mt, rot, zp, dens, cols, linhas);
      const tom = tomVidro(k);
      for (let y = 0; y < linhas; y++) {
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x;
          const r = rot[i];
          if (r < 0) continue;
          const dir = x + 1 < cols ? rot[i + 1] : -1, baixo = y + 1 < linhas ? rot[i + cols] : -1;
          const esq = x > 0 ? rot[i - 1] : -1, cima = y > 0 ? rot[i - cols] : -1;
          const trocaH = (dir >= 0 && dir !== r) || (esq >= 0 && esq !== r && esq !== 0 && r === 0);
          const trocaV = (baixo >= 0 && baixo !== r) || (cima >= 0 && cima !== r && cima !== 0 && r === 0);
          // no vidro, só o contorno de fora (a troca com o vazio): o miolo fica para o ativo
          const externo = r === 0 || dir === 0 || esq === 0 || baixo === 0 || cima === 0;
          if (!(trocaH || trocaV) || !externo || zp[i] <= zI[i]) continue;
          zI[i] = zp[i];
          carI[i] = '·';
          tomI[i] = tom;
        }
      }
    }
    // composição: o ativo é opaco; o vidro só passa por cima dele se estiver na frente
    const zb = zbuffer(grade);
    for (let y = 0; y < linhas; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        if (rotA[i] >= 0) zb[i] = zA[i];
        const v = rotA[i] >= 0 ? limitar((densA[i] - (q.centro - q.largura / 2)) / q.largura, 0, 1) : 0;
        const c = rotA[i] >= 0 ? daRampa(q.rampa, v, 0) : ' ';
        // o corte cheio do ativo ganha sempre; no resto, o vidro da frente passa por cima
        if (c !== ' ') { por(grade, x, y, c, 'tinta'); continue; }
        const naFrente = zI[i] > -Infinity && (rotA[i] < 0 || zI[i] > zA[i] + 0.02);
        if (naFrente) { por(grade, x, y, carI[i], tomI[i]); continue; }
        // o plano ativo é opaco: onde o corte é vazio, um ponto ralo mantém o plano de pé
        if (rotA[i] >= 0 && (x + 2 * y) % 4 === 0) por(grade, x, y, '·', 'tinta-3');
      }
    }

    // molduras: atrás do ativo somem (o zbuffer começa com a profundidade dele)
    const caixa = ['axial', 'coronal', 'sagital'].includes(q.plano) && !q.deslocamento && n > 1;
    const projetarP = (p, a, b) => { const w = aplicar(M, ...pontoDe(p, a, b)); return projetar(cam, w[0], w[1], w[2]); };
    const cantosDe = (p) => [[p.a0, p.b0], [1, p.b0], [1, 1], [p.a0, 1]].map(([a, b]) => projetarP(p, a, b));
    const ordem = [...Array(n).keys()].filter((k) => k !== ativo);
    for (const k of ordem) {
      if (caixa && k !== 0 && k !== n - 1) continue;
      const c4 = cantosDe(planos[k]);
      // na página do leque, a aresta da lombada fica para a lombada comum
      for (let j = 0; j < 4; j++) {
        if (q.plano === 'leque' && j === 0) continue;
        tracar(grade, zb, c4[j], c4[(j + 1) % 4], tomVidro(k), { folga: 0.03 });
      }
    }
    if (caixa) {
      const a = cantosDe(planos[0]), b = cantosDe(planos[n - 1]);
      for (let j = 0; j < 4; j++) tracar(grade, zb, a[j], b[j], 'tinta-3', { folga: 0.03 });
    }
    if (q.plano === 'tres') {
      // linhas de cruzamento (o cursor da reconstrução multiplanar), tracejadas
      const [cx, cy, cz] = c3;
      const seg = [[[-0.95, cy, cz], [0.95, cy, cz]], [[cx, -0.9, cz], [cx, 0.9, cz]], [[cx, cy, -0.95], [cx, cy, 0.95]]];
      for (const [a, b] of seg) {
        const A = aplicar(M, ...a), B = aplicar(M, ...b);
        tracar(grade, zb, projetar(cam, ...A), projetar(cam, ...B), 'tinta-2', { folga: 0.05, pontilhado: 2 });
      }
    }
    // a moldura do ativo, por cima
    const c4 = cantosDe(planos[ativo]);
    for (let j = 0; j < 4; j++) tracar(grade, zb, c4[j], c4[(j + 1) % 4], 'tinta', { folga: 0.05 });
    if (q.plano === 'leque') {
      const p = planos[0];
      tracar(grade, zb, projetarP(p, -1, 0), projetarP(p, 1, 0), 'tinta-2', { folga: 0.05 });
    }

    const a = ach[ativo];
    if (a.dentro && a.dist < (q.plano === 'tres' ? 0.06 : 1) && (ativo === perto || q.plano === 'tres')) {
      const w = aplicar(M, ...a.ponto);
      const Pp = projetar(cam, w[0], w[1], w[2]);
      por(grade, Math.floor(Pp.sx), Math.floor(Pp.sy), '●', 'achado');
    }
  },
});

// Distância do centro do achado ao plano, o pé da perpendicular e se ele cai no plano.
function achadoNoPlano(p) {
  const A = ACHADO;
  const nx = p.u[1] * p.v[2] - p.u[2] * p.v[1];
  const ny = p.u[2] * p.v[0] - p.u[0] * p.v[2];
  const nz = p.u[0] * p.v[1] - p.u[1] * p.v[0];
  const rx = A[0] - p.c[0], ry = A[1] - p.c[1], rz = A[2] - p.c[2];
  const s = rx * nx + ry * ny + rz * nz;
  const ponto = [A[0] - s * nx, A[1] - s * ny, A[2] - s * nz];
  const a = (rx * p.u[0] + ry * p.u[1] + rz * p.u[2]) / p.mu;
  const b = (rx * p.v[0] + ry * p.v[1] + rz * p.v[2]) / p.mv;
  return { dist: Math.abs(s), ponto, dentro: a >= p.a0 && a <= 1 && b >= p.b0 && b <= 1 };
}

function pontoDe(p, a, b) {
  return [
    p.c[0] + p.u[0] * a * p.mu + p.v[0] * b * p.mv,
    p.c[1] + p.u[1] * a * p.mu + p.v[1] * b * p.mv,
    p.c[2] + p.u[2] * a * p.mu + p.v[2] * b * p.mv,
  ];
}

// Rótulo de cada célula no plano p (−1 fora do plano), a profundidade (z da câmera) e a
// densidade do fantoma ali.
function rotularPlano(p, cam, Mt, rot, zp, dens, cols, linhas) {
  // normal do plano no objeto
  const nx = p.u[1] * p.v[2] - p.u[2] * p.v[1];
  const ny = p.u[2] * p.v[0] - p.u[0] * p.v[2];
  const nz = p.u[0] * p.v[1] - p.u[1] * p.v[0];
  const pc = nx * p.c[0] + ny * p.c[1] + nz * p.c[2];
  for (let y = 0; y < linhas; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      rot[i] = -1;
      const { o, d } = raioDaCelula(cam, x, y);
      const oo = aplicar(Mt, o[0], o[1], o[2]), dd = aplicar(Mt, d[0], d[1], d[2]);
      const den = nx * dd[0] + ny * dd[1] + nz * dd[2];
      if (Math.abs(den) < 1e-6) continue;
      const t = (pc - (nx * oo[0] + ny * oo[1] + nz * oo[2])) / den;
      if (t <= 0) continue;
      const px = oo[0] + dd[0] * t - p.c[0], py = oo[1] + dd[1] * t - p.c[1], pz = oo[2] + dd[2] * t - p.c[2];
      const a = (px * p.u[0] + py * p.u[1] + pz * p.u[2]) / p.mu;
      const b = (px * p.v[0] + py * p.v[1] + pz * p.v[2]) / p.mv;
      if (a < p.a0 || a > 1 || b < p.b0 || b > 1) continue;
      const f = objetoParaFantoma(px + p.c[0], py + p.c[1], pz + p.c[2]);
      const r = rotuloDoFantoma(f[0], f[1], f[2]);
      rot[i] = r;
      zp[i] = o[2] + d[2] * t;
      dens[i] = densidadeDoRotulo(r);
    }
  }
}
