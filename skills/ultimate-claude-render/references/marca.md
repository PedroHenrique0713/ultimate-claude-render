# Marca (`marca.json`) e formato

A marca é **um arquivo e uma pasta**: `marca.json` + `fonts/` + `logo.svg`. O projeto aponta para ela em `projeto.json → "marca"` (caminho relativo ao projeto). O `ucr prep` copia a pasta inteira para `.ucr/marca/`, reescreve os caminhos e gera `window.MARCA`.

```json
{
  "nome": "Minha Marca",
  "url": "minhamarca.com",
  "logo": "logo.svg",
  "cores": {
    "fundo": "#0B0D10",
    "breu": "#14171B",
    "texto": "#F2F3F5",
    "destaque": "#FF7A45",
    "destaque-claro": "#FFB08C",
    "acento": "#4FB3FF"
  },
  "fonte": { "familia": "Inter", "arquivos": { "400": "fonts/Inter-400.woff2", "700": "fonts/Inter-700.woff2" } },
  "fundo": { "aura_b": "#4FB3FF", "vinheta": 0.55 },
  "legenda": { "tamanho": 60 },
  "celular": { "moldura": "iphone.png" }
}
```

## Cores

Obrigatórias na prática: `fundo`, `breu`, `texto`, `destaque`. O tema deriva o resto:

| Variável CSS | Padrão |
|---|---|
| `--fundo-centro` | `fundo` misturado 7% com `destaque` |
| `--apagado` | `texto` a 58% |
| `--linha` | `texto` a 14% |
| `--vidro` | `breu` +5% de `texto`, a 86% |
| `--barra` | barra do navegador e do terminal |
| `--sobre-destaque` | escuro ou branco, conforme a luminância do `destaque` (texto sobre botão/chip) |
| `--destaque-fraco`, `--destaque-brilho` | `destaque` a 16% e 55% |
| `--aura-a-*` | auras na cor de `destaque`; `--aura-b-*` em `fundo.aura_b` |

Qualquer chave pode ser fixada em `cores` (`"vidro": "rgba(...)"`). Na cena use `var(--destaque)`, `var(--texto)`, `var(--breu)`…; em JS, `window.COR`.

## Fonte

`woff2` por peso (400 a 800). **Use a fonte da marca**: copie os arquivos do brandbook. Sem `arquivos`, cai em `system-ui` (e o vídeo sai "genérico"). O render precisa da fonte carregada: `document.fonts.ready` é aguardado antes do primeiro quadro.

## Logo

SVG ou PNG quadrado. **Nunca redesenhe um logo existente**: copie o original. Sem logo, `M.marca()` mostra só o nome.

## Moldura de aparelho

O celular padrão é desenhado em CSS (genérico, sem imagem de fabricante). Para uma moldura específica, aponte `celular.moldura` para um PNG 1350×2760 com a tela transparente em (72, 69, 1206×2622); respeite a licença da imagem.

## Formatos e zonas seguras (`projeto.json → "formato"`)

| Formato | Palco | Zona segura (topo / base) | Legenda |
|---|---|---|---|
| `vertical` | 1080×1920 | 14% / 25% (Reels, Shorts, TikTok) | y=300, 60 px |
| `horizontal` | 1920×1080 | 6% / 8% (YouTube, site, apresentação) | y=790, 56 px |
| `quadrado` | 1080×1080 | 8% / 12% (feed) | y=780, 54 px |

Ajuste fino em `projeto.json → "zonas": { "topo": .1, "base": .2 }`. O QA só acusa **texto do DOM** fora da zona; a imagem dentro de um cartão não conta (decisão sua).

## Várias marcas, um motor

Cada projeto tem a sua marca. Para trocar a identidade do mesmo vídeo basta trocar o `"marca"` do `projeto.json` e rodar `ucr render`. O motor, a voz e a trilha não mudam.
