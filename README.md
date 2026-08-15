# findings-devblog

Site público do devblog do **Findings** — classificador de achados em radiografia
de tórax. Publicado em <https://ricamp.github.io/findings-devblog/>.

## Este repositório não é a fonte dos textos

As entradas nascem em `devblog/*.md` no repositório `ricamp/findings`, que é
privado. Aqui ficam apenas o site e os posts **gerados**.

Não edite `_posts/` à mão. Uma correção feita aqui é perdida na próxima
publicação, e passa a divergir da versão que o repositório do código considera
verdadeira. Corrija na origem e publique de novo.

## Como publicar

A partir da raiz do repositório `findings`:

```bash
python scripts/publicar_devblog.py --destino ../findings-devblog --conferir  # o que mudaria
python scripts/publicar_devblog.py --destino ../findings-devblog             # aplica
```

Depois, aqui: revise o diff, commite e dê push. O GitHub Pages compila sozinho —
não há build local. O script não commita de propósito: publicar é decisão
tomada olhando o diff.

## Estrutura

| Caminho | O que é |
|---|---|
| `_config.yml` | Configuração do Jekyll. `baseurl` precisa bater com o nome do repositório |
| `index.html` | Índice das entradas |
| `_layouts/` | `default.html` (moldura, tema claro/escuro) e `post.html` (entrada) |
| `assets/style.css` | Identidade visual v1.3 — serifa = voz humana, mono = voz da máquina |
| `_posts/` | **Gerado.** Não editar |

## Tema

Claro por padrão, escuro seguindo `prefers-color-scheme`, alternável pelo botão
no topo ou pela tecla `t`. A escolha fica no `localStorage`.

---

Findings é um projeto de pesquisa e portfólio. **Não é dispositivo médico**, não
tem aprovação da ANVISA, da FDA ou de qualquer órgão regulador, e nada que ele
produz deve ser usado para decidir sobre um paciente. Todos os dados usados vêm
de datasets públicos de pesquisa.
