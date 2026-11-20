// Efeito "cabecalho": laços infinitos para fundo de cabeçalho (a faixa larga e baixa do
// devlog, 159 × 7). Cada variação é EXATAMENTE periódica: o quadro N é o quadro 0 (no
// vídeo, laço sem emenda, E = 0). Todo o tempo entra como q = quadro módulo N; nada
// depende do quadro de outro jeito. É fundo, com texto por cima: tinta-3 e tinta-2, e
// terracota (achado) só em `marca` (o acento do logo).
//
// Variações (predefinições; a `variacao` é o parâmetro que escolhe o desenho):
//   deriva     duas camadas de ruído que deslizam para a esquerda, 1 e 2 colunas por
//              quadro. O ruído é periódico em x (a rede do ruído dá a volta), com período
//              igual ao deslocamento de uma volta: em N quadros cada camada anda
//              exatamente um período e volta ao mesmo lugar (o "cilindro").
//   linhas     linhas de campo deitadas, no espírito do `fluxo`: duas ondas que viajam
//              em sentidos opostos (a fase gira 2π em N quadros), em trechos que aparecem
//              e somem com uma máscara que também desliza. Traço de caixa com cantos
//              redondos (─ ╮ ╰ ╯ ╭ │), contínuo e de um peso só.
//   sinograma  o dado cru de uma tomografia: cada "objeto" do fantoma é uma senoide de
//              amplitude e fase próprias (todas com o mesmo comprimento: uma volta do
//              tubo), as faixas se somam onde se cruzam e deslizam para a esquerda; a fase
//              dá exatamente uma volta em N quadros.
//   varredura  uma coluna de leitura cruza a faixa da esquerda para a direita e revela,
//              atrás dela, a textura por onde passa, que se apaga em `rastro` colunas
//              (uma janela de exame). Ela sai da tela pela direita com o rastro inteiro
//              antes de a volta recomeçar fora da tela, à esquerda. Pontos fixos e ralos
//              seguram a faixa quando a coluna está fora.
//   cortes     uma fileira de cortes axiais de um fantoma sintético (elipsoides aninhados,
//              cada casca um anel de densidade própria), cada corte num nível; a fileira
//              anda um corte por vez (desliza e para), M cortes por volta, e a sequência de
//              níveis tem período M: o quadro N é o 0. Em faixas mais altas, várias
//              fileiras de 7 linhas, desencontradas.
//   marca      o logo (LOGO_CABECALHO) parado à esquerda, bytes soltos passando atrás, e
//              o trecho marcado do logo pulsando de tinta-3 a achado uma vez por volta.
//
// Reação ao ponteiro (com data-reativo no site): as células a até `alcance` colunas do
// ponteiro (a linha conta em dobro, a célula é 1 : 2) sobem um tom: tinta-3 → tinta-2,
// tinta-2 → tinta. Só o tom muda, nunca o caractere; sem ponteiro, nada muda; o ponteiro
// não entra no tempo, então não quebra o laço. Parado, o ponteiro não conta.
//
// Parado (movimento reduzido): cada variação mostra um quadro fixo escolhido para ficar
// bem composto (quadroParado).

import { registrar, por, hash2, TONS } from '../motor/nucleo.mjs';
import { ponteiroNaGrade } from './_comum.mjs';

// O logo da variação `marca`: trechos [texto, tom] e, no trecho que pulsa, um terceiro
// elemento 'pulsa' (o tom dele é o de repouso; o pulso o leva a achado uma vez por volta).
// O texto e os tons saem daqui e de nenhum outro lugar: trocar o logo é trocar esta
// constante. Hoje: findings/devblog, e a barra é o trecho que pulsa (a terracota do logo).
export const LOGO_CABECALHO = Object.freeze([
  Object.freeze(['findings', 'tinta']),
  Object.freeze(['/', 'tinta-3', 'pulsa']),
  Object.freeze(['devblog', 'tinta-2']),
]);

export const VARIACOES = Object.freeze(['deriva', 'linhas', 'sinograma', 'varredura', 'cortes', 'marca']);

const SAL = {
  derivaA: 0x2d7f1a33, derivaB: 0x51c3e9b7, linhaForma: 0x6a09e667, linhaMascara: 0x3c6ef372,
  linhaFase: 0x1f83d9ab, fitaFase: 0x5be0cd19, fitaTroca: 0x7a2c4e91, fitaByte: 0x0b5ad4ec,
  fitaFuro: 0x4d2f7c13, varTextura: 0x68b1e5d2, varPontos: 0x2e9c6f01, sinObjeto: 0x9b05688c,
  cortesFantoma: 0x3f84d5b5, cortesFileira: 0x1c6a2f97,
};

const mod = (a, n) => ((a % n) + n) % n;
const TOM = Object.fromEntries(TONS.map((t, i) => [t, i]));
// um tom acima (mais escuro no claro, mais claro no escuro); tinta e achado ficam
const ACIMA = { [TOM['tinta-3']]: TOM['tinta-2'], [TOM['tinta-2']]: TOM.tinta };

// Ruído de valor com a rede periódica em u: período P (inteiro) células de rede.
function ruidoCiclico(u, v, P, semente) {
  const xi = Math.floor(u), yi = Math.floor(v);
  const xf = u - xi, yf = v - yi;
  const a0 = mod(xi, P), a1 = mod(xi + 1, P);
  const su = xf * xf * (3 - 2 * xf), sv = yf * yf * (3 - 2 * yf);
  const a = hash2(a0, yi, semente), b = hash2(a1, yi, semente);
  const c = hash2(a0, yi + 1, semente), d = hash2(a1, yi + 1, semente);
  return (a * (1 - su) + b * su) * (1 - sv) + (c * (1 - su) + d * su) * sv;
}

// Uma camada que desliza `v` colunas por quadro para a esquerda e volta ao lugar em N
// quadros: a rede tem P células e cada célula de rede mede v·N/P colunas.
function camada(x, y, q, { v, P, N, ey, semente }) {
  return ruidoCiclico((x + v * q) * (P / (v * N)), y * ey, P, semente);
}

// ---------------------------------------------------------------- deriva

const RAMPA_DERIVA = '·:-=+';

function deriva(grade, q, N, s, p) {
  for (let y = 0; y < grade.linhas; y++) {
    for (let x = 0; x < grade.cols; x++) {
      const a = camada(x, y, q, { v: 1, P: 8, N, ey: 0.3, semente: s ^ SAL.derivaA });
      const b = camada(x, y, q, { v: 2, P: 24, N, ey: 0.55, semente: s ^ SAL.derivaB });
      const n = p.pesoA * a + (1 - p.pesoA) * b;
      if (n < p.piso) continue;
      const k = Math.min(RAMPA_DERIVA.length - 1, Math.floor(((n - p.piso) / (1 - p.piso)) ** 0.8 * RAMPA_DERIVA.length * 1.25));
      por(grade, x, y, RAMPA_DERIVA[k], k >= 3 ? 'tinta-2' : 'tinta-3');
    }
  }
}

// ---------------------------------------------------------------- traços (linhas)

// Põe a coluna x de um traço y(x) (em linhas, contínuo) na grade. A coluna x fica na
// linha a = ⌊y(x)⌋ e a seguinte na b = ⌊y(x + 1)⌋: mesma linha, ─; mudou, a curva desce
// ou sobe dentro da coluna x com cantos redondos (╮ … ╰ para baixo, ╯ … ╭ para cima) e │
// nas linhas do meio. Tudo em traço de caixa, do mesmo peso: o traço sai contínuo. (O _ e
// o ‾ dariam meia linha, mas a fonte os desenha mais curtos que a célula, em tracinhos.)
function tracar(grade, x, y0, y1, tom) {
  const a = Math.floor(y0), b = Math.floor(y1);
  if (a === b) { por(grade, x, a, '─', tom); return; }
  por(grade, x, a, b > a ? '╮' : '╯', tom);
  for (let k = Math.min(a, b) + 1; k < Math.max(a, b); k++) por(grade, x, k, '│', tom);
  por(grade, x, b, b > a ? '╰' : '╭', tom);
}

function linhas(grade, q, N, s, p) {
  const fase = (2 * Math.PI * q) / N;
  const esp = p.espaco;
  const quantas = Math.max(1, Math.round(grade.linhas / esp));
  const sobra = (grade.linhas - quantas * esp) / 2;
  for (let k = 0; k < quantas; k++) {
    const base = sobra + (k + 0.5) * esp;
    const c1 = 2 * Math.PI * hash2(k, 1, s ^ SAL.linhaFase), c2 = 2 * Math.PI * hash2(k, 2, s ^ SAL.linhaFase);
    const altura = (x) => base
      + 0.8 * Math.sin((2 * Math.PI * x) / 61 - fase + c1)
      + 0.45 * Math.sin((2 * Math.PI * x) / 23 + 2 * fase + c2)
      + 0.5 * (ruidoCiclico(x / 17, k * 3.7, 1 << 20, s ^ SAL.linhaForma) - 0.5);
    for (let x = 0; x < grade.cols; x++) {
      const m = camada(x, k * 2.3, q, { v: 1, P: 8, N, ey: 1, semente: s ^ SAL.linhaMascara });
      if (m < p.corte) continue;
      tracar(grade, x, altura(x), altura(x + 1), m > p.forte ? 'tinta-2' : 'tinta-3');
    }
  }
}

// ---------------------------------------------------------------- fitas (marca)

// Byte (ou null, furo) e tom da coluna x de uma fita que anda v colunas por quadro.
// Cada byte ocupa 3 colunas ("a3 "). P = v·N/3 bytes passam numa volta; o byte j é
// identificado por j mod P e por uma época e, que muda quando o byte cruza a sua coluna de
// troca (sorteada por byte): no quadro q + N o byte j + P está onde o j estava, com a
// mesma época. Assim a fita não se repete na tela e a volta fecha.
function fita(x, q, N, { v, deslocamento, furos, semente }) {
  const D = v * N;            // colunas por volta
  const P = D / 3;            // bytes por volta
  const pos = x + v * q - deslocamento;
  const j = Math.floor(pos / 3), dentro = mod(pos, 3);
  if (dentro === 2) return null;
  const jm = mod(j, P);
  const x0 = 3 * j - v * q + deslocamento; // coluna (na tela) do começo do byte
  const troca = Math.floor(hash2(jm, 0, semente ^ SAL.fitaTroca) * D);
  const e = Math.floor((troca - x0) / D);
  // o byte 0 de cada volta nunca é furo (regra antiga, mantida para a `marca` não mudar)
  if (jm !== 0 && hash2(jm, e, semente ^ SAL.fitaFuro) < furos) return null;
  const byte = Math.floor(hash2(jm, e, semente ^ SAL.fitaByte) * 256);
  return { c: byte.toString(16).padStart(2, '0')[dentro], jm };
}

// Onde o logo fica: linha do meio, `margem` colunas da esquerda. Exportado para os testes.
export function leiauteDoLogo(cols, linhas, margem = 3) {
  const y = Math.floor((linhas - 1) / 2);
  const x0 = Math.min(margem, Math.max(0, cols - 1));
  const celulas = [];
  let x = x0;
  for (const [texto, tom, marca] of LOGO_CABECALHO) {
    for (const c of texto) {
      if (c !== ' ') celulas.push({ x, y, c, tom, pulsa: marca === 'pulsa' });
      x++;
    }
  }
  return { y, x0, x1: x - 1, celulas };
}

// Tom do trecho que pulsa no quadro q: repouso, sobe por tinta-2, fica em achado, volta.
function tomDoPulso(q, repouso, { inicio, achado }) {
  const k = q - inicio;
  if (k < 0 || k >= achado + 4) return repouso;
  if (k < 2 || k >= achado + 2) return 'tinta-2';
  return 'achado';
}

function marca(grade, q, N, s, p) {
  const L = leiauteDoLogo(grade.cols, grade.linhas, p.margem);
  for (let y = 0; y < grade.linhas; y++) {
    const v = 1 + (y % 2);
    const opc = { v, furos: p.furos, deslocamento: Math.floor(hash2(y, 5, s ^ SAL.fitaFase) * v * N), semente: s + 104729 * y };
    for (let x = 0; x < grade.cols; x++) {
      // os bytes passam atrás: somem perto do logo (da borda até 2 colunas depois dele,
      // na linha dele e nas vizinhas)
      if (Math.abs(y - L.y) <= 1 && x <= L.x1 + 2) continue;
      const b = fita(x, q, N, opc);
      if (b) por(grade, x, y, b.c, 'tinta-3');
    }
  }
  for (const c of L.celulas) por(grade, c.x, c.y, c.c, c.pulsa ? tomDoPulso(q, c.tom, p.pulso) : c.tom);
}

// ---------------------------------------------------------------- varredura

const RAMPA_VARREDURA = '·:-=+*';

function posicaoDaVarredura(q, N, cols, rastro) {
  return Math.floor(-2 + ((cols + rastro + 4) * q) / N);
}

function varredura(grade, q, N, s, p) {
  const T = p.rastro;
  const X = posicaoDaVarredura(q, N, grade.cols, T);
  for (let y = 0; y < grade.linhas; y++) {
    for (let x = 0; x < grade.cols; x++) {
      const atras = X - x; // 0 na coluna de leitura, cresce para a esquerda
      if (atras === 0) { por(grade, x, y, '│', 'tinta-2'); continue; }
      if (atras > 0 && atras <= T) {
        const r = 1 - atras / (T + 1);
        const n = ruidoCiclico(x / 7, y / 2.2, 1 << 20, s ^ SAL.varTextura) * 0.7
          + hash2(x, y, s ^ SAL.varTextura) * 0.3;
        const forca = n * (0.35 + 0.65 * r);
        if (forca > 0.3) {
          const k = Math.min(RAMPA_VARREDURA.length - 1, Math.floor(((forca - 0.3) / 0.7) * RAMPA_VARREDURA.length * 1.6));
          por(grade, x, y, RAMPA_VARREDURA[k], r > 0.55 && k >= 2 ? 'tinta-2' : 'tinta-3');
          continue;
        }
      }
      // fora da janela: pontos fixos e ralos, a trama que a leitura percorre
      if (hash2(x, y, s ^ SAL.varPontos) < p.pontos) por(grade, x, y, '·', 'tinta-3');
    }
  }
}

// ---------------------------------------------------------------- sinograma

// O sinograma é o que o tomógrafo mede: para cada ângulo do tubo (aqui, a coluna), a
// projeção do corte num detector (aqui, a linha). Um objeto pontual no corte vira uma
// senoide: posição no detector = centro + raio·sen(ângulo + fase). Todos os objetos têm o
// mesmo comprimento de onda (`onda` colunas por volta do tubo); muda o raio (amplitude), a
// fase, o peso e a espessura. As faixas se somam onde se cruzam. A fileira inteira desliza
// para a esquerda: a fase anda 2π em N quadros, e o desenho é periódico.
//
// Em faixas altas (1080p) a amplitude e o centro escalam com a altura: o mesmo sinograma,
// maior. A rampa sai de `rampaSino`: o primeiro glifo é o mais ralo.
function objetosDoSinograma(s, p) {
  const lista = [];
  for (let k = 0; k < p.objetos; k++) {
    const h = (i) => hash2(k, i, s ^ SAL.sinObjeto);
    lista.push({
      // o primeiro fica perto do centro de rotação: raio pequeno, quase reto
      raio: k === 0 ? 0.1 + 0.15 * h(1) : 0.3 + 0.7 * h(1),
      fase: 2 * Math.PI * h(2),
      peso: 0.6 + 0.4 * h(3),
      larg: p.espessura * (0.7 + 0.6 * h(4)),
    });
  }
  return lista;
}

function sinograma(grade, q, N, s, p) {
  const objs = objetosDoSinograma(s, p);
  const L = grade.linhas, meio = (L - 1) / 2;
  const amp = Math.max(1, meio - 0.3);           // linhas do centro à borda útil
  const esp = Math.max(1, L / 7);                // a espessura escala com a altura
  const rampa = [...p.rampaSino];
  const fase = (2 * Math.PI * q) / N;
  const w = (2 * Math.PI) / p.onda;
  const centros = new Float64Array(objs.length);
  for (let x = 0; x < grade.cols; x++) {
    const ang = w * x + fase;
    for (let k = 0; k < objs.length; k++) centros[k] = meio + amp * objs[k].raio * Math.sin(ang + objs[k].fase);
    for (let y = 0; y < L; y++) {
      let v = 0;
      for (let k = 0; k < objs.length; k++) {
        const d = (y - centros[k]) / (objs[k].larg * esp);
        if (d > 3 || d < -3) continue;
        v += objs[k].peso * Math.exp(-d * d);
      }
      if (v < p.limiar) continue;
      const u = Math.min(1, (v - p.limiar) / (p.saturacao - p.limiar));
      const i = Math.min(rampa.length - 1, Math.floor(u * rampa.length));
      por(grade, x, y, rampa[i], u > 0.55 ? 'tinta-2' : 'tinta-3');
    }
  }
}

// ---------------------------------------------------------------- cortes

// O fantoma: elipsoides aninhados (cascas), com o centro um pouco fora do eixo e semieixos
// próprios, como um Shepp-Logan em 3D bem simples. Cada casca é desenhada como um anel (a
// borda da sua seção no nível z), com o glifo da sua densidade: de fora para dentro, a
// rampa `rampaCortes` sobe. Dentro dos anéis, vazio: o corte fica leve, para fundo.
function fantoma(s, p) {
  const h = (i, j) => hash2(i, j, s ^ SAL.cortesFantoma);
  const cascas = [{ cx: 0, cy: 0, cz: 0, a: 0.94, b: 1, c: 1 }];
  for (let k = 1; k < p.cascas; k++) {
    const f = 1 - (0.62 * k) / p.cascas;
    cascas.push({
      cx: (h(k, 1) - 0.5) * 0.3 * (1 - f) * 2, cy: (h(k, 2) - 0.5) * 0.25 * (1 - f) * 2,
      cz: (h(k, 3) - 0.5) * 0.3,
      a: f * 0.94 * (0.82 + 0.18 * h(k, 4)), b: f * (0.82 + 0.18 * h(k, 5)), c: f * (0.8 + 0.2 * h(k, 6)),
    });
  }
  // duas "cavidades" pequenas lado a lado (como os ventrículos do Shepp-Logan)
  if (p.cavidades) {
    const dz = (h(9, 1) - 0.5) * 0.2;
    cascas.push({ cx: -0.24, cy: -0.05, cz: dz, a: 0.13, b: 0.24, c: 0.4 });
    cascas.push({ cx: 0.24, cy: -0.05, cz: dz, a: 0.13, b: 0.24, c: 0.4 });
  }
  return cascas;
}

// Nível (z de −1 a 1) do corte j de uma fileira: dente de serra pelos M cortes, de cima
// para baixo, deixando as pontas (cortes vazios) de fora.
function nivelDoCorte(j, M) {
  const k = mod(j, M);
  return -0.9 + (1.8 * (k + 0.5)) / M;
}

// Avanço da fileira (em cortes) no quadro q: M passos por volta; em cada passo a fileira
// desliza um corte nos primeiros `deslize` quadros (com suavização) e para no resto.
function avancoDaFileira(q, N, M, deslize) {
  const P = N / M;
  const passo = Math.floor(q / P), t = q - passo * P;
  const k = Math.min(1, t / Math.min(deslize, P));
  return passo + k * k * (3 - 2 * k);
}

function cortes(grade, q, N, s, p) {
  const M = p.cortes;
  if (!Number.isInteger(N / M)) throw new Error(`cortes: o período (${N}) tem de ser múltiplo de cortes (${M})`);
  const cascas = fantoma(s, p);
  const rampa = [...p.rampaCortes];
  const H = Math.min(grade.linhas, p.alturaFileira);
  const fileiras = Math.max(1, Math.floor(grade.linhas / H));
  const y0 = Math.floor((grade.linhas - fileiras * H) / 2);
  const ry = H / 2 - 0.2;                       // raio em linhas (a casca toca as bordas)
  const rx = 2 * ry * p.aspecto;                // raio em colunas (a célula é 1 : 2)
  const W = Math.ceil(2 * rx + 1) + p.vao;      // largura de um corte com o vão
  const avanco = avancoDaFileira(q, N, M, p.deslize);
  const anel = p.anel;
  for (let f = 0; f < fileiras; f++) {
    // fileiras desencontradas: cada uma começa num corte e anda num sentido
    const ini = Math.floor(hash2(f, 1, s ^ SAL.cortesFileira) * M);
    const sentido = f % 2 === 0 ? 1 : -1;
    const desl = sentido * avanco * W;
    const cy = y0 + f * H + (H - 1) / 2;
    const jMin = Math.floor((desl - W) / W), jMax = Math.ceil((desl + grade.cols + W) / W);
    for (let j = jMin; j <= jMax; j++) {
      const cx = j * W - desl + W / 2;           // centro do corte na tela
      if (cx + rx < -1 || cx - rx > grade.cols) continue;
      const z = nivelDoCorte(j + ini, M);
      for (let y = Math.max(0, Math.floor(cy - ry - 1)); y <= Math.min(grade.linhas - 1, Math.ceil(cy + ry + 1)); y++) {
        for (let x = Math.max(0, Math.floor(cx - rx - 1)); x <= Math.min(grade.cols - 1, Math.ceil(cx + rx + 1)); x++) {
          const u = (x - cx) / rx, v = (y - cy) / ry;
          // a casca mais de dentro cuja borda passa por esta célula
          let qual = -1;
          for (let k = 0; k < cascas.length; k++) {
            const c = cascas[k];
            const zz = (z - c.cz) / c.c;
            if (zz * zz >= 1) continue;
            const r = Math.sqrt(1 - zz * zz);
            const e = Math.hypot((u - c.cx) / (c.a * r), (v - c.cy) / (c.b * r));
            // largura do anel em unidades da elipse, para ~`anel` células na menor direção
            const borda = anel / Math.max(1, Math.min(c.a * r * rx, c.b * r * ry * 2));
            if (e <= 1 && e > 1 - borda) qual = k;
          }
          if (qual < 0) continue;
          const i = Math.min(rampa.length - 1, Math.round((qual / Math.max(1, cascas.length - 1)) * (rampa.length - 1)));
          por(grade, x, y, rampa[i], qual === 0 ? 'tinta-2' : 'tinta-3');
        }
      }
    }
  }
}

// ---------------------------------------------------------------- registro

const DESENHOS = { deriva, linhas, sinograma, varredura, cortes, marca };

// Quadro do repouso (movimento reduzido) de cada variação, para a grade dada.
export function quadroParado(variacao, N, cols, linhas, params = {}) {
  switch (variacao) {
    case 'varredura': {
      // a coluna a 62 % da largura, com o rastro inteiro à vista
      const T = params.rastro ?? 24;
      const alvo = 0.62 * cols;
      return mod(Math.round(((alvo + 2) * N) / (cols + T + 4)), N);
    }
    case 'marca': return (params.pulso?.inicio ?? 40) + 4; // o acento em achado
    case 'cortes': return Math.floor(N / (params.cortes ?? 12)) - 1; // parado, fim do passo
    default: return 0;
  }
}

registrar('cabecalho', {
  // periodo: N, quadros lógicos por volta (96 = 8 s). alcance: colunas do ponteiro.
  // deriva: piso (abaixo dele, vazio). linhas: espaco (linhas entre traços), corte (máscara
  // abaixo dele some), forte (acima, tinta-2). marca: margem (colunas até o logo), furos
  // (fração de bytes vazios), pulso { inicio, achado } (quadro em que o acento começa a
  // subir; quadros em achado). varredura: rastro (colunas até apagar), pontos (densidade
  // da trama fora da janela).
  // sinograma: objetos (senoides), onda (colunas por volta do tubo), espessura (da faixa,
  // em linhas a cada 7), limiar (soma abaixo dele some), saturacao (soma do glifo mais
  // denso), rampaSino. cortes: cortes (M, por volta; N múltiplo de M), cascas (do
  // fantoma), cavidades (as duas pequenas de dentro), alturaFileira (linhas), aspecto
  // (largura/altura do corte), vao (colunas entre cortes), deslize (quadros deslizando em
  // cada passo), anel (espessura do anel, em células), rampaCortes (de fora para dentro).
  padrao: {
    variacao: 'deriva', periodo: 96, alcance: 5,
    piso: 0.64, pesoA: 0.5,
    espaco: 3.5, corte: 0.34, forte: 0.72,
    furos: 0.38,
    margem: 3, pulso: { inicio: 40, achado: 12 },
    rastro: 24, pontos: 0.05,
    objetos: 5, onda: 104, espessura: 0.45, limiar: 0.5, saturacao: 1.3, rampaSino: '·:-=+',
    cortes: 12, cascas: 3, cavidades: true, alturaFileira: 7, aspecto: 0.92, vao: 3, deslize: 4,
    anel: 0.9, rampaCortes: ':=+',
  },
  predefinicoes: {
    deriva: { variacao: 'deriva' },
    linhas: { variacao: 'linhas' },
    sinograma: { variacao: 'sinograma' },
    varredura: { variacao: 'varredura' },
    cortes: { variacao: 'cortes' },
    marca: { variacao: 'marca', furos: 0.8 },
  },
  desenhar(grade, { quadro, semente, params, parado, entrada }) {
    const desenho = DESENHOS[params.variacao];
    if (!desenho) throw new Error(`variacao desconhecida: ${params.variacao} (aceita ${VARIACOES.join(', ')})`);
    const N = params.periodo;
    if (!Number.isInteger(N) || N <= 0 || N % 3 !== 0) throw new Error(`periodo tem de ser inteiro positivo múltiplo de 3: ${N}`);
    const q = parado ? quadroParado(params.variacao, N, grade.cols, grade.linhas, params) : mod(quadro, N);
    const s = semente | 0;
    desenho(grade, q, N, s, params);

    // ponteiro: as células perto sobem um tom (só o tom)
    const p = !parado && params.alcance > 0 ? ponteiroNaGrade(entrada, grade) : null;
    if (!p) return;
    const a = params.alcance;
    for (let y = Math.max(0, Math.floor(p.y - a / 2)); y <= Math.min(grade.linhas - 1, Math.ceil(p.y + a / 2)); y++) {
      for (let x = Math.max(0, Math.floor(p.x - a)); x <= Math.min(grade.cols - 1, Math.ceil(p.x + a)); x++) {
        if (Math.hypot(x - p.x, 2 * (y - p.y)) > a) continue;
        const i = y * grade.cols + x;
        if (grade.car[i] === ' ') continue;
        const t = ACIMA[grade.tom[i]];
        if (t !== undefined) grade.tom[i] = t;
      }
    }
  },
});
