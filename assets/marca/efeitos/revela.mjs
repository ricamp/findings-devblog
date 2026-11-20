// Efeito "revela": a barra terracota do logo é a peça que se move, e o nome aparece por
// máscara (o que está atrás dela, ou o que sai de trás dela), não por bytes voando.
//
// O texto é o logo numa linha: `findings` em tinta, `/` em achado, o lugar em tinta-2
// (`lugar`: devblog, vazio = o logo curto `findings/`, ou o nome de um modelo). Ele fica
// onde o efeito montagem e o logo estático o põem (a linha do meio, centrado; mais largo que
// a grade começa na coluna 0), e o último quadro da entrada é, célula a célula, o logo parado.
//
// A barra é sempre o glifo `/` da fonte, uma só, numa célula da linha do texto (em achado; no
// ícone, antes de acender, em tinta-3; no corta, descendo na coluna do corte até essa linha).
// Nada de blocos nem de barra mais alta: é a tipografia normal. A suavidade vem do tempo: a
// posição segue uma cúbica que entra rápido e assenta devagar (1 − (1 − u)³).
//
// O movimento é descrito de forma contínua por estado(q, L, t, cols), com t em quadros
// lógicos (fração permitida): a posição da barra (em células, com fração; barraY, a linha,
// só no corta, em que ela desce; nos outros é a linha do texto) e as camadas de
// texto, cada uma com um deslocamento dx e uma janela [de, ate) em células fora da qual não
// aparece (a máscara). O efeito arredonda tudo para a célula (o motor é de células, 12 por
// segundo); o vídeo (video/cena.mjs) desenha o mesmo estado em pixels, a 60 por segundo, com
// a barra e as letras andando em fração de célula.
//
// Estilos (`estilo`, um por predefinição):
//
//   varre  a barra nasce à esquerda do nome, corre para a direita e o `findings` vai sendo
//          descoberto atrás dela; ela para no lugar da /; o lugar sai de trás dela para a
//          direita (desliza e só aparece à direita da barra).
//   abre   a barra sozinha no lugar da /; `findings` desliza para fora dela à esquerda e o
//          lugar à direita, como se estivessem escondidos atrás.
//   corta  a barra corta a palavra em duas. Começa vazio; no quadro `aparece` surge o nome
//          fechado, sem barra e sem espaço (`findingsdevblog`), apagado em tinta-3, meia
//          célula para dentro de cada lado (o conjunto fica centrado onde o logo vai ficar).
//          No quadro `queda`[0] a barra aparece inteira `altura` linhas acima do texto, na
//          coluna do corte, e desce freando até a linha do texto (`queda`[1]). Antes de ela
//          chegar à linha do texto as metades se afastam meia célula cada (enquanto a barra
//          desce a penúltima linha), então a barra nunca cobre letra; no motor, que é de
//          células, isso é um passo só (o `findings` volta uma célula). Do quadro `luz` em
//          diante as letras acendem no tom do logo, do corte para fora, uma a cada `passo`.
//   icone  começa no ícone `f/` (o f em tinta, a / em tinta-3, no lugar do logo); a barra
//          acende em achado e anda para a direita, e o resto de `findings` sai de trás dela;
//          o lugar sai como no varre; termina no logo completo.
//
// Fases (`fase`): entrada (quadro < 0: vazio; de duracao() em diante: o logo parado); saida
// (a entrada ao contrário: o quadro n da saída é o quadro D − n da entrada; a barra é a última
// a sumir, menos no corta, em que as letras apagam das pontas para o corte, as metades se
// fecham enquanto a barra sobe e some, e o nome fechado é o último; no fim, vazio); laco (entrada,
// `pausa` quadros parado, saída e `vazio` quadros vazios, e de novo). `parado`: o logo.

import { registrar, por, efeito } from '../motor/nucleo.mjs';

export const ESTILOS = ['varre', 'abre', 'corta', 'icone'];

// O logo como peças (o formato de montagem.mjs).
export function pecasDoLogo(lugar = 'devblog') {
  const l = [['findings', 'tinta'], ['/', 'achado']];
  if (lugar) l.push([String(lugar), 'tinta-2']);
  return [l];
}

// Onde fica cada caractere: a mesma conta de leiaute() em montagem.mjs (uma linha).
export function leiauteDoLogo(cols, linhas, lugar = 'devblog') {
  const raiz = [...'findings'].map((c) => ({ c, tom: 'tinta', parte: 'raiz' }));
  const resto = [...String(lugar ?? '')].map((c) => ({ c, tom: 'tinta-2', parte: 'lugar' }));
  const chars = [...raiz, { c: '/', tom: 'achado', parte: 'barra' }, ...resto];
  const n = chars.length;
  const y = linhas > 1 ? Math.floor((linhas - 1) / 2) : 0;
  const x0 = n >= cols ? 0 : Math.floor((cols - n) / 2);
  chars.forEach((ch, i) => { ch.x = x0 + i; });
  return {
    chars, y, x0, xs: x0 + raiz.length, x1: x0 + n - 1,
    raiz: chars.filter((c) => c.parte === 'raiz'),
    lugar: chars.filter((c) => c.parte === 'lugar' && c.c !== ' '),
  };
}

// Parâmetros completos de uma predefinição (padrão, predefinição e os dados), como o
// motor os monta: serve para saber a duração fora do efeito (o vídeo).
export function paramsDe(predefinicao, params = {}) {
  const ef = efeito('revela');
  return { ...ef.padrao, ...(ef.predefinicoes[predefinicao] ?? {}), ...params };
}

const suave = (u) => 1 - (1 - u) ** 3; // entra rápido, assenta devagar
const fracao = (t, [a, b]) => (b <= a ? (t >= b ? 1 : 0) : Math.min(1, Math.max(0, (t - a) / (b - a))));
const misto = (a, b, k) => a + (b - a) * k;

// No corta, a distância (em células) de cada letra ao corte: 1 para as vizinhas da barra.
const aoCorte = (L, ch) => Math.abs(ch.x - L.xs);
// e a maior delas (a última a acender), sem depender da grade.
const maisLonge = (lugar) => Math.max([...'findings'].length, [...String(lugar ?? '')].length);

// Quadro lógico em que tudo para (o primeiro igual ao logo parado). Sem lugar (o logo
// curto), no varre e no ícone não há nada saindo de trás da barra: para com ela. No corta,
// quando a barra assentou e a letra mais longe do corte acendeu. Não depende da grade (cols
// fica na assinatura para quem chama).
export function duracao(params, cols) {
  const { estilo, viagem, sai } = params;
  if (estilo === 'abre') return sai[1];
  if (estilo === 'corta') {
    return Math.ceil(Math.max(params.queda[1], params.luz + (maisLonge(params.lugar) - 1) * params.passo) - 1e-9);
  }
  const temLugar = String(params.lugar ?? '').trim() !== '';
  return temLugar ? Math.max(viagem[1], sai[1]) : viagem[1];
}

// O estado da entrada no tempo t (quadros lógicos, com fração): { barra, tomBarra, camadas }
// (no corta, também barraY) ou null (t ≥ duração: o logo parado). barra: a coluna da célula
// da barra, com fração, ou null (sem barra); barraY: a linha dela, com fração (sem barraY, a
// linha do texto).
// camadas: [{ chars, dx, de, ate }]: cada caractere aparece em ch.x + dx se a célula dele
// cair inteira em [de, ate). Antes do quadro 0: { barra: null, camadas: [] } (vazio).
export function estado(q, L, t, cols) {
  if (t < 0) return { barra: null, camadas: [] };
  if (t >= duracao(q, cols)) return null;
  const e = (iv) => suave(fracao(t, iv));
  const nl = L.lugar.length;
  const saindo = (b, k) => [
    { chars: L.raiz, dx: 0, de: -Infinity, ate: b },
    { chars: L.lugar, dx: -nl * (1 - k), de: Math.max(b, L.xs) + 1, ate: Infinity },
  ];
  switch (q.estilo) {
    case 'varre': {
      const b = misto(L.x0 - 2, L.xs, e(q.viagem));
      return { barra: b, tomBarra: 'achado', camadas: saindo(b, e(q.sai)) };
    }
    case 'abre': {
      const k = e(q.sai);
      return {
        barra: L.xs, tomBarra: 'achado', camadas: [
          { chars: L.raiz, dx: (L.xs - L.x0) * (1 - k), de: -Infinity, ate: L.xs },
          { chars: L.lugar, dx: -nl * (1 - k), de: L.xs + 1, ate: Infinity },
        ],
      };
    }
    case 'corta': {
      if (t < q.aparece) return { barra: null, tomBarra: 'achado', camadas: [] };
      // a barra: inteira dentro da grade desde o primeiro quadro em que aparece
      const y0 = Math.max(0, L.y - q.altura);
      const by = t >= q.queda[0] ? misto(y0, L.y, e(q.queda)) : null;
      // as metades se afastam enquanto a barra desce a penúltima linha (de L.y − 2 a L.y − 1):
      // quando ela encosta na linha do texto, o corte já está aberto
      const p = by === null ? 0 : Math.min(1, Math.max(0, by - (L.y - 2)));
      const k = p * p * (3 - 2 * p);
      const tons = (chars) => chars.map((ch) => (
        t >= q.luz + (aoCorte(L, ch) - 1) * q.passo ? ch : { ...ch, tom: 'tinta-3' }));
      return {
        barra: by === null ? null : L.xs, barraY: by, tomBarra: 'achado', camadas: [
          { chars: tons(L.raiz), dx: 0.5 * (1 - k), de: -Infinity, ate: Infinity },
          { chars: tons(L.lugar), dx: -0.5 * (1 - k), de: -Infinity, ate: Infinity },
        ],
      };
    }
    case 'icone': {
      if (t < q.acende) {
        return { barra: L.x0 + 1, tomBarra: 'tinta-3', camadas: [{ chars: [L.raiz[0]], dx: 0, de: -Infinity, ate: Infinity }] };
      }
      const b = misto(L.x0 + 1, L.xs, e(q.viagem));
      return { barra: b, tomBarra: 'achado', camadas: saindo(b, e(q.sai)) };
    }
    default:
      throw new Error(`estilo desconhecido em revela: ${q.estilo}`);
  }
}

// O estado arredondado para a célula. A barra e as janelas usam o mesmo arredondamento
// (round(b + 1) = round(b) + 1), então a máscara encosta na barra sem buraco nem sobra.
export function rasterizar(grade, L, s) {
  for (const cam of s.camadas) {
    const dx = Math.round(cam.dx), de = Math.round(cam.de), ate = Math.round(cam.ate);
    for (const ch of cam.chars) {
      if (ch.c === ' ') continue;
      const x = ch.x + dx;
      if (x >= de && x < ate) por(grade, x, L.y, ch.c, ch.tom);
    }
  }
  if (s.barra !== null) por(grade, Math.round(s.barra), Math.round(s.barraY ?? L.y), '/', s.tomBarra);
}

function parado(grade, L) {
  for (const ch of L.chars) if (ch.c !== ' ') por(grade, ch.x, L.y, ch.c, ch.tom);
}

function entrada(grade, L, t, q) {
  const s = estado(q, L, t, grade.cols);
  if (s) rasterizar(grade, L, s);
  else parado(grade, L);
}

registrar('revela', {
  // estilo: varre, abre, corta ou icone (uma predefinição cada). lugar: o que vem depois da
  // barra (vazio = o logo curto). fase: entrada, saida ou laco. Tempos em quadros lógicos:
  // viagem [de, até] (a barra andando), sai [de, até] (os nomes saindo de trás dela),
  // acende (icone: a / do ícone acende). Só no corta: aparece (o nome fechado surge), queda
  // [de, até] (a barra descendo), altura (de quantas linhas acima do texto ela desce, sem
  // sair da grade), luz (a primeira letra acende) e passo (quadros entre uma letra e a
  // seguinte). pausa e vazio: o logo parado e a grade vazia no laço.
  padrao: {
    estilo: 'varre', lugar: 'devblog', fase: 'entrada',
    viagem: [0, 16], sai: [12, 22], acende: 6, pausa: 24, vazio: 6,
    aparece: 1, queda: [3, 9], altura: 3, luz: 7, passo: 1,
  },
  predefinicoes: {
    varre: { estilo: 'varre', viagem: [0, 16], sai: [12, 22] },
    abre: { estilo: 'abre', sai: [2, 16] },
    corta: { estilo: 'corta', aparece: 1, queda: [3, 9], altura: 3, luz: 7, passo: 1 },
    icone: { estilo: 'icone', acende: 6, viagem: [7, 19], sai: [15, 25] },
  },
  desenhar(grade, ctx) {
    const q = ctx.params;
    if (!ESTILOS.includes(q.estilo)) throw new Error(`estilo desconhecido em revela: ${q.estilo}`);
    const L = leiauteDoLogo(grade.cols, grade.linhas, q.lugar);
    if (ctx.parado) { parado(grade, L); return; }
    const D = duracao(q, grade.cols);
    const n = Math.floor(ctx.quadro);
    if (q.fase === 'entrada') entrada(grade, L, n, q);
    else if (q.fase === 'saida') { if (n < 0) parado(grade, L); else entrada(grade, L, D - n, q); }
    else if (q.fase === 'laco') {
      const P = D + q.pausa + D + 1 + q.vazio;
      const t = ((n % P) + P) % P;
      if (t < D + q.pausa) entrada(grade, L, t, q);
      else entrada(grade, L, D - (t - D - q.pausa), q);
    } else throw new Error(`fase desconhecida em revela: ${q.fase}`);
  },
});
