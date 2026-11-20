// Efeito "heatmap": porte do fundo heatmap do devblog (assets/ascii-fx.js). Mapa de
// atenção passeando atrás do texto. O núcleo (glifo de índice ≥ 5 na rampa) vai em
// achado; o anel em volta existe para a mancha ter borda — sem ele ela se dissolve no
// fundo e vira densidade comum.
//
// Raio e centro em CÉLULAS, não em fração da caixa, como lá: preso ao número de linhas,
// o blob ocupa a mesma fatia da faixa em qualquer altura de hospedeiro.
//
// Reação ao ponteiro (com data-reativo; Plano 8, Task 2). Nada aqui guarda estado: tudo sai
// de entrada.trilha (um ponto {x, y, quadro} por quadro lógico com o ponteiro na grade),
// do ponteiro e da rolagem, então o mesmo quadro com a mesma entrada dá a mesma grade.
//   - Atenção com inércia: o centro de atenção é a média da trilha com peso `seguir`^idade
//     (segue o ponteiro com um pequeno atraso). O engajamento é `voltar`^(idade do ponto
//     mais novo): com o ponteiro na grade, 1; quando ele sai, cai a zero em ~1 s e o campo
//     volta ao próprio sem salto. Ponteiro sem trilha conta como um ponto no quadro atual.
//   - O calor se concentra em volta do centro de atenção (raio `foco`, queda gaussiana) e
//     os focos automáticos são puxados para ele (`puxao`, como antes).
//   - Deformação: a mancha se estica na direção do movimento (a diferença entre o ponteiro
//     e o centro atrasado), e cada ponto da trilha deixa um pouco de calor que decai
//     (`rastro` por ponto, `decaimento` por quadro); o rastro nunca passa de `=` (não vira
//     terracota: o achado continua só no núcleo).
//   - Profundidade (`camadas` 2 ou 3): atrás do calor, um plano do meio (curvas de nível
//     de um campo largo, em `:`) e um fundo ralo (pontos `·` numa rede que deriva devagar),
//     os dois em tinta-3. Cada plano se desloca ao contrário do ponteiro numa fração
//     própria (`paralaxe` [fundo, meio, frente]) e a rolagem desce cada um num tanto
//     (`rolagemCamadas`): o fundo anda pouco, a frente muito. A frente tapa o que está
//     atrás. Sem ponteiro há vida do mesmo jeito: o fundo deriva, as curvas seguem os focos.
//   - `lupa`: o campo próprio vira uma rampa fria (só `·` e `:`, em tinta-3) e o calor só
//     existe numa lente em volta do centro de atenção; sem ponteiro, a lente passeia
//     sozinha. Dentro dela a textura fria aumenta (a lente deforma o que está embaixo).
//
// Sem ponteiro e sem trilha (ou com `puxao` 0), as predefinições de um plano só
// (atencao, difuso, duplo, e o padrão que as capas usam) dão a mesma grade de antes.
// Parado (movimento reduzido), a entrada não conta: o quadro é fixo.

import { registrar, por, ruido, hash2 } from '../motor/nucleo.mjs';
import { tempo, misto, limitar, ponteiroNaGrade } from './_comum.mjs';

const RAMPA = ' ·:-=+*#';
const QUENTE = 5;     // índice da rampa a partir do qual a célula vai em achado
const MORNO = 4;      // teto do rastro: `=` (o rastro não vira terracota)
const ASP = 2;        // a célula é 1 : 2 (alta): distâncias verticais contam em dobro
const SAL_FUNDO = 0x5f1d3a77, SAL_FRIO = 0x2b8e44c1, SAL_MEIO = 0x71c2a9e5;

// Atenção a partir da trilha e do ponteiro: { e (0..1), c {x, y} atrasado, v {x, y}
// (do centro atrasado ao ponto mais novo), pontos [{x, y, idade}] } ou null.
export function atencaoDaEntrada(entrada, grade, quadro, { seguir, voltar, janela = 40 }) {
  const lista = [];
  for (const p of entrada?.trilha || []) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.quadro)) continue;
    const idade = quadro - p.quadro;
    if (idade < 0 || idade > janela) continue;
    if (p.x < 0 || p.y < 0 || p.x >= grade.cols || p.y >= grade.linhas) continue;
    lista.push({ x: p.x, y: p.y, idade });
  }
  const agora = ponteiroNaGrade(entrada, grade);
  if (agora && !lista.some((p) => p.idade === 0)) lista.push({ x: agora.x, y: agora.y, idade: 0 });
  if (!lista.length) return null;
  const novo = lista.reduce((a, b) => (b.idade < a.idade ? b : a));
  const e = voltar ** novo.idade;
  if (e < 0.02) return null;
  let sx = 0, sy = 0, sw = 0;
  for (const p of lista) {
    const w = seguir ** p.idade;
    sx += w * p.x; sy += w * p.y; sw += w;
  }
  const c = { x: sx / sw, y: sy / sw + 0.5 }; // a célula y tem o centro em y + 0,5
  return { e, c, v: { x: novo.x - c.x, y: novo.y + 0.5 - c.y }, pontos: lista };
}

// Centros automáticos dos focos (o passeio do site), já puxados para a atenção.
// `antes` desloca o passeio (a paralaxe da frente) antes do puxão: o calor fica no ponteiro.
function centrosDosFocos(cols, linhas, t, { focos, fase: avanco }, puxar, antes = null) {
  const centros = [];
  for (let f = 0; f < Math.max(1, Math.min(2, Math.round(focos))); f++) {
    const fase = f * Math.PI + avanco;
    // amplitude vertical menor que a horizontal: em sete linhas, 0,30 jogava metade
    // das passadas para fora do quadro
    let cx = (0.5 + Math.sin(t * 0.21 + fase) * 0.34) * cols;
    let cy = (0.5 + Math.sin(t * 0.34 + 2.0 + fase) * 0.18) * linhas;
    if (antes) { cx -= antes.dx; cy -= antes.dy; }
    if (puxar) {
      cx = misto(cx, puxar.x, puxar.k);
      cy = misto(cy, puxar.y, puxar.k);
    }
    centros.push([cx, cy]);
  }
  return centros;
}

// O campo do site num ponto (antes da granulação).
function campo(x, y, centros, rx, ry) {
  let n = 0;
  for (const [cx, cy] of centros) {
    const dx = (x - cx) / rx, dy = (y + 0.5 - cy) / ry;
    const d = Math.sqrt(dx * dx + dy * dy); // distância elíptica
    n = Math.max(n, Math.exp(-d * d) + Math.exp(-Math.pow((d - 1.65) / 0.26, 2)) * 0.30);
  }
  return n;
}

registrar('heatmap', {
  // raio: raio vertical em fração das linhas (0,38), com piso em células (raioMin 1,6);
  // deitado: rx = ry · deitado (5,5: a célula mono é alta e a faixa é larga).
  // curva: expoente na cauda (1,9); sem ela a gaussiana cobre a faixa de '·' fraco.
  // grao: amplitude da granulação (0,5 no site; 0,72 + ruído · grão).
  // focos: 1 ou 2; o segundo anda na fase oposta do primeiro (espelhado no centro).
  // fase: avanço (radianos) no passeio dos focos; 0 é o do site. Com 2 focos e fase 0,94,
  //   parado (t = 3 s) os dois ficam nos extremos, um de cada lado.
  // Ponteiro: puxao (fração do caminho do foco até a atenção; 0 desliga toda a reação),
  //   seguir (peso por quadro da trilha no centro atrasado: menor segue mais rápido),
  //   voltar (fator por quadro do engajamento depois que o ponteiro sai: 0,75 ≈ 1 s),
  //   foco (raio da mancha de atenção, em linhas; 0 desliga), ganhoFoco (pico),
  //   esticar (quanto a mancha se alonga com o movimento), rastro (calor por ponto da
  //   trilha), decaimento (por quadro), espalhamento (raio do rastro, em linhas).
  // Profundidade: camadas (1, 2 ou 3), paralaxe [fundo, meio, frente] (fração do
  //   deslocamento do ponteiro, ao contrário), rolagemCamadas [fundo, meio, frente]
  //   (linhas por rolagem inteira), ralo (densidade dos pontos do fundo), deriva (colunas
  //   por segundo do fundo), niveis (curvas de nível do meio), largo (raio do campo do
  //   meio, em múltiplos do raio).
  // lupa: lupa (true: campo frio e calor só na lente), frio (nível da rampa fria),
  //   lente (raio da lente em linhas), lenteDeitada (alongamento horizontal da lente),
  //   aumento (0..1, quanto a lente aumenta o de baixo).
  padrao: {
    velocidade: 1, raio: 0.38, raioMin: 1.6, deitado: 5.5, curva: 1.9, grao: 0.5, focos: 1, fase: 0,
    puxao: 0.85, tom: 'tinta-2',
    seguir: 0.55, voltar: 0.75, foco: 1.3, ganhoFoco: 1.0, esticar: 0.6,
    rastro: 0.7, decaimento: 0.86, espalhamento: 1.1,
    camadas: 1, paralaxe: [0.06, 0.16, 0.3], rolagemCamadas: [0, 0, 0], rolar: 3, ralo: 0.07, deriva: 0.5,
    niveis: 4, largo: 2.2,
    lupa: false, frio: 0.5, lente: 2.6, lenteDeitada: 1.8, aumento: 0.45,
  },
  predefinicoes: {
    atencao: {},
    difuso: { raio: 0.46, curva: 1.6 },
    duplo: { focos: 2 },
    profundo: { camadas: 3, deitado: 3.5, rolagemCamadas: [1, 2.5, 4] },
    lupa: { lupa: true, camadas: 2, ralo: 0.1, rolagemCamadas: [1, 0, 3], paralaxe: [0.08, 0.16, 0.3] },
    nevoa: { camadas: 2, raio: 0.4, deitado: 3.5, curva: 1.7, grao: 0.8, ralo: 0.16, deriva: 1.2, paralaxe: [0.14, 0.2, 0.45], rolagemCamadas: [2, 0, 5] },
    cometa: { camadas: 3, focos: 2, raio: 0.3, rastro: 0.8, decaimento: 0.93, espalhamento: 1.4, esticar: 1.2, niveis: 6, rolagemCamadas: [1, 2, 3] },
  },
  desenhar(grade, ctx) {
    const P = ctx.params;
    const { raio, raioMin, deitado, curva, grao, puxao, tom } = P;
    const s = ctx.semente;
    const { cols, linhas } = grade;
    const t = tempo(ctx);
    const quadro = ctx.quadro ?? 0;

    const reage = !ctx.parado && puxao > 0;
    const A = reage ? atencaoDaEntrada(ctx.entrada, grade, quadro, P) : null;
    const e = A ? A.e : 0;
    const rol = ctx.parado ? 0 : limitar(Number(ctx.entrada?.rolagem) || 0, 0, 1);
    const camadas = Math.max(1, Math.min(3, Math.round(P.camadas)));

    const ry = Math.max(raioMin, linhas * raio) * (1 + Math.sin(t * 0.9) * 0.10);
    const rx = ry * deitado;

    // Paralaxe de cada plano: ao contrário do deslocamento da atenção em relação ao
    // centro da grade, escalado pelo engajamento (volta suave quando o ponteiro sai). São
    // deslocamentos de AMOSTRAGEM: amostrar em x + dx desenha o plano dx colunas para a
    // esquerda; a rolagem sobe os planos (o conteúdo sobe quando a página desce).
    const desl = (k) => {
      const f = P.paralaxe?.[k] ?? 0, r = P.rolagemCamadas?.[k] ?? 0;
      const dx = A ? (A.c.x - cols / 2) * f * e : 0;
      const dy = (A ? (A.c.y - linhas / 2) * f * e : 0) + rol * r;
      return { dx, dy };
    };
    // num plano só, a rolagem desce os focos `rolar` linhas por página rolada (sutil);
    // rolagem 0 ou ausente: deslocamento 0, a grade de antes
    const frente = camadas > 1 ? desl(2) : { dx: 0, dy: rol * ((P.rolagemCamadas?.[2] ?? 0) + (P.rolar ?? 0)) };
    const puxar = A ? { x: A.c.x, y: A.c.y, k: puxao * e } : null;
    const centros = centrosDosFocos(cols, linhas, t, P, puxar, frente.dx || frente.dy ? frente : null);

    // Mancha de atenção: elipse esticada ao longo do movimento.
    const rf = P.foco * Math.max(1, linhas / 7);
    const vel = A ? Math.hypot(A.v.x, A.v.y * ASP) : 0;
    const ux = vel > 1e-6 ? A.v.x / vel : 1, uy = vel > 1e-6 ? (A.v.y * ASP) / vel : 0;
    const estica = 1 + Math.min(3, P.esticar * vel / Math.max(1, rf * ASP));
    const atencao = (x, y) => {
      if (!A || P.foco <= 0) return 0;
      // centro adiantado meio caminho na direção do movimento: a mancha corre atrás e se
      // estica até o ponteiro
      const cx = A.c.x + A.v.x * 0.5, cy = A.c.y + A.v.y * 0.5;
      const dx = x - cx, dy = (y + 0.5 - cy) * ASP;
      const ao = dx * ux + dy * uy, de = -dx * uy + dy * ux;
      const d2 = (ao / estica) ** 2 + de ** 2;
      return e * P.ganhoFoco * Math.exp(-d2 / (rf * rf * ASP * ASP));
    };
    // Rastro: soma do calor deixado por cada ponto da trilha, decaindo com a idade.
    const re = P.espalhamento * Math.max(1, linhas / 7) * ASP;
    const rastro = (x, y) => {
      if (!A || P.rastro <= 0) return 0;
      let soma = 0;
      for (const p of A.pontos) {
        if (p.idade === 0) continue;
        const dx = x - p.x, dy = (y - p.y) * ASP;
        const d2 = (dx * dx + dy * dy) / (re * re);
        if (d2 > 9) continue;
        soma += P.rastro * P.decaimento ** p.idade * Math.exp(-d2);
      }
      return Math.min(0.75, soma);
    };

    // Lupa: centro da lente (atenção, ou um passeio lento sem ponteiro).
    let lente = null;
    if (P.lupa) {
      const ax = (0.5 + Math.sin(t * 0.17 + 1.3) * 0.36) * cols;
      const ay = (0.5 + Math.sin(t * 0.29) * 0.22) * linhas;
      lente = {
        x: A ? misto(ax, A.c.x, e) : ax,
        y: A ? misto(ay, A.c.y, e) : ay,
        r: P.lente * Math.max(1, linhas / 7),
      };
    }

    // Plano do meio: curvas de nível de um campo largo, com os focos de antes do puxão.
    const centrosMeio = camadas >= 3 ? centrosDosFocos(cols, linhas, t * 0.8, P, null) : null;
    const meio = camadas >= 3 ? desl(1) : null;
    const fundo = camadas >= 2 ? desl(0) : null;
    const derivaX = t * P.deriva;

    for (let y = 0; y < linhas; y++) {
      for (let x = 0; x < cols; x++) {
        // ---- frente
        let i = 0, quente = false;
        if (lente) {
          const dx = x - lente.x, dy = (y + 0.5 - lente.y) * ASP;
          const d2 = ((dx / P.lenteDeitada) ** 2 + dy * dy) / (lente.r * lente.r * ASP * ASP);
          const dentro = Math.exp(-d2);
          // a textura fria, vista pela lente: aumentada perto do centro
          const k = 1 - P.aumento * dentro;
          const sx = lente.x + dx * k + frente.dx, sy = lente.y + (dy / ASP) * k + frente.dy;
          const fr = ruido(sx * 0.21, sy * 0.55 + t * 0.12, s ^ SAL_FRIO);
          let n = P.frio * fr * fr;
          const calor = dentro ** 1.4 * (0.72 + 0.4 * ruido(sx * 0.5, sy * 0.9, s));
          n = Math.max(n, calor, Math.min(0.62, rastro(x, y)));
          i = limitar(Math.floor(Math.pow(n, curva) * RAMPA.length), 0, RAMPA.length - 1);
          // terracota só no miolo da lente
          if (i >= QUENTE && dentro < 0.7) i = QUENTE - 1;
          quente = i >= QUENTE;
          if (i > 0) {
            por(grade, x, y, RAMPA[i], quente ? 'achado' : dentro > 0.2 ? tom : 'tinta-3');
            continue;
          }
        } else {
          let n = campo(x, y, centros, rx, ry);
          const a = atencao(x, y);
          if (a > n) n = a;
          // granulação: mapa de atenção de verdade não sai liso
          n *= 0.72 + ruido((x + frente.dx) * 0.34, (y + frente.dy) * 0.7 + t * 0.5, s) * grao;
          const r = rastro(x, y);
          let ir = 0;
          if (r > 0) ir = Math.min(MORNO, Math.floor(Math.pow(r, curva) * RAMPA.length * 1.4));
          i = limitar(Math.floor(Math.pow(n, curva) * RAMPA.length), 0, RAMPA.length - 1);
          if (ir > i) { por(grade, x, y, RAMPA[ir], tom); continue; }
          if (i > 0) { por(grade, x, y, RAMPA[i], i >= QUENTE ? 'achado' : tom); continue; }
        }
        // ---- meio: curvas de nível do campo largo
        if (centrosMeio) {
          const b = campo(x + meio.dx, y + meio.dy, centrosMeio, rx * P.largo, ry * P.largo);
          const f = (b * P.niveis) % 1;
          if (b > 0.08 && (f < 0.12 || f > 0.94)) { por(grade, x, y, ':', 'tinta-3'); continue; }
        }
        // ---- fundo: rede rala de pontos que deriva para a esquerda
        if (fundo) {
          const u = Math.floor(x + fundo.dx + derivaX), v = Math.floor(y + fundo.dy);
          if (hash2(u, v, s ^ SAL_FUNDO) < P.ralo) por(grade, x, y, '·', 'tinta-3');
        }
      }
    }
  },
});
