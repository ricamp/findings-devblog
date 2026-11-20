// Efeito "volume": um sólido girando devagar, desenhado só com caracteres. Um raio por
// célula (com a célula alta corrigida, efeitos/tres-d.mjs) acha a superfície mais próxima;
// a normal contra a luz escolhe o glifo numa rampa ordenada pela tinta de cada glifo
// (RAMPA_LUZ). A silhueta é desenhada pela forma, não pela densidade: nas células da borda
// o raio é amostrado 3 × 5 vezes, a cobertura e o lado em que ela cai escolhem um glifo de
// contorno orientado (`( ) / \ _ - ‾`), como no "ASCII characters are not pixels".
// Com `chao`, a sombra projetada do sólido cai num chão que não se desenha (pontilhado ralo).
//
// Formas (`forma`):
//   esfera     — a luz balança em volta (`luzBalanco`): o terminador anda como uma fase de
//                lua e a sombra no chão vai junto; sem textura que pisque;
//   elipsoide  — elipsoide de três eixos, inclinado: a silhueta muda enquanto gira;
//   toro       — anel de tubo R1 e raio R2 (só a razão importa), por marcha de esfera na
//                distância assinada. Em `precessao`, o eixo do anel fica sempre a
//                `inclinaEixo` da linha de visada e dá a volta em torno dela, enquanto o
//                anel gira no próprio eixo (`voltasGiro`): ele nunca fica de perfil achatado;
//   capsula    — cilindro de pontas redondas, inclinado (`A`), girando;
//   fantoma    — elipsoides aninhados de densidades diferentes, no espírito do fantoma de
//                Shepp-Logan 3D, lidos como corte translúcido: por dentro, a projeção (a soma
//                da densidade ao longo do raio, com pesos que separam as estruturas), e por
//                cima o contorno de cada elipsoide, no tom da profundidade do seu centro. O
//                achado é um ponto.
//
// Laço exato: uma volta inteira em `volta` quadros (120 = 10 s). Reação: o ponteiro
// inclina a vista (até `puxao` radianos de cada lado) e desloca a luz para o lado dele
// (`puxaLuz`); a rolagem da página gira (`giroRolagem` voltas por página). Parado:
// três-quartos (guinadaParada, fracaoParada).

import { registrar, por } from '../motor/nucleo.mjs';
import {
  vista, camera, enquadrar, raioDoPonto, matrizDaVista, multiplicar, rotX, rotY, rotZ, transpor,
  aplicar, normalizar, luzDe, iluminar, daRampa, tomDaLuz, tomDaProfundidade, glifoDeBorda,
  cordaDoElipsoide, projetar, FANTOMA, ACHADO_DO_FANTOMA, objetoParaFantoma,
  fantomaParaObjeto, ASPECTO, RAMPA_LUZ,
} from './tres-d.mjs';

const TAU = Math.PI * 2;
const SX = 3, SY = 5; // amostras por célula na borda (a célula é alta)

// Semieixos do elipsoide (objeto).
const ELIPSOIDE = [1, 0.56, 0.74];

// Esfera/elipsoide alinhado aos eixos com semieixos r: { t, n, p } ou null.
function cruzarEixos(o, d, r) {
  const pu = o[0] / r[0], pv = o[1] / r[1], pw = o[2] / r[2];
  const du = d[0] / r[0], dv = d[1] / r[1], dw = d[2] / r[2];
  const A = du * du + dv * dv + dw * dw;
  const B = 2 * (pu * du + pv * dv + pw * dw);
  const C = pu * pu + pv * pv + pw * pw - 1;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return null;
  const t = (-B - Math.sqrt(disc)) / (2 * A);
  if (t <= 0) return null;
  const p = [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
  return { t, p, n: normalizar([p[0] / (r[0] * r[0]), p[1] / (r[1] * r[1]), p[2] / (r[2] * r[2])]) };
}

// Toro de eixo z, anel R e tubo r, por marcha de esfera a partir da esfera envolvente.
function cruzarToro(o, d, R, r) {
  const lim = R + r;
  const b = o[0] * d[0] + o[1] * d[1] + o[2] * d[2];
  const c = o[0] * o[0] + o[1] * o[1] + o[2] * o[2] - lim * lim;
  const disc = b * b - c;
  if (disc < 0) return null;
  let t = Math.max(0, -b - Math.sqrt(disc));
  const tMax = -b + Math.sqrt(disc);
  for (let i = 0; i < 64 && t <= tMax; i++) {
    const x = o[0] + d[0] * t, y = o[1] + d[1] * t, z = o[2] + d[2] * t;
    const q = Math.hypot(x, y) - R;
    const dist = Math.hypot(q, z) - r;
    if (dist < 0.0015) {
      const h = Math.hypot(x, y) || 1;
      const n = normalizar([x - (R * x) / h, y - (R * y) / h, z]);
      return { t, p: [x, y, z], n };
    }
    t += dist * 0.9;
  }
  return null;
}

// Cápsula de eixo y (segmento de −h a h) e raio r (a conta da cápsula de Íñigo Quílez).
function cruzarCapsula(o, d, h, r) {
  const oay = o[1] + h;
  const baba = 4 * h * h, bard = 2 * h * d[1], baoa = 2 * h * oay;
  const rdoa = d[0] * o[0] + d[1] * oay + d[2] * o[2];
  const oaoa = o[0] * o[0] + oay * oay + o[2] * o[2];
  const a = baba - bard * bard;
  let b = baba * rdoa - baoa * bard;
  let c = baba * oaoa - baoa * baoa - r * r * baba;
  let h2 = b * b - a * c;
  let t = -1;
  if (h2 >= 0 && Math.abs(a) > 1e-12) {
    t = (-b - Math.sqrt(h2)) / a;
    const y = baoa + t * bard;
    if (!(y > 0 && y < baba)) {
      // pontas: esfera em −h ou h
      const cy = y <= 0 ? -h : h;
      const ocy = o[1] - cy;
      b = d[0] * o[0] + d[1] * ocy + d[2] * o[2];
      c = o[0] * o[0] + ocy * ocy + o[2] * o[2] - r * r;
      h2 = b * b - c;
      t = h2 > 0 ? -b - Math.sqrt(h2) : -1;
    }
  }
  if (!(t > 0)) return null;
  const p = [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
  const yy = Math.max(-h, Math.min(h, p[1]));
  return { t, p, n: normalizar([p[0], p[1] - yy, p[2]]) };
}

registrar('volume', {
  // forma: esfera | elipsoide | toro | capsula | fantoma.
  // volta: quadros por volta inteira (laço exato); modo: giro | balanco | tombo | precessao;
  //   guinada: giro inicial; inclinacao: radianos de inclinação da vista (positivo mostra o
  //   topo); guinadaParada, fracaoParada: a pose parada; puxao: radianos que o ponteiro
  //   inclina; puxaLuz: quanto ele desloca a luz; giroRolagem: voltas por página rolada.
  // A, B: inclinação (em x) e rolagem (em z) do objeto antes do giro; R1, R2: tubo e anel
  //   do toro; inclinaEixo: ângulo entre o eixo do toro e a visada (precessao); voltasGiro:
  //   voltas do toro no próprio eixo por laço; tomboA, tomboB: voltas em x e z (tombo).
  // luzX, luzY, luzZ: direção da luz (presa à câmera); luzBalanco: radianos que a luz
  //   balança em volta do objeto por laço; ambiente: piso da luz; brilho: o reflexo;
  //   contraste: expoente da luz; rampa: do vazio ao mais denso; contorno: liga a silhueta
  //   por forma; textura: ondulação leve na superfície (deixa o giro do toro visível).
  // chao: o chão ralo com a sombra; preenche: fração da menor dimensão ocupada; distancia:
  //   câmera (0 = paralela).
  padrao: {
    forma: 'esfera', volta: 120, modo: 'giro', guinada: 0, inclinacao: 0.38, guinadaParada: 0.62,
    fracaoParada: 0, puxao: 0.2, puxaLuz: 0.8, giroRolagem: 1,
    A: 0, B: 0, R1: 1, R2: 2, inclinaEixo: 0.8, voltasGiro: 1, tomboA: 1, tomboB: 2,
    luzX: -0.85, luzY: 0.55, luzZ: 0.6, luzBalanco: 0.7, ambiente: 0.05, brilho: 0.3, contraste: 1.15,
    rampa: RAMPA_LUZ, contorno: true, textura: 0, chao: true,
    preenche: 0.84, distancia: 5,
  },
  predefinicoes: {
    toro: { forma: 'toro', modo: 'precessao', inclinacao: 0.3, R1: 1, R2: 2.1, inclinaEixo: 0.72, textura: 0.1, fracaoParada: 0.62 },
    esfera: { forma: 'esfera', luzBalanco: 1.1, fracaoParada: 0.8 },
    elipsoide: { forma: 'elipsoide', A: 0.45, B: 0.35 },
    fantoma: { forma: 'fantoma', inclinacao: 0.3, chao: false, preenche: 0.86 },
    capsula: { forma: 'capsula', A: 0.62, B: 0.2, inclinacao: 0.3, guinadaParada: 0.9 },
  },
  desenhar(grade, ctx) {
    const q = ctx.params;
    const { cols, linhas } = grade;
    if (cols < 1 || linhas < 1) return;
    const vi = vista(ctx, grade);
    if (q.forma === 'fantoma') { desenharFantoma(grade, ctx, vi); return; }

    // pose do objeto
    let base;
    if (q.modo === 'precessao' && q.forma === 'toro') {
      // o eixo do anel descreve um cone em volta da visada: nunca de perfil
      const f = vi.f;
      const fi = TAU * f, giro = TAU * f * q.voltasGiro;
      base = multiplicar(multiplicar(rotZ(fi), rotX(q.inclinaEixo)), multiplicar(rotZ(giro), multiplicar(rotX(q.A), rotZ(q.B))));
      // a vista não inclina o anel (só o chão e o ponteiro): o cone fica em volta da visada
      base = multiplicar(rotX(-q.inclinacao), base);
    } else {
      let A = q.A, B = q.B;
      if (q.modo === 'tombo' && !ctx.parado) {
        A += TAU * vi.f * q.tomboA;
        B += TAU * vi.f * q.tomboB;
      }
      base = multiplicar(rotX(A), rotZ(B));
    }
    const M = matrizDaVista(vi, base);
    const Mt = transpor(M);
    let L = luzDe(q, vi);
    if (q.luzBalanco && !ctx.parado) {
      L = aplicar(rotY(q.luzBalanco * Math.sin(TAU * vi.f)), L[0], L[1], L[2]);
    } else if (q.luzBalanco && ctx.parado) {
      L = aplicar(rotY(q.luzBalanco * Math.sin(TAU * q.fracaoParada)), L[0], L[1], L[2]);
    }
    // a rolagem gira o objeto debaixo de uma luz que fica no lugar do mundo: a esfera (que
    // girando não muda) mostra o giro pelo terminador que anda
    const rol = (ctx.entrada?.rolagem ?? 0) * (q.giroRolagem ?? 0);
    if (rol) L = aplicar(rotY(-TAU * rol), L[0], L[1], L[2]);

    // chão: plano y = −hChao do mundo (antes da inclinação da vista), visto inclinado
    const hChao = 1.06, rChao = 1.5;
    const Rc = rotX(vi.inclinacao);
    const nF = [Rc[1], Rc[4], Rc[7]]; // Rx · (0, 1, 0)
    let cam;
    if (q.chao) {
      const pts = [];
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * TAU;
        pts.push([Math.cos(a), Math.sin(a), 0], [Math.cos(a), 0, Math.sin(a)], [0, Math.cos(a), Math.sin(a)]);
        pts.push([0.85 * Math.cos(a), -hChao, 0.85 * Math.sin(a)]);
      }
      cam = enquadrar(cols, linhas, pts, [rotX(q.inclinacao)], { preenche: q.preenche, distancia: q.distancia });
    } else {
      cam = camera(cols, linhas, { raio: 1, preenche: q.preenche, distancia: q.distancia });
    }

    const soma = Math.max(1e-6, Math.abs(q.R1) + Math.abs(q.R2));
    const tubo = Math.abs(q.R1) / soma, anel = Math.abs(q.R2) / soma;
    const r = q.forma === 'esfera' ? [1, 1, 1] : ELIPSOIDE;
    const cruzar = q.forma === 'toro' ? (o, d) => cruzarToro(o, d, anel, tubo)
      : q.forma === 'capsula' ? (o, d) => cruzarCapsula(o, d, 0.56, 0.42)
        : (o, d) => cruzarEixos(o, d, r);

    // luz de uma amostra (sx, sy em células fracionárias): −1 = não bateu
    const zHit = { z: 0 };
    const amostra = (sx, sy) => {
      const { o, d } = raioDoPonto(cam, sx, sy);
      const oo = aplicar(Mt, o[0], o[1], o[2]), dd = aplicar(Mt, d[0], d[1], d[2]);
      const h = cruzar(oo, dd);
      if (!h) return -1;
      zHit.z = o[2] + d[2] * h.t;
      const nm = aplicar(M, h.n[0], h.n[1], h.n[2]);
      let v = Math.pow(iluminar(nm, L, [-d[0], -d[1], -d[2]], q.ambiente, q.brilho), q.contraste);
      if (q.textura > 0 && q.forma === 'toro') {
        const u = Math.atan2(h.p[1], h.p[0]);
        v *= 1 - q.textura * (0.5 + 0.5 * Math.cos(8 * u));
      }
      return v;
    };

    const n = cols * linhas;
    const val = new Float32Array(n).fill(-1);
    const zc = new Float32Array(n).fill(-Infinity);
    for (let y = 0; y < linhas; y++) {
      for (let x = 0; x < cols; x++) {
        const v = amostra(x + 0.5, y + 0.5);
        if (v >= 0) { val[y * cols + x] = v; zc[y * cols + x] = zHit.z; }
      }
    }

    // borda: célula cuja vizinha (8) tem outro estado; lá a cobertura vem de 3 × 5 amostras
    const fora = (i) => val[i] < 0;
    for (let y = 0; y < linhas; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        const eu = fora(i);
        let borda = false;
        for (let dy = -1; dy <= 1 && !borda; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx, yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= cols || yy >= linhas) { if (!eu) borda = true; continue; }
            if (fora(yy * cols + xx) !== eu) { borda = true; break; }
          }
        }
        if (!borda || !q.contorno) {
          if (!eu) por(grade, x, y, daRampa(q.rampa, val[i], 1), tomDaLuz(val[i], 0.62, 0.26));
          continue;
        }
        let cob = 0, mx = 0, my = 0, soma = 0;
        for (let j = 0; j < SY; j++) {
          for (let k = 0; k < SX; k++) {
            const fx = (k + 0.5) / SX, fy = (j + 0.5) / SY;
            const v = amostra(x + fx, y + fy);
            if (v < 0) continue;
            cob++; mx += fx; my += fy; soma += v;
          }
        }
        if (cob < 2) { val[i] = -1; continue; }
        const c = cob / (SX * SY), luz = soma / cob;
        if (c >= 0.87) {
          val[i] = luz;
          por(grade, x, y, daRampa(q.rampa, luz, 1), tomDaLuz(luz, 0.62, 0.26));
          continue;
        }
        const nx = mx / cob - 0.5, ny = (my / cob - 0.5) * ASPECTO;
        if (Math.hypot(nx, ny) < 0.04) { por(grade, x, y, daRampa(q.rampa, luz, 1), tomDaLuz(luz)); continue; }
        if (val[i] < 0) { val[i] = luz; zc[i] = 1; }
        por(grade, x, y, glifoDeBorda(nx, ny, c), luz >= 0.3 ? 'tinta' : 'tinta-2');
      }
    }

    if (!q.chao) return;
    // chão: só a sombra projetada (o raio da luz bate no sólido), num pontilhado ralo; sem
    // anel desenhado, que lia como uma tigela debaixo do objeto
    const Lo = aplicar(Mt, L[0], L[1], L[2]);
    for (let y = 0; y < linhas; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        if (val[i] >= 0 || grade.car[i] !== ' ') continue;
        const { o, d } = raioDoPonto(cam, x + 0.5, y + 0.5);
        const den = nF[0] * d[0] + nF[1] * d[1] + nF[2] * d[2];
        if (den >= -1e-6) continue;
        const t = (-hChao - (nF[0] * o[0] + nF[1] * o[1] + nF[2] * o[2])) / den;
        if (t <= 0) continue;
        const p = [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
        const pw = aplicar(transpor(Rc), p[0], p[1], p[2]);
        if (Math.hypot(pw[0], pw[2]) > rChao) continue;
        const po = aplicar(Mt, p[0], p[1], p[2]);
        if (cruzar(po, Lo)) por(grade, x, y, (x + y) % 2 ? ':' : '·', 'tinta-3');
      }
    }
  },
});

// Fantoma lido como corte translúcido: a projeção por dentro e o contorno de cada elipsoide.
// Pesos da projeção: separam as estruturas (o original soma intensidades quase iguais).
const PESO = [0, 0, -1.6, -1.6, 1.1, 0, 2.2, 2.4, 2.4, 2.4];
// Ordem de pintura dos contornos: o cérebro, os de dentro e, por cima, o crânio.
const ORDEM = [1, 4, 2, 3, 6, 7, 8, 9, 0];
const CENTROS = FANTOMA.map((e) => fantomaParaObjeto(e[4], e[5], e[6]));

function desenharFantoma(grade, ctx, vi) {
  const q = ctx.params;
  const { cols, linhas } = grade;
  const M = matrizDaVista(vi, multiplicar(rotX(q.A), rotZ(q.B)));
  const Mt = transpor(M);
  const cam = camera(cols, linhas, { raio: 0.93, preenche: q.preenche, distancia: q.distancia });
  const n = cols * linhas;
  const K = FANTOMA.length;
  const corda = (sx, sy, k) => {
    const { o, d } = raioDoPonto(cam, sx, sy);
    const oo = aplicar(Mt, o[0], o[1], o[2]), dd = aplicar(Mt, d[0], d[1], d[2]);
    return cordaDoElipsoide(k, objetoParaFantoma(oo[0], oo[1], oo[2]), objetoParaFantoma(dd[0], dd[1], dd[2]));
  };
  // máscara de cada elipsoide (bit k) e a projeção ponderada, no centro da célula
  const mask = new Int32Array(n);
  const proj = new Float32Array(n);
  for (let y = 0; y < linhas; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const { o, d } = raioDoPonto(cam, x + 0.5, y + 0.5);
      const oo = aplicar(Mt, o[0], o[1], o[2]), dd = aplicar(Mt, d[0], d[1], d[2]);
      const of = objetoParaFantoma(oo[0], oo[1], oo[2]), df = objetoParaFantoma(dd[0], dd[1], dd[2]);
      const c0 = cordaDoElipsoide(0, of, df);
      if (!c0) continue;
      let bits = 1, s = 0;
      for (let k = 1; k < K; k++) {
        const c = cordaDoElipsoide(k, of, df);
        if (!c) continue;
        bits |= 1 << k;
        s += PESO[k] * (c[1] - c[0]);
      }
      mask[i] = bits;
      proj[i] = s;
    }
  }
  // enchimento: o osso (dentro do crânio, fora do cérebro) denso; o cérebro ralo; as
  // estruturas pela projeção (os ventrículos vazios, as densas mais cheias)
  for (let y = 0; y < linhas; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x, b = mask[i];
      if (!b) continue;
      if (!(b & 2)) { por(grade, x, y, '=', 'tinta-2'); continue; }
      const v = proj[i];
      if (v < -0.08) continue;
      if (v > 0.06) { por(grade, x, y, daRampa(' ·:-=+*', Math.min(1, 0.25 + v * 1.3), 1), v > 0.35 ? 'tinta-2' : 'tinta-3'); continue; }
      if ((x + y) % 2 === 0) por(grade, x, y, '·', 'tinta-3');
    }
  }
  // contornos: cobertura 3 × 5 nas células de borda de cada máscara
  const zs = CENTROS.map((c) => aplicar(M, c[0], c[1], c[2])[2]);
  for (const k of ORDEM) {
    const bit = 1 << k;
    const tom = k === 0 ? 'tinta' : tomDaProfundidade((zs[k] + 0.75) / 1.5);
    for (let y = 0; y < linhas; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        const eu = (mask[i] & bit) !== 0;
        let borda = false;
        for (let dy = -1; dy <= 1 && !borda; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx, yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= cols || yy >= linhas) continue;
            if (((mask[yy * cols + xx] & bit) !== 0) !== eu) { borda = true; break; }
          }
        }
        if (!borda) continue;
        let cob = 0, mx = 0, my = 0;
        for (let j = 0; j < SY; j++) {
          for (let m = 0; m < SX; m++) {
            const fx = (m + 0.5) / SX, fy = (j + 0.5) / SY;
            if (!corda(x + fx, y + fy, k)) continue;
            cob++; mx += fx; my += fy;
          }
        }
        if (cob < 2 || cob > 13) continue;
        const nx = mx / cob - 0.5, ny = (my / cob - 0.5) * ASPECTO;
        if (Math.hypot(nx, ny) < 0.04) continue;
        por(grade, x, y, glifoDeBorda(nx, ny, cob / (SX * SY)), tom);
      }
    }
  }
  // o achado: um ponto, no centro projetado do elipsoide pequeno
  const c = CENTROS[ACHADO_DO_FANTOMA];
  const w = aplicar(M, c[0], c[1], c[2]);
  const P = projetar(cam, w[0], w[1], w[2]);
  por(grade, Math.floor(P.sx), Math.floor(P.sy), '●', 'achado');
}
