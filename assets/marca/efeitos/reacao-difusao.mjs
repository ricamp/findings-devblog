// Efeito "reacao-difusao": Gray-Scott, o par de substâncias U e V que se espalham e reagem
// (U + 2V → 3V; U é reposta à taxa F, V some à taxa k + F). Conforme F e k o campo V vira
// labirinto (como osso trabecular), manchas soltas ou coral.
//
// Simulação: grade com as colunas da grade de texto e o DOBRO das linhas (duas amostras por
// célula na vertical, porque a célula mono é alta: assim a amostra é quadrada no papel),
// bordas periódicas, laplaciano 3×3 (lados 0,2, cantos 0,05). Começa com U = 1 e V = 0 e,
// nos blocos de `grao` amostras que hash2 sorteia abaixo de `densidade`, U = 0,5 e V = 0,25.
// Anda `passos` iterações por quadro lógico até `maturidade` quadros e então congela; o
// quadro 0 já vem com `preparo` quadros andados.
//
// Depois disso só o limiar se move: limiar = centro + amplitude·sin(t·ritmo). Desenho: V
// da célula (média das duas amostras) abaixo do limiar é vazio; acima, a densidade
// ` ·:-=+*#` vai do limiar até `topo`. A faixa estreita junto ao limiar (V − limiar <
// banda, só nas células acesas que encostam numa apagada, 4-vizinhança) vai em `achado`,
// como `·`: é o contorno das estruturas, que acompanha o limiar.
//
// Rolagem (com data-reativo): o padrão desliza para cima `rolar` linhas por página rolada
// (as bordas são periódicas, então o deslizamento não abre buraco; anda de meia em meia
// linha, uma amostra). Parado, ou rolagem 0 ou ausente, nada muda.
//
// Cache: a simulação depende da história, e o quadro pode ser pedido fora de ordem (na
// gravação de vídeo, por exemplo). Por chave (tamanho, semente, parâmetros da simulação)
// fica o estado do último quadro calculado e, à parte, o estado maduro. Pedido de quadro
// anterior ao guardado refaz da semente. Mesma chave, mesma conta, mesmo resultado: o
// cache só economiza tempo. No máximo 8 chaves (a mais antiga sai).

import { registrar, por, hash2 } from '../motor/nucleo.mjs';
import { tempo } from './_comum.mjs';

const DENSIDADE = ' ·:-=+*#';
const MAX_CACHE = 8;
const cache = new Map();

// Só para os testes.
export function _tamanhoDoCache() { return cache.size; }
export function _limparCache() { cache.clear(); }

function semear(e) {
  const { W, H, semente, densidade, grao } = e;
  const g = Math.max(1, Math.round(grao));
  e.u.fill(1);
  e.v.fill(0);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (hash2(Math.floor(x / g), Math.floor(y / g), semente) < densidade) {
        e.u[y * W + x] = 0.5;
        e.v[y * W + x] = 0.25;
      }
    }
  }
  e.feitos = 0;
}

// Um quadro lógico: `passos` iterações de Gray-Scott, com troca de buffers.
function andar(e) {
  const { W, H, F, k, du, dv, passos } = e;
  let { u, v, u2, v2 } = e;
  for (let s = 0; s < passos; s++) {
    for (let y = 0; y < H; y++) {
      const ym = ((y + H - 1) % H) * W, y0 = y * W, yp = ((y + 1) % H) * W;
      for (let x = 0; x < W; x++) {
        const xm = (x + W - 1) % W, xp = (x + 1) % W, i = y0 + x;
        const ui = u[i], vi = v[i];
        const lu = 0.2 * (u[ym + x] + u[yp + x] + u[y0 + xm] + u[y0 + xp])
          + 0.05 * (u[ym + xm] + u[ym + xp] + u[yp + xm] + u[yp + xp]) - ui;
        const lv = 0.2 * (v[ym + x] + v[yp + x] + v[y0 + xm] + v[y0 + xp])
          + 0.05 * (v[ym + xm] + v[ym + xp] + v[yp + xm] + v[yp + xp]) - vi;
        const uvv = ui * vi * vi;
        u2[i] = ui + du * lu - uvv + F * (1 - ui);
        v2[i] = vi + dv * lv + uvv - (k + F) * vi;
      }
    }
    [u, u2] = [u2, u];
    [v, v2] = [v2, v];
  }
  Object.assign(e, { u, v, u2, v2 });
  e.feitos++;
}

// Campo V (W × 2·linhas) depois de `alvo` quadros lógicos (0 ≤ alvo ≤ maturidade).
export function campoV(cols, linhas, semente, params, alvo) {
  const { F, k, du, dv, passos, densidade, grao, maturidade } = params;
  const chave = [cols, linhas, semente, F, k, du, dv, passos, densidade, grao, maturidade].join('|');
  let e = cache.get(chave);
  if (e) {
    cache.delete(chave); // reinsere no fim: a mais usada fica
  } else {
    const W = cols, H = 2 * linhas, n = W * H;
    e = {
      W, H, semente, F, k, du, dv, densidade, grao,
      passos: Math.max(0, Math.round(passos)),
      u: new Float64Array(n), v: new Float64Array(n), u2: new Float64Array(n), v2: new Float64Array(n),
      feitos: 0, maduro: null,
    };
    semear(e);
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
  }
  cache.set(chave, e);
  if (alvo === maturidade && e.maduro) return e.maduro;
  if (e.feitos > alvo) semear(e);
  while (e.feitos < alvo) andar(e);
  if (alvo === maturidade) {
    e.maduro = Float64Array.from(e.v);
    return e.maduro;
  }
  return e.v;
}

registrar('reacao-difusao', {
  // F, k: taxas de reposição de U e de remoção de V. du, dv: difusões (por iteração).
  // passos: iterações por quadro lógico; maturidade: quadros até congelar. preparo:
  //   quadros já andados no quadro 0 (o começo já mostra o padrão nascendo, não as sementes).
  // densidade, grao: semeadura (fração de blocos semeados, lado do bloco em amostras).
  // centro, amplitude, ritmo: limiar = centro + amplitude·sin(t·ritmo), em unidades de V.
  // topo: V que já leva o glifo mais denso. banda: meia largura da faixa em achado.
  // rolar: linhas que o padrão sobe por página rolada (0 desliga).
  padrao: {
    velocidade: 1, F: 0.029, k: 0.057, du: 0.5, dv: 0.2, passos: 20, maturidade: 180, preparo: 20,
    densidade: 0.1, grao: 2, centro: 0.165, amplitude: 0.045, ritmo: 0.5, topo: 0.34, banda: 0.016,
    rolar: 4, tom: 'tinta-2',
  },
  predefinicoes: {
    trabecular: {},
    manchas: { F: 0.035, k: 0.065 },
    coral: { F: 0.0545, k: 0.062, densidade: 0.08, grao: 4, centro: 0.2, topo: 0.4 },
  },
  desenhar(grade, ctx) {
    const { params: p, semente = 0, quadro = 0, parado } = ctx;
    const { cols, linhas } = grade;
    const maturidade = Math.max(0, Math.round(p.maturidade));
    const andados = parado ? maturidade
      : Math.min(maturidade, Math.max(0, Math.round(p.preparo) + Math.floor(quadro * (p.velocidade ?? 1))));
    const V = campoV(cols, linhas, semente, { ...p, maturidade }, andados);
    const limiar = parado ? p.centro : p.centro + p.amplitude * Math.sin(tempo(ctx) * p.ritmo);
    const faixa = Math.max(1e-6, p.topo - limiar);
    const valor = new Float64Array(cols * linhas);
    const rol = parado ? 0 : Math.min(1, Math.max(0, Number(ctx.entrada?.rolagem) || 0));
    const H = 2 * linhas;
    const dy = Math.round(rol * (p.rolar ?? 0) * 2);   // em amostras (meia linha)
    const linhaV = (k) => ((k + dy) % H + H) % H;
    for (let y = 0; y < linhas; y++)
      for (let x = 0; x < cols; x++)
        valor[y * cols + x] = (V[linhaV(2 * y) * cols + x] + V[linhaV(2 * y + 1) * cols + x]) / 2;
    // apagada: fora da grade não conta (a borda da grade não vira contorno)
    const apagada = (x, y) => x >= 0 && y >= 0 && x < cols && y < linhas && valor[y * cols + x] < limiar;
    for (let y = 0; y < linhas; y++) {
      for (let x = 0; x < cols; x++) {
        const a = valor[y * cols + x];
        if (a < limiar) continue;
        if (a - limiar < p.banda
          && (apagada(x - 1, y) || apagada(x + 1, y) || apagada(x, y - 1) || apagada(x, y + 1))) {
          por(grade, x, y, '·', 'achado');
          continue;
        }
        const i = Math.min(DENSIDADE.length - 1, 1 + Math.floor((a - limiar) / faixa * (DENSIDADE.length - 1)));
        por(grade, x, y, DENSIDADE[i], p.tom);
      }
    }
  },
});
