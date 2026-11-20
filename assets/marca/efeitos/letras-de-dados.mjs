// Efeito "letras-de-dados": o efeito das capas de modelo. O nome é escrito com a letra
// própria 5×7; cada ponto aceso ocupa 2 colunas e mostra um byte em hexadecimal
// minúsculo que troca devagar, cada um no seu ritmo. Uns poucos bytes ficam em `achado`
// por alguns segundos. Em volta, um chuvisco de "· " em tinta-3, que nunca encosta na
// letra.
//
// Reação (com data-reativo): os pontos acesos a menos de `alcance` pontos do ponteiro
// trocam de byte a cada quadro lógico, em vez de no seu período. Nada muda de posição nem
// de tom; parado, o ponteiro não conta. alcance 0 desliga.
//
// Reforço (`reforco`): 'nenhum' (o padrão, a letra de sempre) ou 'chapa', que troca o tom
// dos pontos acesos: tinta vira `chapa` (célula cheia de tinta, byte na cor do papel) e
// achado vira `chapa-achado`. Os caracteres não mudam, nem o chuvisco. A chapa faz o nome
// ler como letra cheia em tamanho pequeno; é o que as peças estáticas usam (capas, peças
// sociais). A predefinição `chapa` é a capa com o reforço.
//
// Toda a geometria trabalha em "pontos": um ponto é 2 colunas × 1 linha da grade, e o
// ponto (px, py) cobre as colunas 2px e 2px+1 da linha py. O bloco de texto é centrado
// com deslocamento par, então o par de colunas de um byte nunca fica quebrado.

import { registrar, por, hash2 } from '../motor/nucleo.mjs';
import { compor } from '../motor/letra.mjs';
import { ponteiroNaGrade } from './_comum.mjs';

// Sais: separam os sorteios independentes feitos com a mesma posição.
const SAL_RITMO = 0x1f123bb5;
const SAL_FASE = 0x5e2d58d8;
const SAL_BYTE = 0x6c8e9cf5;
const SAL_ACHADO_FASE = 0x2a3c9d17;
const SAL_ACHADO = 0x7f4a7c15;
const SAL_CHUVISCO_FASE = 0x3b9aca07;
const SAL_CHUVISCO = 0x4cf5ad43;

const ACHADO_ALVO = 0.02;      // fração dos pontos acesos candidatos a achado
const ACHADO_TETO = 0.03;      // teto entre as células não vazias do quadro
const ACHADO_DURACAO = 30;     // quadros lógicos (2,5 s a 12 por segundo)
const CHUVISCO_PERIODO = 7;    // a máscara do chuvisco troca a cada ~7 quadros
const REFORCOS = ['nenhum', 'chapa'];
const TOM_COM_CHAPA = { tinta: 'chapa', achado: 'chapa-achado' };

// Sorteio em [0,1) para a posição (px, py) numa "época" de tempo.
function sorteio(px, py, epoca, semente, sal) {
  return hash2(px, py, ((semente ^ sal) + Math.imul(epoca | 0, 0x27d4eb2d)) | 0);
}

// Época de um relógio próprio do ponto: período e fase vêm da posição; parado → 0.
function epocaDe(quadro, parado, px, py, periodo, semente, salFase) {
  if (parado) return 0;
  const fase = Math.floor(hash2(px, py, semente ^ salFase) * periodo);
  return Math.floor((quadro + fase) / periodo);
}

// Pontos acesos do nome, já posicionados na grade em coordenadas de ponto. Podem cair
// fora da grade (nome que não cabe): quem desenha corta.
function pontosAcesos(cols, linhas, { texto, entreLetras, quebra }) {
  const letras = [...String(texto)];
  const partes = Number.isInteger(quebra) && quebra > 0 && quebra < letras.length
    ? [letras.slice(0, quebra).join(''), letras.slice(quebra).join('')]
    : [letras.join('')];
  const blocos = partes.map((p) => compor(p, { entreLetras }));
  const altura = blocos.length * 7 + (blocos.length - 1);
  const y0 = Math.floor((linhas - altura) / 2);
  const acesos = [];
  blocos.forEach((bloco, b) => {
    const px0 = Math.floor((cols - 2 * bloco[0].length) / 4);
    bloco.forEach((linha, dy) => {
      for (let dx = 0; dx < linha.length; dx++)
        if (linha[dx] === '#') acesos.push([px0 + dx, y0 + b * 8 + dy]);
    });
  });
  return acesos;
}

registrar('letras-de-dados', {
  padrao: { texto: 'FINDINGS', entreLetras: 1, chuvisco: 0.14, trocaLenta: 6, passo: 3, quebra: null, alcance: 5, reforco: 'nenhum' },
  predefinicoes: {
    capa: {},
    chapa: { reforco: 'chapa' },
    'titulo-video': { chuvisco: 0.05 },
    textura: { chuvisco: 0.3 },
  },
  desenhar(grade, { quadro, semente, params, parado, entrada }) {
    const { chuvisco, trocaLenta, passo, alcance, reforco } = params;
    if (!REFORCOS.includes(reforco)) throw new Error(`reforco desconhecido: ${reforco} (aceita ${REFORCOS.join(', ')})`);
    // tom final de um byte: com o reforço, a versão de chapa
    const tomDe = (t) => (reforco === 'chapa' ? TOM_COM_CHAPA[t] : t);
    // ponteiro em pontos: x da célula dividido por 2
    const p = !parado && alcance > 0 ? ponteiroNaGrade(entrada, grade) : null;
    const perto = (px, py) => !!p && Math.hypot(px - p.x / 2, py - p.y) < alcance;
    const larguraPontos = Math.ceil(grade.cols / 2);
    const naGrade = (px, py) => px >= 0 && py >= 0 && px < larguraPontos && py < grade.linhas;
    const acesos = pontosAcesos(grade.cols, grade.linhas, params);

    // Folga: o ponto aceso e seus 8 vizinhos ficam proibidos para o chuvisco.
    const ocupado = new Uint8Array(larguraPontos * grade.linhas);
    for (const [px, py] of acesos)
      for (let vy = -1; vy <= 1; vy++)
        for (let vx = -1; vx <= 1; vx++)
          if (naGrade(px + vx, py + vy)) ocupado[(py + vy) * larguraPontos + px + vx] = 1;

    // Chuvisco: "· " em tinta-3; cada ponto tem seu relógio, então a máscara muda aos
    // poucos e não toda de uma vez.
    for (let py = 0; py < grade.linhas; py++) {
      for (let px = 0; px < larguraPontos; px++) {
        if (ocupado[py * larguraPontos + px]) continue;
        const ep = epocaDe(quadro, parado, px, py, CHUVISCO_PERIODO, semente, SAL_CHUVISCO_FASE);
        if (sorteio(px, py, ep, semente, SAL_CHUVISCO) < chuvisco) por(grade, 2 * px, py, '·', 'tinta-3');
      }
    }

    // Bytes: período entre 1 e trocaLenta passos, sorteado pela posição. Um passo são
    // `passo` quadros lógicos (3 = 250 ms, o ritmo do esboço aprovado).
    const candidatos = [];
    for (const [px, py] of acesos) {
      if (!naGrade(px, py)) continue;
      const periodo = passo * (1 + Math.floor(hash2(px, py, semente ^ SAL_RITMO) * trocaLenta));
      const ep = perto(px, py) ? quadro : epocaDe(quadro, parado, px, py, periodo, semente, SAL_FASE);
      const byte = Math.floor(sorteio(px, py, ep, semente, SAL_BYTE) * 256);
      const hex = byte.toString(16).padStart(2, '0');
      por(grade, 2 * px, py, hex[0], tomDe('tinta'));
      por(grade, 2 * px + 1, py, hex[1], tomDe('tinta'));

      const janela = epocaDe(quadro, parado, px, py, ACHADO_DURACAO, semente, SAL_ACHADO_FASE);
      const nota = sorteio(px, py, janela, semente, SAL_ACHADO);
      if (nota < ACHADO_ALVO) candidatos.push({ px, py, hex, nota });
    }

    // Achado: os candidatos de menor nota entram enquanto couberem no teto. A janela dura
    // ACHADO_DURACAO quadros, então quem entra fica aceso por vários quadros.
    let cheias = 0;
    for (const c of grade.car) if (c !== ' ') cheias++;
    let emAchado = 0;
    candidatos.sort((a, b) => a.nota - b.nota);
    for (const { px, py, hex } of candidatos) {
      const celulas = 2 * px + 1 < grade.cols ? 2 : 1;
      if (emAchado + celulas > ACHADO_TETO * cheias) break;
      por(grade, 2 * px, py, hex[0], tomDe('achado'));
      por(grade, 2 * px + 1, py, hex[1], tomDe('achado'));
      emAchado += celulas;
    }
  },
});
