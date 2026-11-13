---
name: ultimate-claude-render
description: Cria vídeo (Reels, Shorts, TikTok, YouTube, anúncio, demo de produto) a partir de uma cena em HTML animado com GSAP, renderizada quadro a quadro, com narração e legenda palavra a palavra, foto e vídeo inseridos, telas reais de app, trilha, efeitos, mix em -14 LUFS e QA automático. Funciona com qualquer marca (marca.json) e em Linux, macOS e Windows. Use quando o pedido for "faz um vídeo", "vídeo de lançamento", "anúncio", "demo do produto", "reels", "render", "motion", "legenda sincronizada" ou quando um vídeo anterior saiu "parado", "amador", "dessincronizado" ou "sem cara da marca".
---

# ultimate claude render

Um vídeo é uma **página HTML** cujo estado é função do tempo `t`. O Claude escreve a cena; o motor pede cada quadro (`window.__seek(t)`), tira a captura no Chromium headless e o ffmpeg junta com a voz, a trilha e os efeitos. Nada é "gravado": tudo é determinístico e refazível.

O repo é o motor + os scripts de áudio + esta skill. Os vídeos de cada pessoa ficam em pastas de projeto fora dele.

## Antes de escrever uma linha

1. **Rode `ucr doctor`.** Se faltar ffmpeg, Python com numpy/scipy ou Chromium, ele diz o comando exato.
2. **Ache o repo.** A skill instala com `ucr instalar-skill` e o repo fica onde foi clonado (`ucr` no PATH ou `node <repo>/bin/ucr.mjs`). Se não achar, pergunte onde está clonado; não reimplemente o motor.
3. **Plano antes de produzir** (vídeo caro de refazer): roteiro completo, formato, marca, mídia disponível, números com fonte, o que aparece em cada frase. O usuário aprova por etapa: **roteiro → quadros de estilo (`ucr stills`) → prévia → render final**. Não renderize o vídeo inteiro sem o roteiro e os quadros aprovados.
4. **Marca existente primeiro.** Leia o brandbook, o site ou o app do usuário e escreva o `marca.json` (cores, fonte, logo). Nunca invente identidade nem redesenhe o logo. Material de cliente com cara de template genérico é reprovado: foto, cor e logo reais.

## Fluxo

```
ucr novo meu-video --marca <pasta-da-marca|_modelo|exemplo> --formato vertical
# edite narracao.txt, projeto.json e cena.html
ucr tudo meu-video          # prep → midia → voz → tempos → batidas → sons → mix → render → QA
```

Etapas soltas: `ucr prep|midia|voz|tempos|batidas|sons|mix|render|qa <pasta>`. Conferência barata: `ucr stills <pasta> 2,8.5,15` (PNG de qualquer instante, sem renderizar o vídeo). Prévia em tempo real: `ucr preview <pasta> --audio`.

Pasta de um projeto:

| Arquivo | O que é |
|---|---|
| `projeto.json` | formato, fps, marca, voz, respiros, mix, render |
| `narracao.txt` | o roteiro falado; vira voz, legenda e tempo da cena |
| `cena.html` | a cena (o que você escreve) |
| `marca/` ou `marca` em outro caminho | `marca.json` + fontes + logo |
| `midia/` | fotos, vídeos, `trilha.mp3`, `sfx/<tipo>/` |
| `build/`, `.ucr/`, `saida/` | gerados; não versionar |

## Escrevendo a cena

Esqueleto: ver `exemplos/modelo-cena.html` do repo. A ordem dos `<script>` importa (GSAP → marca → projeto → tema → tempos → midia → batidas → motor). API completa em `references/motor-api.md`; resumo:

- `M.fundo()`, `M.marca()`, `M.legendas(F, { chaves: [...] })`, `M.grande(texto, { t, fim })`
- `M.celular(pai, {x,y,B})`, `M.janela(pai, {...})`, `M.terminal(pai, {linhas})`, `M.cursor/clicar/tocar`
- `M.foto(pai, 'nome', {...})`, `M.video(pai, 'nome', { som: true })` (de `midia/`, depois de `ucr midia`)
- `M.T('palavras')` = instante em que essas palavras são ditas. **Ancore tudo na fala**, não em segundos fixos: trocar uma frase do roteiro não desloca o resto da cena.
- `M.som(t, 'tipo')` marca efeito para o mix; `M.batida(t)` puxa um corte para a batida da trilha.

Regras de ouro da cena:
1. **Tudo depende só de `t`.** Tweens na timeline (`M.tl`), contadores e desenhos em `M.ATUALIZAR.push(t => ...)`. Nada de `setInterval`, `Date.now()`, `<video>` com `play()` ou CSS animation.
2. **Zona segura da plataforma:** o QA acusa texto fora dela (vertical: 14% no topo e 25% na base).
3. **Descanso leva deriva.** Nada parado por mais de ~1,5 s (o QA mede e o espectador pula).
4. **Cada fala muda o quadro.** Frase nova, imagem nova ou movimento novo.
5. **Antes de renderizar:** `node --check` no script da cena (variável repetida derruba tudo e o erro só aparece depois de ~90 s).

## Áudio

- **Voz:** `projeto.json → voz.provedor`: `edge` (grátis, sem chave; bom para testar, não para uso comercial), `elevenlabs`, `fal`, ou `arquivo` (você gravou; tempos pela Deepgram `nova-3`). Texto da tela = o do `narracao.txt`, os tempos vêm da voz.
- **Respiros:** `"respiros": {"2": 1.2}` = 1,2 s de silêncio depois da frase de índice 2 (a imagem precisa de tempo para entrar).
- **Trilha:** `midia/trilha.mp3` (licença comercial!) ou `"sintetica"` (original, sem licença). Abaixa sozinha sob a voz (ducking).
- **Efeitos:** sintetizados (whoosh, impacto, clique, brilho, subida, obturador, pop, tecla, grave, papel) ou arquivos em `midia/sfx/<tipo>/`.
- **Master:** −14 LUFS e −1,5 dBTP (Reels/TikTok/Shorts), medido no arquivo final.

Detalhes e armadilhas: `references/audio.md`.

## QA e entrega

O render roda o QA sozinho (`saida/<nome> - QA.txt`): tamanho, cor (BT.709 marcado), quadro parado, trecho preto, loudness, pico e texto fora da zona segura. **QA verde não é aprovação**: abra o MP4, veja os quadros, ouça. Reporte o que o QA acusou e o que você viu; não declare "pronto" sem ter olhado.

Saídas: `saida/<nome>.mp4` (entrega, 22 Mb/s) e `saida/<nome> - leve.mp4` (30 fps, para mandar por mensagem).

## Quando algo dá errado

- Cena não fica pronta (`A cena não ficou pronta`): quase sempre caminho de `<script>`/mídia errado ou erro de sintaxe; a mensagem lista os erros da página.
- Render lento: ver `references/armadilhas.md` (filter blur, backdrop-filter, blend em tela cheia, `<video>` na página).
- Refazer só um trecho: `ucr render <pasta> --de 30 --ate 38` (reaproveita os pedaços do render anterior se os parâmetros forem os mesmos).
- Antes de render longo: `df -h` (≈ 250 MB de pedaços e ≈ 145 MB de entrega por 45 s a 1080×1920).

## Referências (ler sob demanda)

- `references/motor-api.md`: toda a API de `M.*` com exemplos
- `references/marca.md`: `marca.json` campo a campo, formatos e zonas
- `references/audio.md`: voz, respiros, trilha, efeitos, mix, licenças
- `references/receitas.md`: foto, vídeo no meio, tela real, terminal, horizontal, variantes, troca de paleta
- `references/armadilhas.md`: o que já quebrou (medido), por tema
