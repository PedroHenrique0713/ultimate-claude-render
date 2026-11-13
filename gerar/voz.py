"""Narração com tempo por palavra. Uma saída só, qualquer provedor:

    build/audio/narracao.mp3     o áudio
    build/audio/frases.json      [{texto, a, b, palavras: [{t, a, b}]}]  (tempos em segundos, no áudio cru)

Provedores (projeto.json → "voz": {"provedor": ...}):
    edge         grátis, sem chave (Microsoft Edge TTS). Bom para testar e para demo; para trabalho comercial use outro.
    elevenlabs   ElevenLabs direto. Chave em ELEVENLABS_API_KEY. voz = voice_id.
    fal          ElevenLabs v3 pelo fal. Chave em FAL_KEY. voz = nome ("Sarah", "Brian"...).
    arquivo      você mesmo gravou: "arquivo": "midia/voz.m4a". Os tempos vêm da Deepgram (nova-3) e o texto da tela é o do narracao.txt.
                 Chave em DEEPGRAM_API_KEY.

Uso: python3 voz.py <pasta-do-projeto>
"""
import asyncio, base64, difflib, json, os, re, sys, unicodedata, urllib.request, urllib.error
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import projeto, build, chave, duracao
from gasto import Livro


def frases_de(palavras):
    """Lista de palavras {t,a,b} → frases (quebra em . ? ! que não seja reticências)."""
    frases, cur = [], []
    for w in palavras:
        cur.append(w)
        if re.search(r'[.?!]["”)]*$', w['t']) and not re.search(r'(\.\.\.|…)$', w['t']):
            frases.append(cur); cur = []
    if cur: frases.append(cur)
    return [{'texto': ' '.join(x['t'] for x in f), 'a': round(f[0]['a'], 3), 'b': round(f[-1]['b'], 3),
             'palavras': [{'t': x['t'], 'a': round(x['a'], 3), 'b': round(x['b'], 3)} for x in f]} for f in frases]


def palavras_de_caracteres(chars, ini, fim):
    """Tempos por caractere (ElevenLabs) → palavras."""
    palavras, atual = [], None
    for c, a, b in zip(chars, ini, fim):
        if c.isspace():
            if atual: palavras.append(atual); atual = None
            continue
        if not atual: atual = {'t': '', 'a': a, 'b': b}
        atual['t'] += c; atual['b'] = b
    if atual: palavras.append(atual)
    return palavras


def _norm(s):
    return re.sub(r'[^\w]+', '', unicodedata.normalize('NFD', s).encode('ascii', 'ignore').decode().lower())


def alinhar_ao_roteiro(roteiro, ouvidas):
    """O texto que vale é o do roteiro (acentos, nomes, pontuação); os tempos são os da transcrição.
    Palavra do roteiro sem par na transcrição ganha tempo interpolado."""
    rs = roteiro.split()
    a = [_norm(x) for x in rs]; b = [_norm(x['t']) for x in ouvidas]
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    out = [None] * len(rs)
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == 'equal':
            for k in range(i2 - i1): out[i1 + k] = {'t': rs[i1 + k], 'a': ouvidas[j1 + k]['a'], 'b': ouvidas[j1 + k]['b']}
        elif tag == 'replace' and (i2 - i1) == (j2 - j1):
            for k in range(i2 - i1): out[i1 + k] = {'t': rs[i1 + k], 'a': ouvidas[j1 + k]['a'], 'b': ouvidas[j1 + k]['b']}
    # interpola o que ficou sem par
    i = 0
    while i < len(out):
        if out[i] is None:
            j = i
            while j < len(out) and out[j] is None: j += 1
            ini = out[i - 1]['b'] if i > 0 else (ouvidas[0]['a'] if ouvidas else 0)
            fim = out[j]['a'] if j < len(out) else (ouvidas[-1]['b'] if ouvidas else ini + .3 * (j - i))
            passo = (fim - ini) / (j - i)
            for k in range(i, j): out[k] = {'t': rs[k], 'a': ini + (k - i) * passo, 'b': ini + (k - i + 1) * passo}
            i = j
        else: i += 1
    return out


# ── provedores ──
def edge(texto, cfg, destino):
    import edge_tts
    voz = cfg.get('voz', 'pt-BR-FranciscaNeural')

    async def rodar():
        com = edge_tts.Communicate(texto, voz, rate=cfg.get('velocidade', '+0%'), pitch=cfg.get('tom', '+0Hz'), boundary='WordBoundary')
        audio, palavras = bytearray(), []
        async for ev in com.stream():
            if ev['type'] == 'audio': audio.extend(ev['data'])
            elif ev['type'] == 'WordBoundary':
                a = ev['offset'] / 1e7; palavras.append({'t': ev['text'], 'a': a, 'b': a + ev['duration'] / 1e7})
        return bytes(audio), palavras
    audio, ouvidas = asyncio.run(rodar())
    open(destino, 'wb').write(audio)
    # o edge devolve a palavra sem a pontuação: o roteiro devolve a pontuação (e os acentos) à tela
    return alinhar_ao_roteiro(texto, ouvidas)


def _http_json(url, corpo, cab, timeout=300):
    req = urllib.request.Request(url, data=json.dumps(corpo).encode(), headers={'Content-Type': 'application/json', **cab}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r: return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        sys.exit(f'{url.split("/")[2]} respondeu {e.code}: {e.read().decode()[:600]}')


def _pago(livro, preco, servico, chamar):
    """Debita antes de chamar (estourou o teto, nada é chamado) e estorna se a chamada falhar."""
    livro.debitar(preco, servico, 'narracao')
    try:
        return chamar()
    except BaseException:
        livro.estornar(servico, 'narracao')
        raise


def elevenlabs(texto, cfg, destino, livro):
    k = chave('ELEVENLABS_API_KEY')
    voice = cfg.get('voz') or sys.exit('voz.voz: informe o voice_id da ElevenLabs')
    corpo = {'text': texto, 'model_id': cfg.get('modelo', 'eleven_multilingual_v2'), 'voice_settings': {'stability': cfg.get('estabilidade', .5)}}
    if cfg.get('idioma'): corpo['language_code'] = cfg['idioma']   # só os modelos Turbo/Flash aceitam; os outros devolvem erro
    r = _pago(livro, round(len(texto) / 1000 * cfg.get('preco_mil_caracteres', 0.20), 4), 'elevenlabs', lambda: _http_json(
        f'https://api.elevenlabs.io/v1/text-to-speech/{voice}/with-timestamps?output_format=mp3_44100_128', corpo, {'xi-api-key': k}))
    open(destino, 'wb').write(base64.b64decode(r['audio_base64']))
    al = r.get('alignment') or r['normalized_alignment']   # alignment = o texto como foi escrito (o normalized troca número por extenso)
    return palavras_de_caracteres(al['characters'], al['character_start_times_seconds'], al['character_end_times_seconds'])


def fal(texto, cfg, destino, livro):
    k = chave('FAL_KEY')
    r = _pago(livro, round(len(texto) / 1000 * cfg.get('preco_mil_caracteres', 0.10), 4), 'fal/elevenlabs-v3', lambda: _http_json(
        'https://fal.run/fal-ai/elevenlabs/tts/eleven-v3',
        {'text': texto, 'voice': cfg.get('voz', 'Sarah'), 'language_code': cfg.get('idioma', 'pt'), 'stability': cfg.get('estabilidade', .5), 'timestamps': True},
        {'Authorization': f'Key {k}'}))
    urllib.request.urlretrieve(r['audio']['url'], destino)
    chars, ini, fim = [], [], []
    for bl in r['timestamps']:
        chars += bl['characters']; ini += bl['character_start_times_seconds']; fim += bl['character_end_times_seconds']
    return palavras_de_caracteres(chars, ini, fim)


def arquivo(texto, cfg, destino, pasta):
    import subprocess
    origem = os.path.join(pasta, cfg['arquivo'])
    k = chave('DEEPGRAM_API_KEY')
    subprocess.check_call(['ffmpeg', '-v', 'error', '-y', '-i', origem, '-codec:a', 'libmp3lame', '-b:a', '192k', destino])
    req = urllib.request.Request(f'https://api.deepgram.com/v1/listen?model=nova-3&language={cfg.get("idioma", "pt-BR")}&punctuate=true&smart_format=true',
                                 data=open(destino, 'rb').read(), headers={'Authorization': f'Token {k}', 'Content-Type': 'audio/mpeg'}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=600) as r: d = json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        sys.exit(f'Deepgram respondeu {e.code}: {e.read().decode()[:400]}')
    ws = d['results']['channels'][0]['alternatives'][0]['words']
    ouvidas = [{'t': w.get('punctuated_word', w['word']), 'a': w['start'], 'b': w['end']} for w in ws]
    return alinhar_ao_roteiro(texto, ouvidas) if texto.strip() else ouvidas


def main(pasta):
    cfg, pasta = projeto(pasta)
    v = cfg.get('voz')
    if not v:
        sys.exit('projeto.json não tem "voz": o vídeo seria mudo (ok se for só trilha e efeitos: pule este passo).')
    texto_arq = os.path.join(pasta, v.get('texto', 'narracao.txt'))
    texto = re.sub(r'\s+', ' ', open(texto_arq, encoding='utf-8').read()).strip() if os.path.exists(texto_arq) else ''
    if not texto and v['provedor'] != 'arquivo': sys.exit(f'{texto_arq} não existe ou está vazio')
    mp3 = build(pasta, 'audio', 'narracao.mp3')
    saida = build(pasta, 'audio', 'frases.json')
    marca = build(pasta, 'audio', 'narracao.sha')
    import hashlib
    assinatura = hashlib.sha1((json.dumps(v, sort_keys=True) + texto).encode()).hexdigest()
    if os.path.exists(mp3) and os.path.exists(saida) and os.path.exists(marca) and open(marca).read() == assinatura:
        print('narração em cache (texto e voz iguais); apague build/audio para refazer'); return
    livro = Livro(os.path.join(pasta, 'gasto.json'), teto=cfg.get('teto_usd'))
    p = v['provedor']
    if p == 'edge': palavras = edge(texto, v, mp3)
    elif p == 'elevenlabs': palavras = elevenlabs(texto, v, mp3, livro)
    elif p == 'fal': palavras = fal(texto, v, mp3, livro)
    elif p == 'arquivo': palavras = arquivo(texto, v, mp3, pasta)
    else: sys.exit(f'provedor de voz desconhecido: {p} (edge, elevenlabs, fal, arquivo)')
    frases = frases_de(palavras)
    json.dump(frases, open(saida, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    open(marca, 'w').write(assinatura)
    for i, f in enumerate(frases): print(f'{i:2d} {f["a"]:6.2f}-{f["b"]:6.2f} {f["texto"]}')
    print(f'narração: {duracao(mp3):.1f} s, {len(frases)} frases → {os.path.relpath(mp3, pasta)}')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
