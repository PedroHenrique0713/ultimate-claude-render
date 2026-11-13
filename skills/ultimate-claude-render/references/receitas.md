# Receitas

## Foto no meio

```bash
cp minha-foto.jpg meu-video/midia/produto.jpg
ucr midia meu-video
```
```js
M.foto(M.cena, 'produto', { x: 90, y: 700, w: 900, h: 700, raio: 34, de: M.T('produto'), ate: M.T('produto', 0, true) + 1,
                            zoom: [1, 1.12], deriva: [-30, -12] });
M.som(M.T('produto'), 'obturador');
```
Foto de tela cheia: omita `x y w h` (preenche o palco). A foto é redimensionada para o lado maior ≤ 3200 px; a original não é tocada.

## Vídeo no meio (com o som dele)

```js
M.video(M.cena, 'depoimento', { x: 90, y: 700, w: 900, h: 700, raio: 34, de: 12, ate: 20, inicio: 3, som: true, ganho: .8 });
```
`inicio: 3` começa no segundo 3 do arquivo. `laco: true` repete se `ate - de` for maior que o clipe. O áudio entra no mix em `de`. Clipe longo com legenda própria: corte antes (`ffmpeg -ss -to`) e use só o trecho.

## Tela real de um app ou site

```json
{ "base": "https://staging.exemplo.com", "login": { "url": "/login", "campos": [{ "css": "input[type=email]", "valor": "demo@exemplo.com" }, { "css": "input[type=password]", "valor": "…" }], "enviar": "button[type=submit]", "depois": "dashboard" },
  "tomadas": [ { "id": "painel-cel", "dispositivo": "cel", "url": "/dashboard" }, { "id": "painel-desk", "dispositivo": "desk", "url": "/dashboard", "altura": 900 } ] }
```
```bash
ucr filmar plano.json meu-video/telas
```
```js
const cel = M.celular(M.cena, { x: 317, y: 596, B: .33 });
cel.pagina('telas/painel-cel.png');
M.tocar(cel, cel.K * 316, cel.STATUS + cel.K * 38, M.T('clique aqui'));
```
`base` pode ser uma pasta local (relativa ao plano): `"base": "app"` com `"url": "/index.html"`. Credencial nunca no repo: leia de variável de ambiente ao gerar o plano.

## Terminal que digita

```js
M.terminal(M.cena, { x: 90, y: 690, largura: 900, altura: 600, titulo: 'zsh', linhas: [
  { t: M.T('instala'), prefixo: '$ ', texto: 'npm i meu-pacote', vel: 24 },
  { t: M.T('instala') + 1.4, texto: '✓ 3 pacotes', classe: 'ok' } ] });
```

## Horizontal (YouTube, site) ou quadrado

`projeto.json → "formato": "horizontal"`. O palco passa a 1920×1080, a legenda vai para a base e a zona segura muda. Posições da cena são em px do palco: leia `M.W` e `M.H` para centralizar (`x: (M.W - 900) / 2`).

## Duas versões do mesmo vídeo (gancho A/B, outro idioma, outra marca)

Copie a pasta do projeto (`cp -r meu-video meu-video-b`), troque o `narracao.txt` ou o `"marca"` e rode `ucr tudo meu-video-b`. Cena ancorada em `M.T` acompanha o texto novo. Se a cena usa índice de frase (`F[3]`), reveja os índices.

## Troca de paleta ao vivo

```js
tl.to(document.documentElement, { '--destaque': '#FF7A45', '--destaque-claro': '#FFB08C', duration: .35 }, t);
```
Tudo que usa `var(--destaque)` acompanha (legenda-chave, chips, terminal). Cores copiadas para JS (`COR.destaque`) não mudam; use a variável.

## Gráfico ou contador em função do tempo

```js
M.ATUALIZAR.push((t) => { const k = Math.min(1, Math.max(0, (t - t0) / dur)); el.textContent = (valor * (1 - (1 - k) ** 3)).toFixed(1); });
```
Desenhar em `<canvas>` também vale (ver o mixer do `exemplos/demo/cena.html`, que usa os tempos reais da narração).

## Render parcial e variações de qualidade

```bash
ucr render meu-video --fps 30 --dsf 1 --mb 1 --sem-qa     # rascunho rápido
ucr render meu-video                                       # final (fps do projeto, dsf 1.5, mb 4)
ucr render meu-video --de 30 --ate 38                      # refaz só 30 a 38 s
PRESET=slow ucr render meu-video                           # encode mais lento e menor
```
