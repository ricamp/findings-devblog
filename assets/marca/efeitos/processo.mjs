// Animações de processo do guia de identidade v1.3 (findings-agent-identidade.html, seção
// "06 · Animações"). São registro de processo: no kit só aparecem quando algo está de fato
// acontecendo. Todas desenham a partir de (0, 0), em tinta, e cortam na borda direita e na
// de baixo, sem quebrar linha.
//
// Lá cada uma é um setInterval ou setTimeout em ms com contador próprio. Aqui o contador sai
// de t = tempo(ctx): passo de n ms vira ⌊t / (n / 1000)⌋. A 12 qps lógicos (83 ms por
// quadro) um intervalo menor que 83 ms anda no máximo um passo por quadro, e um um pouco
// maior que 83 ms repete um quadro de vez em quando; o ritmo médio é o do guia.
// Parado: estado final (texto inteiro, boot completo, 100%), nunca um quadro do meio.
//
// A JetBrains Mono não tem braille (⠋⠙⠹…) nem os círculos de quadrante (◐◓◑◒): os dois
// spinners usam blocos de quadrante, que a fonte tem, no mesmo sentido de giro.

import { registrar, por, hash2 } from '../motor/nucleo.mjs';
import { tempo } from './_comum.mjs';

// Escreve o texto na linha y a partir de x, um ponto de código por célula; o que passa da
// borda o por() ignora. Devolve a coluna seguinte.
function escrever(grade, x, y, texto, tom) {
  for (const c of String(texto ?? '')) por(grade, x++, y, c, tom);
  return x;
}

// Passo de um contador do guia: ⌊t / passo⌋, com passo em segundos.
const passoDe = (t, passo) => (passo > 0 ? Math.floor(t / passo) : 0);

// Posição dentro do ciclo, em [0, ciclo). (Sem o ((t % c) + c) % c: somar e tirar o ciclo
// de novo erra no último bit e 6 % 6,7 viraria 5,999….)
function noCiclo(t, ciclo) {
  const r = t % ciclo;
  return r < 0 ? r + ciclo : r;
}

// ---------------------------------------------------------------- spinner

// giro: no guia era braille, ⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏ a 90 ms (três pontos girando); aqui um quadrante que gira
// crescendo e encolhendo, oito quadros, mesmos 90 ms.
// quadrantes: no guia ◐◓◑◒ a 160 ms (meia lua esquerda, cima, direita, baixo); aqui as
// metades de bloco na mesma ordem.
// ponto: as reticências do guia ("aguardando exame..."), 450 ms, depois do texto.
const QUADROS = {
  giro: { glifos: ['▘', '▀', '▝', '▐', '▗', '▄', '▖', '▌'], passo: 0.09 },
  quadrantes: { glifos: ['▌', '▀', '▐', '▄'], passo: 0.16 },
  ponto: { glifos: ['.', '..', '...'], passo: 0.45, depois: true },
};

registrar('spinner', {
  // texto: o que está sendo feito; quadros: giro, quadrantes ou ponto.
  padrao: { velocidade: 1, tom: 'tinta', texto: 'processing…', quadros: 'giro' },
  predefinicoes: {
    giro: { quadros: 'giro' },
    quadrantes: { quadros: 'quadrantes' },
    ponto: { quadros: 'ponto', texto: 'waiting' },
  },
  desenhar(grade, ctx) {
    const { texto, quadros, tom } = ctx.params;
    const q = QUADROS[quadros];
    if (!q) throw new Error(`quadros desconhecidos em spinner: ${quadros}`);
    const k = ctx.parado ? 0 : passoDe(tempo(ctx), q.passo) % q.glifos.length;
    const glifo = q.glifos[k];
    if (q.depois) {
      // as reticências não são acento: no guia ficam na cor do texto
      escrever(grade, escrever(grade, 0, 0, texto, tom), 0, glifo, tom);
    } else {
      por(grade, 0, 0, glifo, 'achado');
      escrever(grade, 2, 0, texto, tom);
    }
  },
});

// ---------------------------------------------------------------- varredura

// No guia, a varredura do tórax desce uma linha a cada 110 ms (a linha da vez fica realçada)
// e a demo "varredura" corre ▓ com ░ em volta. Aqui uma linha ▓ desce sobre a grade, com o
// rastro ▒ ░ acima, por cima de um fundo de · esparso em tinta-3 (fixo: é o papel).
// O ciclo tem linhas + 2 passos, para o rastro sair por baixo antes de recomeçar no topo.
const SAL_FUNDO = 0x2d81c5a7;
const DENSIDADE_FUNDO = 0.12;
const RASTRO = ['▓', '▒', '░'];

registrar('varredura', {
  // largura: colunas da linha (null ocupa a grade); passo: segundos por linha.
  padrao: { velocidade: 1, tom: 'tinta', largura: null, passo: 0.11 },
  predefinicoes: {},
  desenhar(grade, ctx) {
    const { largura, passo, tom } = ctx.params;
    const { cols, linhas } = grade;
    const w = largura == null ? cols : Math.min(cols, Math.max(0, Math.floor(largura)));
    for (let y = 0; y < linhas; y++) {
      for (let x = 0; x < w; x++) {
        if (hash2(x, y, ctx.semente ^ SAL_FUNDO) < DENSIDADE_FUNDO) por(grade, x, y, '·', 'tinta-3');
      }
    }
    const p = ctx.parado ? Math.floor((linhas - 1) / 2) : passoDe(tempo(ctx), passo) % (linhas + 2);
    for (let k = 0; k < RASTRO.length; k++) {
      const y = p - k;
      if (y < 0 || y >= linhas) continue;
      for (let x = 0; x < w; x++) por(grade, x, y, RASTRO[k], tom);
    }
  },
});

// ---------------------------------------------------------------- digitacao

// No guia: um caractere a cada 60 ms (≈ 16 cps), o texto inteiro fica e, 3,5 s depois,
// recomeça do zero. O cursor é um bloco em achado que pisca a 1 s (meio aceso, meio apagado,
// steps(1)). A 16 cps e 12 qps o texto anda 1,33 caractere por quadro: um quadro em três
// entra com dois caracteres.
registrar('digitacao', {
  // texto: a linha; cps: caracteres por segundo; pausa: segundos com o texto inteiro.
  padrao: { velocidade: 1, tom: 'tinta', texto: 'reading entry 0007…', cps: 16, pausa: 3.5 },
  predefinicoes: {},
  desenhar(grade, ctx) {
    const { texto, cps, pausa, tom } = ctx.params;
    const letras = [...String(texto ?? '')];
    const n = letras.length;
    if (ctx.parado || !(cps > 0)) { escrever(grade, 0, 0, letras.join(''), tom); return; }
    const t = tempo(ctx);
    const dt = 1 / cps;
    // passos 0..n de dt (no n o texto está inteiro), depois a pausa
    const ciclo = (n + 1) * dt + Math.max(0, pausa);
    const tc = noCiclo(t, ciclo);
    const k = Math.min(n, Math.floor(tc / dt));
    escrever(grade, 0, 0, letras.slice(0, k).join(''), tom);
    if (noCiclo(t, 1) < 0.5) por(grade, k, 0, '▌', 'achado');
  },
});

// ---------------------------------------------------------------- progresso

// No guia o lote anda 1/12 a cada 700 ms, para em 12/12 por um passo e volta ao zero; a
// barra do tórax mostra a porcentagem com três casas ("] 57%" vira "]  57%"). Aqui a
// porcentagem sobe de 0 a 100 em duracao segundos, fica em 100% por 0,7 s (um passo do
// lote) e recomeça. A parte cheia vai em achado, como o .acc do guia.
const FIM = 0.7;

registrar('progresso', {
  // largura: células da barra; duracao: segundos de 0 a 100%; rotulo: texto antes da barra.
  padrao: { velocidade: 1, tom: 'tinta', largura: 14, duracao: 6, rotulo: '' },
  predefinicoes: {},
  desenhar(grade, ctx) {
    const { largura, duracao, rotulo, tom } = ctx.params;
    const L = Math.max(0, Math.floor(largura));
    let pct = 100;
    if (!ctx.parado && duracao > 0) {
      const ciclo = duracao + FIM;
      const tc = noCiclo(tempo(ctx), ciclo);
      pct = tc >= duracao ? 100 : Math.min(100, Math.floor((100 * tc) / duracao));
    }
    const cheio = Math.round((pct / 100) * L);
    let x = rotulo ? escrever(grade, 0, 0, rotulo, tom) + 1 : 0;
    x = escrever(grade, x, 0, '[', tom);
    x = escrever(grade, x, 0, '█'.repeat(cheio), 'achado');
    x = escrever(grade, x, 0, '░'.repeat(L - cheio), tom);
    escrever(grade, x, 0, '] ' + String(pct).padStart(3) + '%', tom);
  },
});

// ---------------------------------------------------------------- skeleton

// No guia: três faixas de ░ (18, 12 e 15 colunas) e um brilho ▓ com ▒ dos lados que corre
// da esquerda para a direita a cada 90 ms, em ciclo de 22 passos (a faixa maior mais 4, para
// o brilho sair). Mais de três linhas repetem os comprimentos.
const FAIXAS = [18, 12, 15];

registrar('skeleton', {
  // linhas: quantas faixas; passo: segundos por coluna do brilho.
  padrao: { velocidade: 1, tom: 'tinta', linhas: 3, passo: 0.09 },
  predefinicoes: {},
  desenhar(grade, ctx) {
    const { linhas, passo, tom } = ctx.params;
    const n = Math.min(grade.linhas, Math.max(0, Math.floor(linhas)));
    const ciclo = Math.max(...FAIXAS) + 4;
    const sk = ctx.parado ? null : passoDe(tempo(ctx), passo) % ciclo;
    for (let y = 0; y < n; y++) {
      const len = Math.min(grade.cols, FAIXAS[y % FAIXAS.length]);
      for (let x = 0; x < len; x++) {
        const d = sk === null ? 2 : Math.abs(x - sk);
        por(grade, x, y, d === 0 ? '▓' : d === 1 ? '▒' : '░', tom);
      }
    }
  },
});

// ---------------------------------------------------------------- fila

// No guia: "▸ item" em achado no item da vez, "· item" nos outros, separados por dois
// espaços; o item da vez anda a cada 900 ms. Aqui o passo é parâmetro (1,2 s no padrão).
registrar('fila', {
  // itens: os nomes da fila; passo: segundos por item.
  padrao: { velocidade: 1, tom: 'tinta', itens: ['rx-114', 'rx-115', 'rx-116'], passo: 1.2 },
  predefinicoes: {},
  desenhar(grade, ctx) {
    const { itens, passo, tom } = ctx.params;
    const lista = Array.isArray(itens) ? itens : [];
    if (!lista.length) return;
    const k = ctx.parado ? 0 : passoDe(tempo(ctx), passo) % lista.length;
    let x = 0;
    lista.forEach((item, j) => {
      if (j > 0) x = escrever(grade, x, 0, '  ', tom);
      x = j === k ? escrever(grade, x, 0, '▸ ' + item, 'achado') : escrever(grade, x, 0, '· ' + item, tom);
    });
  },
});

// ---------------------------------------------------------------- sparkline

// No guia: série de 12 níveis ▁..█, a cada 300 ms entra um ponto novo, o anterior mais um
// sorteio de −2 a +2 (limitado a 0..7), e a série desliza. Lá a série começa lisa no zero e
// o sorteio é o acaso do navegador; aqui o passo k sorteia com hash2(k), e a caminhada começa
// AQUECIMENTO passos antes do quadro 0, para já haver curva no primeiro quadro. Sem estado:
// cada quadro refaz a caminhada desde o começo (custo proporcional ao tempo, ~3 passos/s).
const NIVEIS = '▁▂▃▄▅▆▇█';
const AQUECIMENTO = 24;
const SAL_SPARK = 0x6a09e667;

registrar('sparkline', {
  // pontos: tamanho da série; passo: segundos por ponto novo.
  padrao: { velocidade: 1, tom: 'tinta', pontos: 12, passo: 0.3 },
  predefinicoes: {},
  desenhar(grade, ctx) {
    const { pontos, passo, tom } = ctx.params;
    const n = Math.max(0, Math.floor(pontos));
    if (!n) return;
    const k = ctx.parado ? 0 : passoDe(tempo(ctx), passo);
    const s = ctx.semente ^ SAL_SPARK;
    // valores dos passos −AQUECIMENTO..k; antes disso, zero
    const inicio = -AQUECIMENTO;
    const serie = [];
    let v = 0;
    for (let i = inicio; i <= k; i++) {
      v = Math.max(0, Math.min(7, v + Math.floor(hash2(i, 0, s) * 5) - 2));
      serie.push(v);
    }
    for (let j = 0; j < n; j++) {
      const i = k - (n - 1) + j; // passo mostrado na coluna j
      const valor = i < inicio ? 0 : serie[i - inicio];
      por(grade, j, 0, NIVEIS[valor], j === n - 1 ? 'achado' : tom);
    }
  },
});

// ---------------------------------------------------------------- pulso

// No guia: ∴ em achado com a opacidade alternando 1 e 0,35 a cada 1,2 s. Aqui a opacidade
// baixa vira tinta-3 (o motor não tem transparência) e o passo é 0,8 s, como pede o plano.
registrar('pulso', {
  // texto: o estado; passo: segundos por meia batida.
  padrao: { velocidade: 1, tom: 'tinta', texto: 'listening', passo: 0.8 },
  predefinicoes: {},
  desenhar(grade, ctx) {
    const { texto, passo, tom } = ctx.params;
    const aceso = ctx.parado || passoDe(tempo(ctx), passo) % 2 === 0;
    por(grade, 0, 0, '∴', aceso ? 'achado' : 'tinta-3');
    escrever(grade, 2, 0, texto, tom);
  },
});

// ---------------------------------------------------------------- boot

// No guia: a linha k acende aos 400·(k + 1) ms; com todas acesas, 4 s depois recomeça
// apagado. Ciclo: passo·(n + 1) + pausa. Linhas que não cabem na grade ficam de fora.
registrar('boot', {
  // linhas: o registro; passo: segundos entre linhas; pausa: segundos com tudo aceso.
  padrao: {
    velocidade: 1, tom: 'tinta',
    linhas: ['findings v0', 'loading tokens … ok', 'loading engine … ok', '∴ ready'],
    passo: 0.4, pausa: 4,
  },
  predefinicoes: {},
  desenhar(grade, ctx) {
    const { linhas, passo, pausa, tom } = ctx.params;
    const lista = Array.isArray(linhas) ? linhas : [];
    const n = lista.length;
    let acesas = n;
    if (!ctx.parado && passo > 0) {
      const ciclo = passo * (n + 1) + Math.max(0, pausa);
      const tc = noCiclo(tempo(ctx), ciclo);
      acesas = Math.min(n, Math.floor(tc / passo));
    }
    for (let y = 0; y < Math.min(acesas, grade.linhas); y++) escrever(grade, 0, y, lista[y], tom);
  },
});
