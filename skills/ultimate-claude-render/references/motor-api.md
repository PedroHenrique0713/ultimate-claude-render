# API do motor (`M.*`)

Tudo é função de `t` (segundos no vídeo final). A cena monta a timeline `M.tl` (GSAP, pausada) e chama `await M.iniciar(TEMPOS.total)`; depois disso o render pede cada quadro por `window.__seek(t)`.

## Dados que a cena recebe

| Global | De onde vem | O que é |
|---|---|---|
| `MARCA`, `COR` | `marca.json` | nome, logo, url; `COR.destaque`, `COR.texto`… e `COR.rgba(hex, a)`, `COR.misturar(a, b, k)` |
| `FORMATO` | `projeto.json → formato` | `{ W, H, nome, leg, zonas }` |
| `TEMPOS` | `ucr tempos` | `{ total, frases: [{ texto, a, b, palavras: [{ t, a, b }] }] }` no tempo final |
| `MIDIA` | `ucr midia` | manifesto das fotos e vídeos de `midia/` |
| `BATIDAS` | `ucr batidas` | `{ bpm, t: [...] }` batidas da trilha |
| `SONS`, `CLIPES` | a própria cena | efeitos e clipes com som que o mix vai colocar |

## Tempo

- `M.T('sua coleção', n = 0, fim = false)`: início (ou fim) da n-ésima vez que essas palavras são ditas. Lança erro se não estiverem na narração.
- `M.batida(t, janela = .08)`: batida da trilha a menos de `janela` s de `t`; senão devolve `t`.
- `F[i].a / F[i].b`: início e fim da frase `i` (use `T` quando houver palavra-âncora).

## Fundo e texto

- `M.fundo({ estrelas = true, auras = true, n = 260 })`: céu que deriva, auras da cor de destaque, vinheta. O grão de filme entra no ffmpeg (`render.acabamento`).
- `M.camera({ rotY = 3, rotX = 1.4, periodoY = 5.2, periodoX = 7.4, zoom = 0, perspectiva = 2400 })`: a cena inteira (`#cena`) balança em 3D, com a perspectiva no próprio transform. Girar o `#cena` sem ela só o achata (~2 px). A legenda fica parada (está no `#palco`). Custa render: com ela e as auras animadas o demo passou de ≈ 8 para ≈ 14 min.
- `M.marca({ nome, logo })`: logo + nome. Fica na zona segura (vertical: base).
- `M.legendas(F, { de, ate, chaves: [], jaNaTela: 0, slam: false })`: blocos de até ~9 palavras que acendem palavra a palavra. `chaves` = começos de palavra que ganham a cor de destaque. `slam: true` = cada palavra bate (escala e assenta) e a chave dispara um clique.
- `M.grande(texto, { t, fim, y, tam, cor, destaque: [] })`: frase grande, palavras entram em mola.
- `M.palavras(elemento)`: troca o texto por `<span class="p">` por palavra, devolve os spans para animar.

## Aparelhos e janelas

- `M.celular(pai, { x, y, B = .46, moldura })`: aparelho com moldura de CSS (ou a sua: `moldura: 'caminho.png'` ou `marca.celular.moldura`). Retorna `{ c, f, tela, app, dedo, K, STATUS, pagina(src), noPalco(cx, cy, rolagem) }`. `pagina(src)` põe uma captura de 390 px de largura dentro da tela. `M.iphone` é alias.
- `M.janela(pai, { x, y, largura = 960, altura = 667, url })`: navegador; `pagina(src)` recebe uma captura de 1440 px.
- `M.terminal(pai, { x, y, largura, altura, titulo, linhas, som = true, cursor = true })`: `linhas = [{ t, texto, prefixo: '$ ', classe: 'ok'|'ap'|'pr', vel: 26 }]`; `vel` em caracteres/s (0 = aparece inteira); tecla soa a cada 2 caracteres.
- `M.cursor(pai)` + `M.clicar(pai, cursor, x, y, t, { de, dur })`: mouse e onda de clique.
- `M.tocar(celular, x, y, t)`: dedo (coordenadas da tela do celular).
- `M.luz(janela, t)`: faixa de luz que atravessa.
- `M.recorte(pai, src, larguraCss, rect, { margem, escala, left, top, rot, raio })`: recorta um componente de uma tela filmada pela borda medida.

## Mídia inserida

Ponha o arquivo em `midia/`, rode `ucr midia` e use o nome sem extensão.

- `M.foto(pai, nome, { x, y, w, h, de, ate, zoom: [1, 1.1], deriva: [0, 0], raio, entrada, saida, sombra, ajuste, z })`: preenche a caixa (cover), entra e sai suave, zoom e deriva lentos. PNG/WebP com transparência (logo, produto recortado) fica inteiro (`contain`), sem fundo nem sombra de cartão.
- `M.video(pai, nome, { x, y, w, h, de, ate, inicio = 0, laco = false, som = false, ganho = 1, raio, entrada, saida, sombra, z })`: o clipe vira sequência de JPEG (trocar `src` custa ~10 ms; `<video>` custava 250–500 ms por quadro). `som: true` leva o áudio do arquivo para o mix no instante em que o clipe entra. `inicio` = segundo do arquivo onde começa.
- `M.sequencia(pai, pasta, { de, ate, n, fps, inicio, modo: 'laco'|'vaivem'|'uma' })`: baixo nível (use quando já tem uma pasta `0001.jpg…`).

## Som e borrão

- `M.som(t, tipo, ganho = 1)`: marca um efeito (`whoosh`, `impacto`, `clique`, `brilho`, `subida`, `obturador`, `pop`, `tecla`, `grave`, `papel`, ou o nome de uma pasta em `midia/sfx/`). `whoosh` e `impacto` abrem uma janela de borrão de movimento sozinhos.
- `M.borrao(t0, t1)`: janela extra de borrão (o render só tira amostras extras dentro das janelas; `render.mb` define quantas).
- `window.BORRAO_AUTO = false`: desliga a janela automática.

## Baixo nível

- `M.tl`, `M.cena`, `M.palco`, `M.W`, `M.H`, `M.el(tag, classe, estilo, pai)`, `M.px(n)`, `M.$`.
- `M.ATUALIZAR.push(t => { ... })`: roda a cada quadro, com o `t` exato (contadores, canvas, digitação).
- `M.iniciar(total)`: espera fontes e imagens, registra `__seek` e `__ready`. Fora do render (navegador), toca em tempo real: `?t=20` começa no segundo 20, `?audio=<mix.wav>` toca junto.

## Padrões que evitam bug

```js
// entrada que não pisca no quadro 0
tl.set(e, { opacity: 0 }, 0);
tl.fromTo(e, { opacity: 0, y: 70 }, { opacity: 1, y: 0, duration: .6, immediateRender: false }, t);

// contador em função de t
M.ATUALIZAR.push((t) => { el.textContent = (k(t) * 100).toFixed(0); });

// troca de cor da marca ao vivo (a variável CSS é animada)
tl.to(document.documentElement, { '--destaque': '#FF7A45', duration: .35 }, t);
```
