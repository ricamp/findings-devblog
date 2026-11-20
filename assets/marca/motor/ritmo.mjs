// Ritmo do motor: converte tempo de relógio em quadro lógico e decide quando congelar por
// inatividade. Puro: sem DOM, sem relógio do sistema; quem chama passa os milissegundos.

import { FPS_LOGICO } from './nucleo.mjs';

// Quadro lógico inteiro para um tempo decorrido em ms. Tempo negativo conta como zero.
export function quadroLogico(msDecorridos, fps = FPS_LOGICO) {
  return Math.max(0, Math.floor((msDecorridos * fps) / 1000));
}

// Verdadeiro quando já passou `limite` ms (ou mais) sem ponteiro, rolagem ou tecla.
export function deveParar({ msSemInteracao, limite = 6000 }) {
  return msSemInteracao >= limite;
}

// Milissegundos que caem no meio do quadro lógico q (quadroLogico(msDoQuadro(q)) === q,
// sem o arredondamento jogar para o quadro anterior).
export function msDoQuadro(q, fps = FPS_LOGICO) {
  return ((Math.max(0, Math.floor(q)) + 0.5) * 1000) / fps;
}

// Relógio que só conta enquanto anda. `andar(agora)` começa ou continua a contar;
// `parar(agora)` guarda o que já contou; `ms(agora)` diz o total contado. Ao voltar a
// andar, segue de onde parou: o tempo parado não vira salto de quadros. `inicial`: ms já
// contados ao criar (para um pintor novo continuar no quadro de um anterior).
export function criarRelogio(inicial = 0) {
  let acumulado = Math.max(0, inicial);
  let desde = null; // instante em que começou a andar; null = parado
  return {
    andar(agora) { if (desde === null) desde = agora; },
    parar(agora) {
      if (desde === null) return;
      acumulado += Math.max(0, agora - desde);
      desde = null;
    },
    ms(agora) { return acumulado + (desde === null ? 0 : Math.max(0, agora - desde)); },
    get andando() { return desde !== null; },
  };
}
