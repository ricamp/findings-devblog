// Peças comuns da família ASCII 3D (volume, pilha, malha, relevo): rotação, câmera com a
// célula de terminal corrigida, raio por célula, z-buffer, rampa de luz, traço de linha e
// o fantoma sintético (elipsoides no espírito do Shepp-Logan 3D de Kak e Slaney).
//
// Convenções
//   Espaço de mundo: x para a direita, y para cima, z para quem olha. A câmera fica em
//   (0, 0, distancia) olhando para −z; distancia 0 = projeção paralela.
//   A célula é alta: uma linha vale ASPECTO (2) colunas de largura. Toda conta de tela
//   passa por aqui, para a esfera sair redonda e não ovo.
//   Vista: o objeto gira em y (guinada) e depois inclina em x (inclinação positiva mostra
//   o topo). Mundo = Rx(inclinacao) · Ry(guinada) · Rbase · objeto.
//   Tempo: a volta tem `volta` quadros lógicos inteiros; a fração f = (quadro mod volta) /
//   volta. Tudo o que anda é função de f, então o quadro `volta` é o quadro 0: laço exato.
//
// Nada aqui guarda estado entre quadros nem usa acaso.

import { ponteiroNaGrade, limitar } from './_comum.mjs';

export const ASPECTO = 2;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- matrizes 3 × 3

// Linha a linha: [m00, m01, m02, m10, ..., m22].
export function multiplicar(a, b) {
  const m = new Array(9);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      m[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
    }
  }
  return m;
}
export const rotX = (a) => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; };
export const rotY = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
export const rotZ = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
export const transpor = (m) => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];

// Matriz de mundo da vista: Rx(inclinacao) · Ry(guinada) · base.
export function matrizDaVista({ guinada, inclinacao }, base = null) {
  const m = multiplicar(rotX(inclinacao), rotY(guinada));
  return base ? multiplicar(m, base) : m;
}

export function aplicar(m, x, y, z) {
  return [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z];
}

export function normalizar(v) {
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
}

// ---------------------------------------------------------------- tempo e vista

// Fração da volta em [0, 1): exata para quadro inteiro (também negativo, como nos quadros
// da emenda do vídeo).
export function fracaoDaVolta(quadro, volta) {
  const v = Math.max(1, Math.round(volta));
  const q = Math.round(quadro);
  return (((q % v) + v) % v) / v;
}

// Vista do quadro. params: volta, modo ('giro' = uma volta inteira por laço; 'balanco' = vai
// e volta `balanco` radianos em torno de `guinada`), guinada, inclinacao, guinadaParada,
// fracaoParada, puxao (radianos que o ponteiro inclina, de cada lado), giroRolagem (voltas
// por página rolada). Parado: guinada fixa em três-quartos, f = fracaoParada.
export function vista(ctx, grade) {
  const q = ctx.params;
  let guinada, f;
  if (ctx.parado) {
    f = q.fracaoParada ?? 0;
    guinada = q.guinadaParada;
  } else {
    f = fracaoDaVolta(ctx.quadro, q.volta);
    guinada = q.modo === 'balanco' ? q.guinada + q.balanco * Math.sin(TAU * f)
      : q.modo === 'giro' ? q.guinada + TAU * f
        : q.guinada; // tombo e fixo: quem gira é o objeto
  }
  let inclinacao = q.inclinacao;
  guinada += TAU * (ctx.entrada?.rolagem ?? 0) * (q.giroRolagem ?? 0);
  const p = ponteiroNaGrade(ctx.entrada, grade);
  // px, py em [−1, 1]: onde o ponteiro está na grade (0, 0 sem ponteiro). Além de inclinar a
  // vista, ele leva a luz junto (luzDe): a profundidade responde em dois sentidos.
  let px = 0, py = 0;
  if (p && q.puxao) {
    px = ((p.x + 0.5) / grade.cols - 0.5) * 2;
    py = ((p.y + 0.5) / grade.linhas - 0.5) * 2;
    guinada += px * q.puxao;
    inclinacao += py * q.puxao;
  }
  return { guinada, inclinacao, f, px, py };
}

// ---------------------------------------------------------------- câmera

// Câmera de um objeto de raio `raio` centrado na origem, ocupando `preenche` da menor
// dimensão (em largura de coluna: a altura da grade vale linhas · ASPECTO).
export function camera(cols, linhas, { raio = 1, preenche = 0.8, distancia = 5 } = {}) {
  const meia = Math.min(cols / 2, (linhas * ASPECTO) / 2);
  const esc = Math.max(1e-6, (meia * preenche) / raio);
  return { cols, linhas, esc, dist: distancia, cx: cols / 2, cy: linhas / 2 };
}

// Câmera que enquadra um conjunto de pontos (objeto) em todas as rotações dadas: a escala
// e o centro não respiram enquanto o objeto gira.
export function enquadrar(cols, linhas, pontos, rotacoes, { preenche = 0.86, distancia = 5 } = {}) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const m of rotacoes) {
    for (const [x, y, z] of pontos) {
      const w = aplicar(m, x, y, z);
      const k = distancia > 0 ? distancia / Math.max(1e-3, distancia - w[2]) : 1;
      const X = w[0] * k, Y = w[1] * k;
      if (X < x0) x0 = X;
      if (X > x1) x1 = X;
      if (Y < y0) y0 = Y;
      if (Y > y1) y1 = Y;
    }
  }
  if (!(x1 > x0)) { x0 = -1; x1 = 1; }
  if (!(y1 > y0)) { y0 = -1; y1 = 1; }
  const esc = Math.max(1e-6, Math.min((cols * preenche) / (x1 - x0), (linhas * ASPECTO * preenche) / (y1 - y0)));
  return {
    cols, linhas, esc, dist: distancia,
    cx: cols / 2 - ((x0 + x1) / 2) * esc,
    cy: linhas / 2 + ((y0 + y1) / 2) * esc / ASPECTO,
  };
}

// Ponto de mundo → tela: sx, sy em células (fracionárias) e z (maior = mais perto).
export function projetar(cam, x, y, z) {
  const k = cam.dist > 0 ? cam.dist / Math.max(1e-3, cam.dist - z) : 1;
  return { sx: cam.cx + x * k * cam.esc, sy: cam.cy - (y * k * cam.esc) / ASPECTO, z };
}

// Raio de mundo pelo centro da célula (x, y): { o: origem, d: direção unitária }.
export function raioDaCelula(cam, x, y) {
  return raioDoPonto(cam, x + 0.5, y + 0.5);
}

// Raio por um ponto da tela em células fracionárias (a amostra dentro da célula).
export function raioDoPonto(cam, sx, sy) {
  const u = (sx - cam.cx) / cam.esc;
  const v = (-(sy - cam.cy) * ASPECTO) / cam.esc;
  if (cam.dist > 0) return { o: [0, 0, cam.dist], d: normalizar([u, v, -cam.dist]) };
  return { o: [u, v, 50], d: [0, 0, -1] };
}

// ---------------------------------------------------------------- luz e rampa

// Direção da luz (presa à câmera). Com a vista (`vi`, de vista()), o ponteiro desloca a
// luz para o lado dele: `puxaLuz` de cada lado (0 desliga).
export function luzDe(params, vi = null) {
  const k = params.puxaLuz ?? 0.8;
  const dx = vi ? (vi.px ?? 0) * k : 0, dy = vi ? -(vi.py ?? 0) * k : 0;
  return normalizar([(params.luzX ?? -0.5) + dx, (params.luzY ?? 0.6) + dy, params.luzZ ?? 0.65]);
}

// Rampa de luz ordenada pela tinta de cada glifo na JetBrains Mono (área do contorno sobre a
// célula, medida com fontTools): · .027, - .032, : .051, = .087, + .091, * .133, # .187,
// % .211, @ .254. A rampa antiga punha `:` antes de `-` e misturava `%` com `=` na faixa
// clara, o que fazia ruído de glifo.
export const RAMPA_LUZ = ' ·-:=+*#%@';

// Tom pela profundidade: z normalizado em [0, 1] (1 = o mais perto). Três níveis: a frente em
// tinta, o meio em tinta-2, o fundo em tinta-3. `sobe` = 1 promove um nível (arestas fortes).
export function tomDaProfundidade(zn, sobe = 0) {
  const n = (zn >= 0.62 ? 2 : zn >= 0.32 ? 1 : 0) + sobe;
  return n >= 2 ? 'tinta' : n === 1 ? 'tinta-2' : 'tinta-3';
}

// Glifo de contorno de silhueta pela forma, não pela densidade ("ASCII characters are not
// pixels"): (nx, ny) aponta da célula para dentro do objeto, em unidades de coluna (y para
// baixo, já corrigido pelo aspecto); c é a cobertura da célula em [0, 1]. A borda é
// perpendicular a n: deitada dá _ - ‾ conforme onde ela corta a célula; em pé dá ( ou ) (ou
// | com `reto`); no meio, / ou \.
export function glifoDeBorda(nx, ny, c, reto = false) {
  const a = Math.atan2(ny, nx) * (180 / Math.PI); // 0 = dentro à direita; 90 = dentro abaixo
  const deitada = Math.abs(Math.abs(a) - 90) < 32;
  if (deitada) {
    // a borda corta a célula na altura em que a cobertura acaba
    if (a > 0) return c < 0.42 ? '_' : c < 0.8 ? '-' : '‾'; // topo do objeto
    return c < 0.42 ? '‾' : c < 0.8 ? '-' : '_';            // base do objeto
  }
  if (Math.abs(a) < 24) return reto ? '|' : '(';
  if (Math.abs(a) > 156) return reto ? '|' : ')';
  if (a > 0) return a < 90 ? '/' : '\\';
  return a > -90 ? '\\' : '/';
}

// Traço em ASCII (_ - ‾ / \ |) entre dois pontos projetados, com z-buffer. Deitado, uma célula
// por coluna e o glifo diz em que altura da célula a linha passa; em pé, | por linha; perto
// da diagonal da célula alta, / ou \. `visivel(x, y, z)` pode recusar a célula (linha
// escondida). Devolve quantas células escreveu.
export function tracarAscii(grade, zb, a, b, tom, { folga = 0.02, tomDe = null, visivel = null } = {}) {
  const dx = b.sx - a.sx, dy = b.sy - a.sy;
  const ax = Math.abs(dx), ay = Math.abs(dy);
  let n = 0;
  const pore = (x, y, z, c) => {
    if (visivel && !visivel(x, y, z)) return;
    if (porZ(grade, zb, x, y, z, c, tomDe ? tomDe(z) : tom, folga)) n++;
  };
  if (ay <= ax * 0.6) {
    // deitado: por coluna
    if (ax < 1e-9) { pore(Math.floor(a.sx), Math.floor(a.sy), a.z, '-'); return n; }
    const ini = Math.floor(Math.min(a.sx, b.sx)), fim = Math.floor(Math.max(a.sx, b.sx));
    for (let k = ini; k <= fim; k++) {
      const t = Math.max(0, Math.min(1, (k + 0.5 - a.sx) / dx));
      const y = a.sy + dy * t, fy = y - Math.floor(y);
      pore(k, Math.floor(y), a.z + (b.z - a.z) * t, fy < 0.3 ? '‾' : fy < 0.7 ? '-' : '_');
    }
    return n;
  }
  const g = ay > ax * 2.6 ? '|' : (dx > 0) === (dy > 0) ? '\\' : '/';
  const ini = Math.floor(Math.min(a.sy, b.sy)), fim = Math.floor(Math.max(a.sy, b.sy));
  for (let k = ini; k <= fim; k++) {
    const t = Math.max(0, Math.min(1, (k + 0.5 - a.sy) / dy));
    pore(Math.floor(a.sx + dx * t), k, a.z + (b.z - a.z) * t, g);
  }
  return n;
}

// Valor de luz em [0, 1]: ambiente + Lambert + brilho (Blinn) com o olho em v.
export function iluminar(n, L, v, ambiente, brilho) {
  const dif = Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2]);
  let esp = 0;
  if (brilho > 0 && dif > 0) {
    const h = normalizar([L[0] + v[0], L[1] + v[1], L[2] + v[2]]);
    esp = Math.pow(Math.max(0, n[0] * h[0] + n[1] * h[1] + n[2] * h[2]), 28) * brilho;
  }
  return limitar(ambiente + (1 - ambiente) * dif + esp, 0, 1);
}

// Glifo da rampa para o valor v em [0, 1]. Com `minimo` ≥ 1, toda célula atingida mostra
// ao menos rampa[minimo]: o lado da sombra não some e a silhueta fica inteira.
export function daRampa(rampa, v, minimo = 1) {
  const r = rampa.length;
  const i = limitar(Math.floor(v * (r - 1) + 0.5), Math.min(minimo, r - 1), r - 1);
  return rampa[i];
}

// Tom de um valor de luz: claro em tinta, meio em tinta-2, sombra em tinta-3.
export function tomDaLuz(v, alto = 0.7, baixo = 0.3) {
  return v >= alto ? 'tinta' : v >= baixo ? 'tinta-2' : 'tinta-3';
}

// ---------------------------------------------------------------- z-buffer e traço

export function zbuffer(grade) {
  return new Float32Array(grade.cols * grade.linhas).fill(-Infinity);
}

// Glifo de linha pela inclinação na tela, em células: ╱ e ╲ vão de canto a canto da célula
// alta, então só servem perto de uma coluna por linha; mais deitado é ─, mais em pé é │.
export function glifoDaInclinacao(dx, dy) {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (ay < ax * 0.42) return '─';
  if (ay > ax * 2.4) return '│';
  return (dx > 0) === (dy > 0) ? '╲' : '╱';
}

// Escreve na célula se ela estiver mais perto (z maior) que o que já está lá.
export function porZ(grade, zb, x, y, z, car, tom, folga = 0) {
  if (x < 0 || y < 0 || x >= grade.cols || y >= grade.linhas) return false;
  const i = y * grade.cols + x;
  if (z + folga < zb[i]) return false;
  zb[i] = z;
  grade.car[i] = car;
  grade.tom[i] = TOM_INDICE[tom];
  return true;
}
const TOM_INDICE = { tinta: 0, 'tinta-2': 1, 'tinta-3': 2, achado: 3, chapa: 4, 'chapa-achado': 5 };

// Segmento entre dois pontos já projetados ({sx, sy, z}). `car` fixo ou, sem ele, o glifo
// da inclinação. `tomDe(z)` escolhe o tom pela profundidade, se dado.
//
// Deitada, a linha anda coluna a coluna e o glifo diz onde ela passa dentro da célula alta
// (‾ em cima, ─ no meio, _ embaixo); em pé, linha a linha (▏ à esquerda, │ no meio, ▕ à
// direita). Assim a escada de uma aresta quase reta fica lisa. Perto de 45° na célula, ╱ ╲.
export function tracar(grade, zb, a, b, tom, { car = null, folga = 0.02, tomDe = null, pontilhado = 0 } = {}) {
  const dx = b.sx - a.sx, dy = b.sy - a.sy;
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (!car && (ax >= 1 || ay >= 1) && (ay < ax * 0.42 || ay > ax * 2.4)) {
    const deitada = ay < ax * 0.42;
    const [p, r] = deitada ? [a.sx, b.sx] : [a.sy, b.sy];
    const ini = Math.floor(Math.min(p, r)), fim = Math.floor(Math.max(p, r));
    const d = r - p;
    for (let k = ini; k <= fim; k++) {
      if (pontilhado && (k % pontilhado) !== 0) continue;
      const t = Math.abs(d) < 1e-9 ? 0 : Math.max(0, Math.min(1, (k + 0.5 - p) / d));
      const z = a.z + (b.z - a.z) * t;
      if (deitada) {
        const y = a.sy + dy * t, fy = y - Math.floor(y);
        porZ(grade, zb, k, Math.floor(y), z, fy < 0.3 ? '‾' : fy < 0.7 ? '─' : '_', tomDe ? tomDe(z) : tom, folga);
      } else {
        const x = a.sx + dx * t, fx = x - Math.floor(x);
        porZ(grade, zb, Math.floor(x), k, z, fx < 0.3 ? '▏' : fx < 0.7 ? '│' : '▕', tomDe ? tomDe(z) : tom, folga);
      }
    }
    return;
  }
  const g = car ?? glifoDaInclinacao(dx, dy);
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy) * 1.0) * 2));
  let ultimo = -1;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = Math.floor(a.sx + dx * t), y = Math.floor(a.sy + dy * t);
    const c = y * grade.cols + x;
    if (c === ultimo) continue;
    ultimo = c;
    if (pontilhado && ((x + y) % pontilhado) !== 0) continue;
    const z = a.z + (b.z - a.z) * t;
    porZ(grade, zb, x, y, z, g, tomDe ? tomDe(z) : tom, folga);
  }
}

// ---------------------------------------------------------------- fantoma

// Elipsoides do fantoma 3D de Shepp-Logan (Kak e Slaney, intensidades da versão
// modificada): [intensidade, a, b, c, x0, y0, z0, φ em graus no plano xy]. Coordenadas do
// fantoma: x lateral, y anteroposterior, z craniocaudal. É uma figura geométrica
// inventada, não um exame. Duas mudanças para ler em caracteres: a casca de dentro é menor
// (o crânio fica com mais de uma célula de espessura) e o sexto (índice 5), o "achado", é
// um pouco maior que no original, para caber numa célula.
export const FANTOMA = [
  [1, 0.69, 0.92, 0.81, 0, 0, 0, 0],
  [-0.8, 0.6, 0.82, 0.73, 0, -0.0184, 0, 0],
  [-0.2, 0.11, 0.31, 0.22, 0.22, 0, 0, -18],
  [-0.2, 0.16, 0.41, 0.28, -0.22, 0, 0, 18],
  [0.1, 0.21, 0.25, 0.41, 0, 0.35, -0.15, 0],
  [0.1, 0.042, 0.042, 0.042, 0, 0.1, 0.25, 0],
  [0.1, 0.046, 0.046, 0.05, 0, -0.1, 0.25, 0],
  [0.1, 0.046, 0.023, 0.05, -0.08, -0.605, 0, 0],
  [0.1, 0.023, 0.023, 0.02, 0, -0.606, 0, 0],
  [0.1, 0.023, 0.046, 0.02, 0.06, -0.605, 0, 0],
];
export const ACHADO_DO_FANTOMA = 5;

// Forma pronta para conta: centro, inverso dos semieixos, cosseno e seno de φ.
const ELIPS = FANTOMA.map(([A, a, b, c, x0, y0, z0, fi]) => ({
  A, ia: 1 / a, ib: 1 / b, ic: 1 / c, x0, y0, z0,
  c: Math.cos((fi * Math.PI) / 180), s: Math.sin((fi * Math.PI) / 180),
}));

// Bits dos elipsoides que contêm o ponto (coordenadas do fantoma) e a densidade somada.
export function rotuloDoFantoma(x, y, z) {
  let bits = 0;
  for (let k = 0; k < ELIPS.length; k++) {
    const e = ELIPS[k];
    const dx = x - e.x0, dy = y - e.y0, dz = (z - e.z0) * e.ic;
    if (dz > 1 || dz < -1) continue;
    const u = (dx * e.c + dy * e.s) * e.ia, v = (-dx * e.s + dy * e.c) * e.ib;
    if (u * u + v * v + dz * dz <= 1) bits |= 1 << k;
  }
  return bits;
}
const DENS = new Float32Array(1 << FANTOMA.length);
for (let b = 0; b < DENS.length; b++) {
  let d = 0;
  for (let k = 0; k < FANTOMA.length; k++) if (b & (1 << k)) d += FANTOMA[k][0];
  DENS[b] = d;
}
export const densidadeDoRotulo = (bits) => DENS[bits];

// Interseção de um raio (o, d no espaço do fantoma) com o elipsoide k: { t, n } da entrada
// mais próxima com t > 0 (n = normal no espaço do fantoma), ou null. Com `saida`, devolve
// também a saída (t2).
export function cruzarElipsoide(k, o, d) {
  const e = ELIPS[k];
  const ox = o[0] - e.x0, oy = o[1] - e.y0, oz = o[2] - e.z0;
  // gira para os eixos do elipsoide e escala para a esfera unitária
  const pu = (ox * e.c + oy * e.s) * e.ia, pv = (-ox * e.s + oy * e.c) * e.ib, pw = oz * e.ic;
  const du = (d[0] * e.c + d[1] * e.s) * e.ia, dv = (-d[0] * e.s + d[1] * e.c) * e.ib, dw = d[2] * e.ic;
  const A = du * du + dv * dv + dw * dw;
  const B = 2 * (pu * du + pv * dv + pw * dw);
  const C = pu * pu + pv * pv + pw * pw - 1;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return null;
  const r = Math.sqrt(disc);
  let t = (-B - r) / (2 * A);
  const t2 = (-B + r) / (2 * A);
  if (t2 <= 0) return null;
  if (t <= 0) t = t2;
  // normal: gradiente de u² + v² + w², de volta aos eixos do fantoma
  const hu = (pu + du * t) * e.ia, hv = (pv + dv * t) * e.ib, hw = (pw + dw * t) * e.ic;
  const n = normalizar([hu * e.c - hv * e.s, hu * e.s + hv * e.c, hw]);
  return { t, t2, n };
}

// Entrada e saída (t1 ≤ t2, sem cortar em t > 0) do raio no elipsoide k, ou null: a corda
// t2 − t1 é o caminho do raio dentro dele (a projeção do fantoma soma A · corda).
export function cordaDoElipsoide(k, o, d) {
  const e = ELIPS[k];
  const ox = o[0] - e.x0, oy = o[1] - e.y0, oz = o[2] - e.z0;
  const pu = (ox * e.c + oy * e.s) * e.ia, pv = (-ox * e.s + oy * e.c) * e.ib, pw = oz * e.ic;
  const du = (d[0] * e.c + d[1] * e.s) * e.ia, dv = (-d[0] * e.s + d[1] * e.c) * e.ib, dw = d[2] * e.ic;
  const A = du * du + dv * dv + dw * dw;
  const B = 2 * (pu * du + pv * dv + pw * dw);
  const C = pu * pu + pv * pv + pw * pw - 1;
  const disc = B * B - 4 * A * C;
  if (disc <= 0) return null;
  const r = Math.sqrt(disc);
  return [(-B - r) / (2 * A), (-B + r) / (2 * A)];
}

// Do espaço do objeto (y para cima) para o do fantoma (z craniocaudal para cima; y
// anteroposterior para quem olha) e de volta.
export const objetoParaFantoma = (x, y, z) => [x, z, y];
export const fantomaParaObjeto = (x, y, z) => [x, z, y];
