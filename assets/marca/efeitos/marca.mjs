// Efeito "marca": porte do scramble do título do devblog (iniciarScramble em
// assets/ascii-fx.js). Uma linha de texto na grade, na linha do meio, e um de três
// motores que decide, a cada quadro, o que acontece com cada letra:
//
//   false  limpa, mostra a letra do texto (no tom do parâmetro, tinta por padrão)
//   true   troca por um glifo do CARVAO, com cor piscando entre tinta, achado e tinta-2
//   "x"    mostra exatamente esse caractere, em tinta (o motor tv escolhe o próprio
//          glifo: scanline e rasgo são falha de luminância, cor ali leria como outra coisa)
//
// Espaço e "/" nunca mudam: a barra é a âncora que mantém o nome reconhecível como
// caminho, até no pior quadro.
//
// Lá o tempo é o do hover (t desde a entrada do mouse) e o glifo e a cor do carvão usam o
// relógio absoluto em ms (glifo a cada ~70 ms, cor a cada ~130 ms). Aqui tudo sai de
// t = tempo(ctx): glifo em ⌊t / 0,07⌋, cor em ⌊t / 0,13⌋. A 12 qps lógicos o glifo troca
// em todo quadro e a cor em cerca de dois de cada três; a cor continua mais lenta.
// Parado: o site não roda o scramble sem movimento; aqui o texto fica intacto.
//
// Mais largo que a grade: corta na borda direita (o começo do nome fica legível), sem
// quebrar linha. Centro e direita com texto maior que a grade começam na coluna 0.

import { registrar, por, hash2 } from '../motor/nucleo.mjs';
import { tempo } from './_comum.mjs';

// Sem "/": a barra não pode aparecer também como ruído em outra posição.
const CARVAO = '\\|_-<>#*+:=';
// tinta pesa o dobro: é o flash branco no tema escuro
const CORES = ['tinta', 'achado', 'tinta-2', 'tinta'];
const TRACOS = '─┄╌';

const SAL_TV = 0x3b9f2c51;
const SAL_DECODE = 0x5e17a4d3;
const SAL_CORRUPCAO = 0x1c6d8e2b;
const SAL_COR = 0x74a3f0c9;

// Cada motor: (n, t, elegiveis, texto, s) → vetor com uma entrada por caractere.
// Os sorteios do site, hash(a, b), viram hash2(a, b, s ^ sal), com os mesmos limiares.
const MOTORES = {
  // TV velha: 70% dos quadros em silêncio; o estrago chega em rajada de dois quadros
  // (tearing, scanline ou dropout), sorteada por bloco.
  tv(n, t, elegiveis, texto, s) {
    const h = (a, b) => hash2(a, b, s ^ SAL_TV);
    const out = new Array(n).fill(false);
    const q = Math.floor(t * 12); // trava o sorteio a 12 qps, como lá
    if (h(q, 91) > 0.30) return out;
    const bloco = Math.floor(q / 2);
    const tipo = h(bloco, 17);
    if (tipo < 0.42) {
      // TEARING: uma fatia desliza um ou dois caracteres; o que entra vem do próprio nome
      let desl = h(bloco, 23) < 0.5 ? -1 : 1;
      if (h(bloco, 29) < 0.35) desl *= 2;
      const ini = Math.floor(h(bloco, 31) * n);
      const fim = Math.min(n, ini + 3 + Math.floor(h(bloco, 37) * 6));
      for (let i = ini; i < fim; i++) {
        const j = i - desl;
        out[i] = j >= 0 && j < n ? texto[j] : ' ';
      }
    } else if (tipo < 0.78) {
      // SCANLINE: a fatia colapsa nos traços do fundo tv
      const ini = Math.floor(h(bloco, 41) * n);
      const fim = Math.min(n, ini + 2 + Math.floor(h(bloco, 43) * 5));
      for (let i = ini; i < fim; i++) out[i] = TRACOS[Math.floor(h(i, bloco) * TRACOS.length)];
    } else {
      // DROPOUT: uma ou duas letras somem; às vezes uma letra pisca cor (falha de croma)
      for (const e of elegiveis) if (h(e, bloco * 7) < 0.10) out[e] = ' ';
      if (elegiveis.length && h(bloco, 53) < 0.45) {
        out[elegiveis[Math.floor(h(bloco, 59) * elegiveis.length)]] = true;
      }
    }
    return out;
  },

  // Cada letra tem período e fase próprios; teto de 4 soltas por quadro e nunca um
  // quadro com a palavra inteira parada.
  decode(n, t, elegiveis, texto, s) {
    const h = (a, b) => hash2(a, b, s ^ SAL_DECODE);
    const TETO = 4;
    const out = new Array(n).fill(false);
    const soltas = [];
    for (let i = 0; i < n; i++) {
      const periodo = 0.95 + h(i, 5) * 1.10;
      const fase = h(i, 9) * periodo;
      const p = ((((t + fase) % periodo) + periodo) % periodo) / periodo;
      const solto = 0.08 + Math.pow(h(i, 3), 1.6) * 0.13;
      out[i] = p < solto;
      if (out[i]) soltas.push([i, p / solto]);
    }
    if (soltas.length > TETO) {
      // corta as que estão mais perto do fim do próprio ciclo (as que já iam voltar);
      // ordem estável: empate pelo índice
      soltas.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
      for (let i = TETO; i < soltas.length; i++) out[soltas[i][0]] = false;
    }
    // a conta olha só os elegíveis: a barra sai sempre limpa
    if (elegiveis.length && !elegiveis.some((e) => out[e])) {
      out[elegiveis[Math.floor(t / 0.16) % elegiveis.length]] = true;
    }
    return out;
  },

  // Uma letra por vez pisca trocada, saltando de posição; um terço dos blocos descansa.
  corrupcao(n, t, elegiveis, texto, s) {
    const h = (a, b) => hash2(a, b, s ^ SAL_CORRUPCAO);
    const out = new Array(n).fill(false);
    if (!elegiveis.length) return out;
    const bloco = Math.floor(t / 0.22); // dois passos de 110 ms por letra
    if (h(bloco, 17) < 0.34) return out;
    out[elegiveis[Math.floor(h(bloco, 23) * elegiveis.length)]] = true;
    return out;
  },
};

registrar('marca', {
  // texto: a linha; motor: tv, decode ou corrupcao; alinhar: esquerda, centro ou direita.
  // tom: o das letras limpas (tinta: é o nome, não textura).
  padrao: { velocidade: 1, texto: 'findings/devblog', motor: 'tv', alinhar: 'centro', tom: 'tinta' },
  predefinicoes: {
    tv: { motor: 'tv' },
    decode: { motor: 'decode' },
    corrupcao: { motor: 'corrupcao' },
  },
  desenhar(grade, ctx) {
    const { texto: bruto, motor: nomeMotor, alinhar, tom } = ctx.params;
    const motor = MOTORES[nomeMotor];
    if (!motor) throw new Error(`motor desconhecido em marca: ${nomeMotor}`);
    const s = ctx.semente;
    const { cols, linhas } = grade;
    const texto = [...String(bruto ?? '')]; // por ponto de código: cada um é uma célula
    const n = texto.length;
    if (!n) return;

    const y = Math.floor((linhas - 1) / 2);
    const sobra = cols - n;
    const x0 = sobra <= 0 ? 0 : alinhar === 'esquerda' ? 0 : alinhar === 'direita' ? sobra : Math.floor(sobra / 2);

    const elegiveis = [];
    for (let i = 0; i < n; i++) if (texto[i] !== ' ' && texto[i] !== '/') elegiveis.push(i);

    const t = tempo(ctx);
    const sujos = ctx.parado ? null : motor(n, t, elegiveis, texto, s);
    const passoGlifo = Math.floor(t / 0.07);
    const passoCor = Math.floor(t / 0.13);

    for (let i = 0; i < n && x0 + i < cols; i++) {
      const c = texto[i];
      const v = sujos ? sujos[i] : false;
      if (!v || c === ' ' || c === '/') { por(grade, x0 + i, y, c, tom); continue; }
      if (typeof v === 'string') { por(grade, x0 + i, y, v, 'tinta'); continue; }
      // o i·29 tira cada letra do mesmo compasso, senão a palavra pisca junto
      const g = CARVAO[(passoGlifo + i * 29) % CARVAO.length];
      const cor = CORES[Math.floor(hash2(i, passoCor, s ^ SAL_COR) * CORES.length)];
      por(grade, x0 + i, y, g, cor);
    }
  },
});
