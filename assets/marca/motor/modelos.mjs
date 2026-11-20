// Tabela dos modelos do Findings, guardada em modelos.json (na raiz do kit): nome, descrição,
// quebra do nome em duas linhas, efeito de assinatura e a entrada de estreia no devblog.
// Mesmo padrão de motor/letra.mjs: lida uma vez, com node:fs no Node e fetch no navegador.

const URL_MODELOS = new URL('../modelos.json', import.meta.url);
let tabela = null;
let carregando = null;

// Bandeira do kit (a ⚑ não existe na JetBrains Mono), sempre seguida do aviso.
export const BANDEIRA = '▛';
export const AVISO = 'not a medical device';

export function carregar() {
  if (tabela) return Promise.resolve(tabela);
  if (!carregando) {
    carregando = (async () => {
      let texto;
      if (typeof process !== 'undefined' && process.versions?.node) {
        const { readFile } = await import('node:fs/promises');
        texto = await readFile(URL_MODELOS, 'utf8');
      } else {
        const resposta = await fetch(URL_MODELOS);
        if (!resposta.ok) throw new Error(`não consegui ler modelos.json (${resposta.status})`);
        texto = await resposta.text();
      }
      tabela = JSON.parse(texto);
      return tabela;
    })();
    carregando.catch(() => { carregando = null; });
  }
  return carregando;
}

// Quem importa o módulo já recebe a tabela carregada.
await carregar();

// Troca a tabela em memória (ferramentas e testes: o pipeline de variações roda um modelo
// de mentira a partir de outro arquivo). Devolve a tabela anterior, para desfazer.
export function definirTabela(nova) {
  if (!nova || typeof nova !== 'object') throw new Error('definirTabela: precisa de um objeto { chave: modelo }');
  const antes = tabela;
  tabela = nova;
  return antes;
}

function exigirTabela() {
  if (!tabela) throw new Error('modelos não carregados: chame await carregar() antes');
  return tabela;
}

// Chaves na ordem do arquivo.
export function chaves() {
  return Object.keys(exigirTabela());
}

// A linha do modelo; chave desconhecida é erro de quem chama, com as chaves válidas.
export function modelo(chave) {
  const t = exigirTabela();
  if (!Object.hasOwn(t, chave)) {
    throw new Error(`modelo desconhecido: ${chave} (chaves válidas: ${chaves().join(', ')})`);
  }
  return t[chave];
}
