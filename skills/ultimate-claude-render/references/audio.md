# Áudio: voz, respiros, trilha, efeitos e mix

> Regra de ouro: **toda mudança de áudio se mede no arquivo final**, não na etapa. O erro recorrente é medir o filtro isolado e não a cadeia inteira.

## Voz (`projeto.json → "voz"`)

Uma saída só, qualquer provedor: `build/audio/narracao.mp3` + `build/audio/frases.json` (`[{ texto, a, b, palavras: [{ t, a, b }] }]`). O resultado fica em cache (assinatura = config + texto); apague `build/audio/` para refazer.

| `provedor` | Chave | Observações |
|---|---|---|
| `edge` | nenhuma | Grátis (Microsoft Edge TTS, endpoint não oficial). Bom para teste e demo; **não use em trabalho comercial**. Quando quebrar (403): `pip install -U edge-tts`. Vozes: `pt-BR-FranciscaNeural`, `pt-BR-AntonioNeural`, `pt-BR-ThalitaMultilingualNeural`. `velocidade: "+6%"` |
| `elevenlabs` | `ELEVENLABS_API_KEY` | `voz` = voice_id; `modelo` (`eleven_multilingual_v2`); tempo por caractere → palavras |
| `fal` | `FAL_KEY` | ElevenLabs v3 pelo fal; `voz` = nome ("Sarah", "Brian") |
| `arquivo` | `DEEPGRAM_API_KEY` | Você gravou (`"arquivo": "midia/voz.m4a"`). Tempos pela Deepgram `nova-3`; o **texto da tela é o do `narracao.txt`** (pareado por alinhamento; palavra sem par ganha tempo interpolado) |

Chaves: variável de ambiente ou linha `NOME=valor` em um `.env` na pasta do projeto ou do repo. Nunca no código, nunca no `projeto.json`. Serviço pago passa pelo livro `gasto.json` com `"teto_usd"` no projeto: estourou o teto, nada é chamado.

**Texto falado ≠ texto escrito.** Escreva como se fala: número por extenso quando a pronúncia importa ("menos catorze LUFS"), sigla que se soletra com ponto ou espaço, nome estrangeiro como se pronuncia. Teste a voz com a frase difícil antes de gastar no roteiro inteiro.

## Respiros e tempo (`ucr tempos`)

`"respiros": { "2": 1.2 }` insere 1,2 s de silêncio **depois da frase de índice 2** (o corte cai no meio do intervalo entre frases, com rampa de 20 ms nas pontas). `"inicio"` é o silêncio antes da 1ª frase e `"cauda"` o que sobra depois da última. A imagem precisa de tempo para entrar: dê respiro onde a cena troca.

A frase termina em `. ? !` (reticências não contam). Frase longa demais vira bloco de legenda longo; parta em duas.

## Trilha

`"mix": { "trilha": "midia/trilha.mp3" | "sintetica" | null }`.

- **Música sua:** precisa de licença comercial para anúncio. `adianta` pula os primeiros segundos; se a música for mais curta que o vídeo ela repete com emenda de 0,35 s; sempre termina com fade de ~0,9 s.
- **`sintetica`:** gerada em numpy (Lá menor, 112 bpm, original, sem licença). Serve de demo.
- **Ducking:** a trilha fica `trilha_db` (−7 dB) abaixo da voz e cai mais `duck_db` (−8 dB) enquanto há fala (ataque 40 ms, soltura 350 ms). **Ducking só funciona se houver silêncio**: em fala contínua, baixe `trilha_db`.
- **Faixa útil medida:** trilha 10–14 dB abaixo da voz. Trilha a −16 dB com sidechain 12:1 fica inaudível ("não tem música").
- **Batidas:** o mix acha o andamento e grava `build/batidas.js`; `M.batida(t)` puxa cortes e impactos para a batida (o mix imprime quantos golpes caíram a ±50 ms).

## Efeitos

Sintetizados (originais, sem licença): `whoosh`, `impacto`, `clique`, `brilho`, `subida`, `obturador`, `pop`, `tecla`, `grave`, `papel`. Ponha arquivos em `midia/sfx/<tipo>/` e eles têm prioridade (um tipo novo pode existir só como pasta; o mesmo `t` pega sempre o mesmo arquivo). Use só som com licença comercial.

O nível dos efeitos é 9 dB abaixo da voz (`efeitos_db`). Efeito demais cansa: um por gesto, não um por palavra (o terminal e os chips do demo usam ganho baixo de propósito).

## Vídeo inserido com som

`M.video(..., { som: true, ganho: .55 })`: o áudio do arquivo entra no mix no instante em que o clipe começa, com rampa de 50 ms. A voz **não** abaixa sozinha sob o clipe: deixe a narração calar (ou use `ganho` baixo).

## Master

Duas passadas de `loudnorm` (medir e aplicar com `linear=true`), **uma vez só no master**, nunca por bloco: normalizar bloco a bloco levanta o ruído dos blocos fracos e o fundo pulsa a cada corte. Alvo: −14 LUFS e −1,5 dBTP (Reels, TikTok e Shorts; YouTube aceita −14 também). Mude em `"mix": { "lufs": -16, "pico": -1.5 }`.

O mix aborta se sair mudo (`measured_I = -inf`): confira a narração e o `projeto.json`.

## Voz gravada (não sintética): tratamento

Se você mesmo grava (`provedor: arquivo`), trate antes: **rede neural, não filtro empilhado.** `DeepFilterNet` (binário standalone) tirou ruído de vento com 5% de perda de fala; um gate (`agate`) deu SNR de 37 dB e **apagou 36% da fala** ("a voz dela some"). `loudnorm` e `acompressor` com makeup devolvem o ruído que o denoise tirou. Ordem que funcionou: denoise → `highpass=f=100` → EQ leve → `deesser` → ganho fixo; loudness só no master. Emenda de bloco estala sem `afade` de ~25 ms.
