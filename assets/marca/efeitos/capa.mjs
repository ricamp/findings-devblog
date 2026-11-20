// Efeito "capa": a capa de modelo em formato de ficha de exame. Moldura fina em tinta-3;
// na linha de cima o rótulo findings/<chave> (as cores do logo) e o número da entrada;
// no meio o nome em letras-de-dados (com o reforço `chapa` por padrão), com o fundo de assinatura do modelo em volta; embaixo
// a descrição, uma divisória e o rodapé com data · versão · commit e a bandeira com o aviso.
//
//   ┌─ findings/abreu ───────────────────────── 0007 ─┐   linha 0
//   │        (fundo de assinatura, fora do halo)      │
//   │                NOME EM LETRAS DE DADOS          │
//   │  CXR · frontal · 14 findings                    │   linha L-4
//   ├─────────────────────────────────────────────────┤   linha L-3
//   │  2026-11-17 · Abreu v1 · cf3928e  ▛ not a me…   │   linha L-2
//   └─────────────────────────────────────────────────┘   linha L-1
//
// Textos começam na coluna 3 e terminam na coluna C-4: a mesma margem interna dos dois
// lados, em todas as linhas. Texto que não cabe corta com "…".
//
// Tudo que é texto vem de modelos.json (motor/modelos.mjs); `entrada.dados` (modelo,
// numero, data, versao, commit) vence a estreia da tabela e `dados.modelo` vence
// `params.modelo`. Semente 0 vira sementeDe('findings/' + chave).
//
// Fundo de assinatura: o efeito e a predefinição da tabela (mais os `params` da
// assinatura, se houver), renderizados na área do nome (colunas 1 a C-2, linhas 1 a L-5),
// todo tom em tinta-3, e só passa a fração `fundo` das células (hash2 com sal próprio).
// Nunca entra no halo (o nome com 2 colunas e 1 linha de folga), nem da linha L-4 em
// diante, nem na moldura; e guarda folga: fica entre as colunas dos textos (3 a C-4) e
// deixa vazias a linha 1 e a L-5, para não engrossar a moldura nem colar na descrição. Ponteiro e rolagem vão ao fundo e ao nome, nas coordenadas da
// subgrade.
//
// Capa estreita (nome quebrado ou menos de ESTREITA colunas): a área livre é pouca e de
// outra proporção, então a assinatura pode trazer um bloco `estreita` ({ fundo,
// predefinicao, params }) que vale por cima dela; os params do bloco se somam aos da
// assinatura. Sem o bloco, a capa estreita usa a assinatura como está.
//
// Variações (estaticos/variar_capa.mjs): `params.assinatura` troca a assinatura da tabela
// inteira, e a assinatura pode trazer, além de efeito/predefinicao/fundo/params/estreita:
// `semente` (a semente da capa quando ctx.semente é 0), `reforco` (a forma das letras,
// 'chapa' ou 'nenhum') e `composicao` ('centro', o padrão; 'quebra', o nome em duas linhas
// quando a área deixa; 'lado', o nome encostado na margem dos textos e o fundo renderizado
// só no campo à direita do halo, para um sólido 3D ficar inteiro ao lado do nome; sem
// espaço para o campo, volta a 'centro'). `params.composicao` vence a da assinatura. Sem
// esses campos, nada muda.
//
// Montagem (duracao > 0), em fração de duracao: 0–35% a moldura se traça do canto
// superior esquerdo nos dois sentidos até fechar no inferior direito; 25–60% os textos se
// digitam; 40–100% o nome se resolve coluna a coluna (antes, cada ponto é "· " em
// tinta-3); 60–100% o fundo sobe de 0 ao valor de `fundo`. Na montagem o nome e o fundo
// vêm parados, então o fim da montagem é a ficha parada. `laco` recomeça após duracao + 4 s.
//
// Progresso controlado por fora (rolagem, por exemplo): `params.progresso` de 0 a 1 faz o
// papel do tempo da montagem, sem relógio: 0 é a grade vazia, 1 é a capa completa (a mesma
// da capa parada) e cada valor dá sempre a mesma grade. Sem `progresso` (null ou ausente),
// nada muda.
//
// Camadas, para paralaxe: `params.camadas`, lista com 'moldura' (a moldura e os textos),
// 'fundo' e 'nome'; o padrão (null) é as três. As três não se sobrepõem: a soma das capas de
// uma camada só dá a capa inteira.
//
// Grade abaixo de 40×14: sem moldura, só o nome (o que couber).

import { registrar, renderizar, por, hash2, sementeDe } from '../motor/nucleo.mjs';
import { compor, larguraEmPontos } from '../motor/letra.mjs';
import { modelo as linhaDoModelo, BANDEIRA, AVISO } from '../motor/modelos.mjs';
import { tempo, limitar } from './_comum.mjs';
// os efeitos que a capa compõe
import './letras-de-dados.mjs';
import './janela.mjs';
import './bordas.mjs';
import './reacao-difusao.mjs';
import './heatmap.mjs';
import './reconstrucao.mjs';

const SAL_FUNDO = 0x51ed270b;
const FUNDO_PADRAO = 0.5;
const MOLDURA_COLS = 40;
const MOLDURA_LINHAS = 14;
const PAUSA_LACO = 4;   // segundos parados antes de recomeçar
const MARGEM = 3;       // primeira coluna dos textos; a última é C-1-MARGEM
const ESTREITA = 80;    // abaixo disso a capa é estreita (vale assinatura.estreita)
const FOLGA_NOME = 2;   // colunas livres entre o nome e a moldura (ou a borda), de cada lado
const LADO_MIN = 30;    // colunas mínimas do campo do fundo na composição 'lado'

// Partes do nome: uma linha, ou duas cortadas na quebra.
function partesDoNome(nome, quebra) {
  const letras = [...nome];
  return quebra === null ? [nome] : [letras.slice(0, quebra).join(''), letras.slice(quebra).join('')];
}

// Geometria da capa. nome: o retângulo ocupado pelo nome (cortado na área); halo: o nome
// com 2 colunas de cada lado e 1 linha acima e abaixo; area: onde nome e fundo desenham;
// sub: a subgrade em que letras-de-dados desenha o nome (pode passar da área: corta).
export function leiauteDaCapa(cols, linhas, chave, composicao = 'centro', linhaDada = null) {
  const m = linhaDada ?? linhaDoModelo(chave);
  const moldura = cols >= MOLDURA_COLS && linhas >= MOLDURA_LINHAS;
  const area = moldura ? { x: 1, y: 1, cols: cols - 2, linhas: linhas - 5 } : { x: 0, y: 0, cols, linhas };

  // numa linha só se sobrarem 2 colunas livres de cada lado (mais a moldura, se houver);
  // senão quebra, e o nome não encosta na moldura
  const uma = 2 * larguraEmPontos(m.nome) + 2 * (FOLGA_NOME + (moldura ? 1 : 0)) <= cols;
  const q = m.quebra;
  const podeQuebrar = Number.isInteger(q) && q > 0 && q < [...m.nome].length && area.linhas >= 15;
  let quebra = !uma && podeQuebrar ? q : null;
  // composições (variações de capa): 'quebra' força as duas linhas quando dá; 'lado' encosta
  // o nome na margem dos textos e deixa à direita um campo de pelo menos LADO_MIN colunas
  // para o fundo (com o nome inteiro se couber, senão quebrado); sem espaço, volta a 'centro'
  let comp = 'centro';
  if (composicao === 'quebra' && podeQuebrar && moldura) {
    quebra = q;
    comp = 'quebra';
  } else if (composicao === 'lado' && moldura) {
    const sobra = (w) => cols - 1 - MARGEM - (MARGEM + w + FOLGA_NOME);
    const larguraQuebrada = podeQuebrar
      ? 2 * Math.max(larguraEmPontos([...m.nome].slice(0, q).join('')), larguraEmPontos([...m.nome].slice(q).join('')))
      : Infinity;
    if (sobra(2 * larguraEmPontos(m.nome)) >= LADO_MIN) { quebra = null; comp = 'lado'; }
    else if (sobra(larguraQuebrada) >= LADO_MIN) { quebra = q; comp = 'lado'; }
  }

  // O nome é desenhado numa subgrade da largura exata do bloco mais largo; dentro dela vale
  // a conta de letras-de-dados (pontosAcesos): cada bloco centrado em pontos. A subgrade é
  // posta de modo que a tinta do nome (os pontos acesos, não o bloco) fique centrada na
  // grade inteira: o I tem a última coluna de pontos vazia, e DAMOI centrado pelo bloco
  // ficava com 1 coluna livre de um lado e 3 do outro.
  const blocos = partesDoNome(m.nome, quebra).map((p) => {
    const linhasDoBloco = compor(p);
    let a = Infinity, b = -Infinity;
    for (const l of linhasDoBloco) {
      const i = l.indexOf('#'), j = l.lastIndexOf('#');
      if (i >= 0) { a = Math.min(a, i); b = Math.max(b, j); }
    }
    return { w: 2 * linhasDoBloco[0].length, a: 2 * a, b: 2 * b + 2 };
  });
  const largura = Math.max(...blocos.map((k) => k.w));
  const altura = blocos.length * 8 - 1;
  // tinta, em colunas da subgrade
  let x0 = Infinity, x1 = -Infinity;
  for (const k of blocos) {
    const x = 2 * Math.floor((largura - k.w) / 4);
    x0 = Math.min(x0, x + k.a);
    x1 = Math.max(x1, x + k.b);
  }
  // centrado pela tinta; em 'lado', a tinta começa na coluna dos textos
  const sx = comp === 'lado' ? MARGEM - x0 : Math.floor((cols - (x1 - x0)) / 2) - x0;
  const sub = { x: sx, y: area.y, cols: largura, linhas: area.linhas };
  x0 += sub.x;
  x1 += sub.x;
  const y0 = area.y + Math.floor((area.linhas - altura) / 2);
  const nx = Math.max(x0, area.x), ny = Math.max(y0, area.y);
  const nome = {
    x: nx, y: ny,
    cols: Math.max(0, Math.min(x1, area.x + area.cols) - nx),
    linhas: Math.max(0, Math.min(y0 + altura, area.y + area.linhas) - ny),
  };
  const halo = { x: nome.x - 2, y: nome.y - 1, cols: nome.cols + 4, linhas: nome.linhas + 2 };
  // campo: onde o efeito de fundo é renderizado (a área inteira; em 'lado', só a faixa à
  // direita do halo, para que um sólido 3D fique centrado nela e não atrás do nome)
  let campo = area;
  if (comp === 'lado') {
    const x = halo.x + halo.cols;
    campo = { x, y: area.y, cols: area.x + area.cols - x, linhas: area.linhas };
  }
  return { moldura, quebra, nome, halo, area, sub, composicao: comp, campo };
}

// Corta em n caracteres, com "…" no último quando sobra texto.
function cortar(texto, n) {
  const c = [...String(texto)];
  if (n <= 0) return '';
  return c.length <= n ? c.join('') : c.slice(0, n - 1).join('') + '…';
}

// Escreve os k primeiros caracteres de um texto a partir de (x, y); tomDe(i) dá o tom.
function escrever(grade, x, y, texto, k, tomDe) {
  const c = [...texto];
  for (let i = 0; i < Math.min(k, c.length); i++) por(grade, x + i, y, c[i], tomDe(i));
}

// A assinatura que vale nesta capa: na estreita, o bloco `estreita` por cima.
export function assinaturaDaCapa(assinatura, cols, quebra) {
  const e = assinatura.estreita;
  if (!e || (quebra === null && cols >= ESTREITA)) return assinatura;
  return {
    ...assinatura, ...e,
    predefinicao: 'predefinicao' in e ? e.predefinicao : assinatura.predefinicao,
    params: { ...(assinatura.params ?? {}), ...(e.params ?? {}) },
  };
}

const valor = (v) => (v === undefined || v === null || v === '' ? null : String(v));

export const CAMADAS = ['moldura', 'fundo', 'nome'];
function lerCamadas(c) {
  if (c === undefined || c === null) return new Set(CAMADAS);
  const lista = Array.isArray(c) ? c : [c];
  for (const n of lista) if (!CAMADAS.includes(n)) throw new Error(`camada desconhecida na capa: ${n} (camadas: ${CAMADAS.join(', ')})`);
  return new Set(lista);
}

registrar('capa', {
  // modelo: chave em modelos.json (dados.modelo vence). fundo: fração do fundo de
  //   assinatura que passa (0 desliga); null usa o `fundo` da assinatura do modelo em
  //   modelos.json e, sem ele, 0,5. duracao (s), laco: a montagem; 0 = ficha pronta.
  // descricao: null usa a da tabela; texto troca (para testes de corte).
  // reforco: o reforço do nome em letras-de-dados; 'chapa' (o padrão da capa: cada ponto
  //   aceso é uma chapa de tinta com o byte em papel, para o nome se ler pequeno) ou
  //   'nenhum' (a letra de sempre).
  padrao: { velocidade: 1, modelo: 'damoiseau', fundo: null, duracao: 0, laco: false, descricao: null, reforco: 'chapa' },
  predefinicoes: {
    ficha: {},
    montar: { duracao: 3 },
    limpa: { fundo: 0 },
  },
  desenhar(grade, ctx) {
    const { params: q, entrada } = ctx;
    const { cols: C, linhas: L } = grade;
    const dados = entrada.dados ?? {};
    const chave = valor(dados.modelo) ?? q.modelo;
    const m = linhaDoModelo(chave);
    // params.assinatura (variações de capa) troca a assinatura da tabela inteira
    const assinatura = q.assinatura ?? m.assinatura;
    const lei = leiauteDaCapa(C, L, chave, q.composicao ?? assinatura.composicao ?? 'centro');
    const { area, nome, campo } = lei;
    // semente 0: a da assinatura, se houver, senão a do nome do modelo
    const semente = ctx.semente ? ctx.semente
      : Number.isInteger(assinatura.semente) ? assinatura.semente >>> 0 : sementeDe('findings/' + chave);

    const camadas = lerCamadas(q.camadas);
    // progresso da montagem; 1 = ficha pronta. params.progresso (de fora) vence o relógio.
    const externo = q.progresso !== undefined && q.progresso !== null;
    const montagem = q.duracao > 0 || externo;
    let k = 1;
    if (externo) {
      k = limitar(Number(q.progresso) || 0, 0, 1);
      if (k <= 0) return;
    } else if (montagem && !ctx.parado) {
      let t = tempo(ctx);
      if (q.laco) t %= q.duracao + PAUSA_LACO;
      k = limitar(t / q.duracao, 0, 1);
    }
    const fase = (a, b) => limitar((k - a) / (b - a), 0, 1);
    const parado = ctx.parado || montagem;

    // ponteiro e rolagem para uma subgrade com canto em (r.x, r.y)
    const p = entrada.ponteiro;
    const entradaDe = (r) => ({
      ponteiro: p && Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: p.x - r.x, y: p.y - r.y } : null,
      rolagem: entrada.rolagem ?? 0,
    });
    const base = { cols: area.cols, linhas: area.linhas, quadro: ctx.quadro, semente, entrada: entradaDe(area), parado };

    // fundo de assinatura
    // fundo: o de params; null (o padrão) usa o da assinatura, e sem ele 0,5
    // na composição 'lado' o nome quebrado não faz a capa estreita: o campo do fundo é largo
    const a = assinaturaDaCapa(assinatura, C, lei.composicao === 'lado' ? null : lei.quebra);
    const fundoPedido = q.fundo ?? a.fundo ?? FUNDO_PADRAO;
    const fundo = fundoPedido * (montagem ? fase(0.6, 1) : 1);
    if (lei.moldura && fundo > 0 && camadas.has('fundo')) {
      const { halo } = lei;
      // o halo vai também como `vazio`, nas coordenadas da subgrade (bordas fecha as formas
      // antes dele; os outros efeitos ignoram)
      const vazio = { x: halo.x - campo.x, y: halo.y - campo.y, cols: halo.cols, linhas: halo.linhas };
      const g = renderizar(a.efeito, {
        ...base, cols: campo.cols, linhas: campo.linhas, entrada: entradaDe(campo),
        predefinicao: a.predefinicao ?? undefined, params: { vazio, ...(a.params ?? {}) },
      });
      for (let sy = 0; sy < g.linhas; sy++) {
        for (let sx = 0; sx < g.cols; sx++) {
          const c = g.car[sy * g.cols + sx];
          if (c === ' ') continue;
          const x = campo.x + sx, y = campo.y + sy;
          // folga da moldura e dos textos: colunas de MARGEM a C-1-MARGEM (as dos textos),
          // uma linha vazia sob o topo e outra sobre a descrição
          if (x < MARGEM || x > C - 1 - MARGEM || y < 2 || y > L - 6) continue;
          if (x >= halo.x && y >= halo.y && x < halo.x + halo.cols && y < halo.y + halo.linhas) continue;
          if (hash2(x, y, semente ^ SAL_FUNDO) < fundo) por(grade, x, y, c, 'tinta-3');
        }
      }
    }

    // nome: letras-de-dados sem chuvisco, copiado célula a célula; na montagem, só as
    // colunas já resolvidas, e as outras como "· "
    const kn = montagem ? fase(0.4, 1) : 1;
    if (kn > 0 && camadas.has('nome')) {
      const r = lei.sub;
      const g = renderizar('letras-de-dados', {
        ...base, cols: r.cols, linhas: r.linhas, entrada: entradaDe(r),
        params: { texto: m.nome, chuvisco: 0, entreLetras: 1, quebra: lei.quebra, reforco: a.reforco ?? q.reforco },
      });
      for (let sy = 0; sy < g.linhas; sy++) {
        for (let sx = 0; sx < g.cols; sx++) {
          const i = sy * g.cols + sx;
          if (g.car[i] === ' ') continue;
          const x = r.x + sx, y = r.y + sy;
          // o nome que não cabe é cortado nas bordas internas
          if (x < area.x || x >= area.x + area.cols) continue;
          const par = x - (sx & 1); // primeira coluna do ponto
          if (kn >= 1 || par - nome.x < kn * nome.cols) {
            grade.car[y * C + x] = g.car[i];
            grade.tom[y * C + x] = g.tom[i];
          } else if (!(sx & 1)) {
            por(grade, x, y, '·', 'tinta-3');
          }
        }
      }
    }

    if (!lei.moldura || !camadas.has('moldura')) return;

    // moldura: a célula (x, y) da borda fica a x + y passos do canto superior esquerdo
    // pelos dois caminhos; a divisória sai da lateral esquerda
    const passos = fase(0, 0.35) * (C - 1 + L - 1);
    const traco = (x, y, c) => { if (x + y <= passos) por(grade, x, y, c, 'tinta-3'); };
    for (let x = 1; x < C - 1; x++) {
      traco(x, 0, '─');
      traco(x, L - 3, '─');
      traco(x, L - 1, '─');
    }
    for (let y = 1; y < L - 1; y++) {
      traco(0, y, y === L - 3 ? '├' : '│');
      traco(C - 1, y, y === L - 3 ? '┤' : '│');
    }
    traco(0, 0, '┌');
    traco(C - 1, 0, '┐');
    traco(0, L - 1, '└');
    traco(C - 1, L - 1, '┘');

    // textos, digitados da esquerda para a direita (cada campo no seu ritmo)
    const kt = montagem ? fase(0.25, 0.6) : 1;
    // o campo abre inteiro (em branco) quando a digitação começa: na linha 0 o traço da
    // moldura não encosta no texto pela metade
    const digitar = (x, y, texto, tomDe) => {
      if (kt <= 0) return;
      const n = [...texto].length;
      for (let i = 0; i < n; i++) por(grade, x + i, y, ' ', 'tinta-3');
      escrever(grade, x, y, texto, Math.floor(kt * n + 1e-9), tomDe);
    };
    const fim = C - 1 - MARGEM; // última coluna de texto

    // linha 0: " findings/<chave> " a partir da coluna 2 e " <número> " terminando em C-3;
    // entre os dois fica pelo menos um traço
    const numero = valor(dados.numero) ?? valor(m.estreia?.numero);
    const num = numero === null ? '' : cortar(numero, Math.max(0, C - 16));
    const inicioNum = num ? fim - [...num].length : C - 2; // o espaço antes do número
    if (num) digitar(inicioNum, 0, ` ${num} `, (i) => (i === 0 ? 'tinta-3' : 'tinta-2'));
    const rotulo = cortar('findings/' + chave, inicioNum - 1 - (MARGEM - 1) - 2);
    if (rotulo) {
      digitar(MARGEM - 1, 0, ` ${rotulo} `, (i) => (i === 0 ? 'tinta-3' : i <= 8 ? 'tinta' : i === 9 ? 'tinta-3' : 'tinta-2'));
    }

    // descrição
    const descricao = q.descricao ?? m.descricao;
    digitar(MARGEM, L - 4, cortar(descricao, fim - MARGEM + 1), () => 'tinta-2');

    // rodapé: data · versão · commit (os que houver) e, à direita, a bandeira com o aviso
    const aviso = `${BANDEIRA} ${AVISO}`;
    const inicioAviso = fim - [...aviso].length + 1;
    digitar(inicioAviso, L - 2, aviso, (i) => (i === 0 ? 'achado' : 'tinta-2'));
    const campos = ['data', 'versao', 'commit']
      .map((c) => valor(dados[c]) ?? valor(m.estreia?.[c]))
      .filter((v) => v !== null);
    digitar(MARGEM, L - 2, cortar(campos.join(' · '), inicioAviso - 2 - MARGEM), () => 'tinta-3');
  },
});
