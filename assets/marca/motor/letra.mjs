// Letra própria do Findings ("Findings Grade"): bitmap 5×7 guardado em fonte/grade.json.
// compor() devolve sete linhas de mesma largura, '#' para ponto aceso e '.' para apagado.

const URL_GRADE = new URL('../fonte/grade.json', import.meta.url);
let grade = null;
let carregando = null;

// Lê grade.json uma única vez. No Node usa node:fs (importado só aqui, para o módulo
// continuar carregando no navegador); no navegador usa fetch.
export function carregar() {
  if (grade) return Promise.resolve(grade);
  if (!carregando) {
    carregando = (async () => {
      let texto;
      if (typeof process !== 'undefined' && process.versions?.node) {
        const { readFile } = await import('node:fs/promises');
        texto = await readFile(URL_GRADE, 'utf8');
      } else {
        const resposta = await fetch(URL_GRADE);
        if (!resposta.ok) throw new Error(`não consegui ler grade.json (${resposta.status})`);
        texto = await resposta.text();
      }
      grade = JSON.parse(texto);
      return grade;
    })();
    carregando.catch(() => { carregando = null; });
  }
  return carregando;
}

// Quem importa o módulo já recebe a letra carregada.
await carregar();

function exigirGrade() {
  if (!grade) throw new Error('letra não carregada: chame await carregar() antes');
  return grade;
}

function glifosDe(texto) {
  const g = exigirGrade();
  return [...String(texto).toUpperCase()].map(c => {
    const glifo = g.glifos[c];
    if (!glifo) throw new Error(`a letra não tem o caractere "${c}"`);
    return glifo;
  });
}

export function larguraEmPontos(texto, { entreLetras = 1 } = {}) {
  const n = glifosDe(texto).length;
  if (n === 0) return 0;
  return exigirGrade().largura * n + entreLetras * (n - 1);
}

export function compor(texto, { entreLetras = 1 } = {}) {
  const g = exigirGrade();
  const glifos = glifosDe(texto);
  const vao = '.'.repeat(entreLetras);
  return Array.from({ length: g.altura }, (_, linha) =>
    glifos.map(glifo => glifo[linha]).join(vao));
}
