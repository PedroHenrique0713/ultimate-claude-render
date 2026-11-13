# O que já quebrou (medido)

Cada item custou horas num vídeo real. Organizado por tema; leia o tema do problema que você tem.

## Render lento ou quebrado

- **O Chromium headless compõe em software, e o custo está na captura, não no seek.** Medido em 1080×1920: seek de 20–70 ms, captura de 1,3 a 2,9 s. Culpados, em ordem:
  - `filter: blur(100px)` em auras que se movem e `backdrop-filter` em painéis de vidro → use `radial-gradient` sem filtro e fundo semiopaco.
  - Grão de filme em canvas de tela cheia com `mix-blend-mode: overlay` → tire da página e ponha no ffmpeg (`render.acabamento: "noise=alls=6:allf=t"`).
  - `page.screenshot()` em PNG → o motor usa o CDP direto (`Page.captureScreenshot` JPEG q94 `optimizeForSpeed`).
  - Telas de 2880 px exibidas a 960 → reduza ao tamanho em que aparecem (≈1,4× para zoom).
  Com isso a captura caiu para 0,1–0,3 s por quadro.
- **`<video>` na página custa 250–500 ms por quadro** no seek (mesmo VP9 só com quadros-chave). Sequência de JPEG custa ~10 ms. O Chromium do Playwright também não toca H.264. Por isso `ucr midia` converte vídeo em sequência.
- **`filter: blur` na peça que perde a nitidez:** faça crossfade para uma cópia borrada pelo ffmpeg (`gblur=sigma=38`), nunca filtro CSS.
- **Borrão de movimento** (`render.mb: 4`) multiplica a captura só nas janelas que a cena marca (`whoosh`, `impacto`, `M.borrao`). Sem janela nenhuma o motor borra o vídeo todo (aviso no log).
- **WebGL (Three.js) no headless:** software (`--enable-unsafe-swiftshader`, o padrão do `ucr`, ~370 ms por quadro 3D a 1080×1920) ou a placa pelo Vulkan no Linux (`RENDER_GPU=1`, ~96 ms, imagem idêntica). Three ≥ r171: `three.module.min.js` importa `./three.core.min.js`; copie os dois (o `npm install` já faz), senão dá 404 e a cena nunca fica pronta, **sem erro de página**.
- **Disco:** `df -h` antes de render longo. O `/home` chegou a 100% no meio do encode e deixou o MP4 cortado, sem `moov`; os pedaços sem perda ficaram inteiros e `--de/--ate` refez a entrega. Um vídeo de 45 s a 1080×1920 pede ~250 MB de pedaços e ~145 MB de entrega.
- **O encode da entrega custa ~4 s por segundo de vídeo** em `-preset slow` (padrão do `ucr`: `medium`). Refazer um intervalo poupa as capturas, não o encode inteiro.
- **`--de/--ate` só reaproveita pedaços feitos com os mesmos parâmetros** (cena, w, h, fps, dsf, mb, tamanho do pedaço; `params.txt` na pasta `trechos-*`). Mudou algum, rode inteiro.
- **Dois renders ao mesmo tempo** disputam CPU e o mesmo diretório de pedaços. Uma fila por projeto.

## Cena que não renderiza como você esperava

- **Girar o `#cena` não dá 3D:** a `perspective` do `#cena` vale para os filhos; a rotação do próprio `#cena` é aplicada depois dela e só achata a cena (±3° deram ~2 px). Use `M.camera()`, que põe `transformPerspective` no transform do próprio elemento.
- **Movimento que o olho não vê:** cartão quase preto (`#0E0F12`) sobre fundo quase preto balançando ±5° mudou 1,6 nível de cinza em 1,5 s; o QA reprova abaixo de 3, e com razão. Com borda clara, brilho da cor de destaque e auras que passeiam, o mesmo trecho foi a 2,8–3,8. Dê contraste ao que se mexe.
- **Erro de script some no tempo-limite:** o `SyntaxError` de um `<script>` embutido dispara durante o carregamento da página; um ouvinte criado depois do `goto` não o vê, e o render esperava 90 s para dizer "não ficou pronta". O `render.mjs` cria o ouvinte antes do `goto` e cai em ~1 s.

- **`tl.set(..., 0)` em t = 0 não renderiza no `seek(0)`:** o primeiro take precisa de `gsap.set` direto, senão o quadro 0 sai vazio. Padrão seguro: `tl.set(e, {opacity:0}, 0)` + `fromTo(..., { immediateRender: false })`.
- **`preserve-3d`:** `z-index` não vale (o que precisa ficar na frente ganha `translateZ`; um celular girado passou na frente de um cartão com z-index maior). `filter` no elemento com `preserve-3d` achata o 3D e o verso da carta aparece espelhado: o filtro vai na face, nunca no giro. Camadas planas: classe `.plano` (`transform-style: flat`).
- **Variável repetida na cena** (`const selo` duas vezes) derruba tudo e o render leva ~90 s para dizer. `node --check` no script extraído do HTML antes.
- **Cena de variante herda nomes** da cena-base: variável nova no escopo da função com nome repetido derruba a cena.
- **`M.batida(t)` sem `<script src="build/batidas.js">`** devolve o próprio `t` sem avisar.
- **Transição em shader que lê o `<img>` da sequência:** desenhar no `ATUALIZAR` pega o quadro ANTERIOR (o motor troca o `src` depois). Embrulhe `window.__seek` logo depois do `M.iniciar` e desenhe no fim; a janela da sequência precisa passar ~0,2 s do corte para os dois quadros estarem decodificados.
- **Sequência de quadros dentro de um cartão que já tem `<img>`:** passe `estilo: { position: 'absolute', left: 0, top: 0 }`; o CSS do cartão dá `display: block` e a segunda imagem cai para fora.
- **Classe nova com nome já usado no CSS** (`.lic`) herda regras que você não escreveu. Prefixe.
- **Fonte não carregada:** o primeiro quadro sai com a fonte do sistema. O motor espera `document.fonts.ready`; se a fonte nunca aparece, confira o caminho no `marca.json`.

## Legenda

- **Legenda escura sobre foto em tela cheia:** a faixa das legendas precisa de fundo claro atrás (véu) quando a cena é foto; a saia preta engoliu o texto.
- **Contorno come o espaço entre palavras:** com `-webkit-text-stroke` grosso, um gap de 30 px vira 21 px de respiro real e as palavras colam. Some o contorno ao gap.
- **Eventos de legenda não podem se sobrepor:** o fim de um bloco é o início do próximo (o motor já garante; cuidado ao mexer).
- **Palavra nova nas `chaves` da legenda** muda o som quando `slam: true` (cada destaque dispara um clique).
- **A transcrição inventa nome próprio:** "UFV"→"UFB", "Vet Run"→"Vector Run". Por isso o texto da tela é o do `narracao.txt`, não o da transcrição. A Deepgram também pode devolver palavra repetida na emenda ("mas mas"); o alinhamento ao roteiro resolve.
- **Zona segura:** vertical 14% no topo e 25% na base. O QA lista o texto do bloco inteiro, inclusive palavra que ainda não apareceu, e texto cortado por `overflow: hidden` também entra.

## Áudio

- `ucr mix` com narração em silêncio sai mudo (`measured_I = -inf`): o nível da trilha é medido pela voz. Sem voz, use `"voz": null` e `duracao`.
- Prévia curta: o nível da trilha é medido numa janela de 20% a 90% do vídeo; abaixo de ~20 s a medida é imprecisa. Gere o mix inteiro e corte no render.
- **`loudnorm` e `acompressor` com makeup devolvem o ruído** que o denoise tirou (piso 0,0005 → 0,028, 50× pior). Normalize uma vez no master.
- **Efeito demais:** o ouvido registra cada `clique` de legenda. Menos efeitos, mais intenção.
- **Música sem licença** é o que derruba anúncio. Trilha e efeitos: sintetizados, Sound Collection da Meta, ou licença comercial comprovada. `edge-tts` e geradores "grátis" do trial **não** liberam uso comercial.

## Cor e entrega

- O JPEG do Chrome é BT.601 faixa cheia; a entrega é BT.709 faixa limitada e marcada. A conversão é pelo filtro `colorspace` (feita em `render.mjs`). **Não troque pelo `scale=out_color_matrix`**: escurece ~2,5 níveis. Sem isso o MP4 sai `yuvj420p/pc/bt470bg` e o player mostra cor diferente do preview.
- O QA confere `yuv420p`, `tv`, `bt709` nas três propriedades.
- `-movflags +faststart` está ligado (reprodução imediata no WhatsApp e nas redes).

## Filmar telas reais (`ucr filmar`)

- **`element.screenshot()` rola a página até o elemento:** a foto principal sai rolada se for tirada depois dos recortes. Foto principal primeiro, recortes por último (o `filmar` já faz).
- O app pode rolar sozinho depois de um clique: meça os retângulos só depois que a rolagem assentar (o `filmar` espera).
- **Captura de página inteira no desktop repete cabeçalho e barra lateral fixos** no meio da imagem. Use janela alta (`"altura": 1400` na tomada) em vez de `fullPage`.
- Conteúdo de verdade, nunca de produção: grave de um ambiente de demonstração com dados fictícios. Esconda avisos de dev (botão do Next, banner de ambiente local) pelo `plano.esconderTextos`.

## Ritmo e composição (o que o espectador sente)

- **Vídeo parado:** composição sem mudar por mais de ~1,5 s é reprovada ("vídeo parado... eu pularia"). Todo descanso leva deriva (zoom lento, parallax, respiração da aura).
- **Cada fala muda o quadro.** Uma tela estática com texto sobre uma foto é "animatic", não motion.
- **Escuro demais** cansa em celular ao ar livre; confira os quadros claros e escuros no brilho baixo.
- **Aceleração sutil** (1,05–1,10×) muda a sensação de ritmo sem se notar; ao acelerar, recalcule a legenda.
- **O que passou no QA ainda pode estar feio.** O QA mede o que é medível; olhe o vídeo.
