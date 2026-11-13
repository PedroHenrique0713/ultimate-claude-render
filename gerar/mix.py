"""Mix final: narração (com respiros) + trilha (ducking sob a voz) + efeitos + áudio dos vídeos inseridos.
Efeitos são sintetizados aqui (originais, sem licença); pasta midia/sfx/<tipo>/ com arquivos tem prioridade (um tipo novo pode existir só como pasta).
Master em −14 LUFS e −1,5 dBTP por padrão (Reels, TikTok, Shorts).

Entradas:   build/audio/narracao-montada.wav (tempos.py)   build/sons.json (ucr sons)   trilha: ver projeto.json "mix"
Saídas:     build/audio/mix-final.wav    build/batidas.js (batidas da trilha: M.batida(t) puxa cortes para elas)

projeto.json → "mix": { "trilha": "midia/trilha.mp3" | "sintetica" | null, "bpm": 112, "adianta": 0,
                        "lufs": -14, "pico": -1.5, "trilha_db": -7, "duck_db": -8 }

Uso: python3 mix.py <pasta-do-projeto> [--corta SEGUNDOS] [--sem-voz]
"""
import json, os, subprocess, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import projeto, build, SR, ler, gravar_wav
rng = np.random.default_rng(7)


# ── batidas da trilha já montada, no tempo do vídeo ──
def achar_batidas(sinal):
    from scipy.signal import stft
    passo = 512 / SR
    _, _, Z = stft(sinal.mean(1), fs=SR, nperseg=2048, noverlap=2048 - 512)
    mag = np.log1p(np.abs(Z) * 100)
    fluxo = np.maximum(np.diff(mag, axis=1), 0).sum(0)
    fluxo = np.maximum(fluxo - np.convolve(fluxo, np.ones(16) / 16, 'same'), 0)
    ac = np.correlate(fluxo, fluxo, 'full')[len(fluxo) - 1:]
    lo, hi = int(60 / 180 / passo), int(60 / 70 / passo) + 1
    lags = np.arange(lo, hi)
    peso = np.exp(-.5 * np.log2(lags * passo / .5) ** 2)
    m = lags[np.argmax(ac[lo:hi] * peso)]
    y0, y1, y2 = ac[m - 1], ac[m], ac[m + 1]
    periodo = m + .5 * (y0 - y2) / (y0 - 2 * y1 + y2 + 1e-12)
    p = int(round(periodo))
    fase = max(range(p), key=lambda f: fluxo[f::p][:40].sum())
    bs, c, r = [], float(fase), max(1, int(periodo * .12))
    while c < len(fluxo):
        a0, a1 = max(0, int(c) - r), min(len(fluxo), int(c) + r + 1)
        b = a0 + int(np.argmax(fluxo[a0:a1])) if fluxo[a0:a1].max() > 0 else int(c)
        bs.append(round(b * passo, 3)); c = b + periodo
    return round(60 / (periodo * passo), 2), bs


# ── efeitos sintetizados ──
def tempo(d): return np.arange(int(d * SR)) / SR


def passa_baixa(sinal, corte):   # um polo, corte variável no tempo
    out = np.empty_like(sinal); y = 0.0
    a = 1 - np.exp(-2 * np.pi * corte / SR)
    for i in range(len(sinal)):
        y += a[i] * (sinal[i] - y); out[i] = y
    return out


def faixa(sinal, f0, f1):
    from scipy.signal import butter, sosfilt
    return sosfilt(butter(2, [f0, f1], 'bandpass', fs=SR, output='sos'), sinal).astype(np.float32)


def whoosh():
    d = .75; t = tempo(d)
    corte = 300 + 4200 * np.sin(np.pi * np.clip(t / d, 0, 1)) ** 2
    n = rng.standard_normal(len(t)).astype(np.float32)
    s = passa_baixa(n, corte) - passa_baixa(n, corte * .25)
    e = np.where(t < .32, (t / .32) ** 2, np.exp(-(t - .32) * 7))
    s = s * e; pan = np.linspace(-.6, .6, len(t))
    return np.stack([s * (1 - pan), s * (1 + pan)], 1) * .9


def impacto():
    d = 1.2; t = tempo(d)
    f = 45 + 95 * np.exp(-t * 9)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 3.2)
    n = rng.standard_normal(len(t)).astype(np.float32)
    s += passa_baixa(n, np.full(len(t), 1800.0)) * np.exp(-t * 30) * 1.4
    return np.stack([s, s], 1) * .8


def clique():
    d = .07; t = tempo(d)
    s = np.sin(2 * np.pi * 2300 * t) * np.exp(-t * 90) + rng.standard_normal(len(t)) * np.exp(-t * 400) * .4
    return np.stack([s, s], 1) * .35


def brilho():
    d = .9; t = tempo(d)
    s = sum(np.sin(2 * np.pi * f * t + p) / (k + 1) for k, (f, p) in enumerate([(2637, 0), (3520, 1), (4186, 2), (5274, .5)]))
    s *= (1 + .5 * np.sin(2 * np.pi * 18 * t)) * np.where(t < .05, t / .05, np.exp(-(t - .05) * 4.5))
    return np.stack([s * .9, s * 1.1], 1) * .16


def subida():
    d = .65; t = tempo(d)
    f = 180 * (6 ** (t / d))
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * .35
    n = rng.standard_normal(len(t)).astype(np.float32)
    s += passa_baixa(n, 400 + 5000 * (t / d) ** 2) * .9
    s *= (t / d) ** 2.2
    return np.stack([s, s], 1) * .7


def obturador():   # disparo de câmera: a cortina abre e fecha
    s = np.zeros(int(.17 * SR), np.float32)
    for t0, g in ((0, 1), (.08, .65)):
        n = int(.028 * SR); i = int(t0 * SR); u = np.arange(n) / SR
        s[i:i + n] += faixa(rng.standard_normal(n).astype(np.float32), 1800, 9000) * np.exp(-u * 150) * g
        s[i:i + n] += np.sin(2 * np.pi * 180 * u) * np.exp(-u * 90) * .5 * g
    return np.stack([s, s], 1) * .8


def pop():   # bolha que estoura: entrada de selo, pílula, ícone
    d = .11; t = tempo(d)
    f = 950 * np.exp(-t * 14) + 230
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 32) * np.minimum(1, t / .003)
    return np.stack([s, s], 1) * .5


def tecla():   # tecla de digitação, curta e seca
    d = .04; t = tempo(d)
    s = faixa(rng.standard_normal(len(t)).astype(np.float32), 2500, 7000) * np.exp(-t * 220) + np.sin(2 * np.pi * 1400 * t) * np.exp(-t * 300) * .3
    return np.stack([s, s], 1) * .3


def grave():   # descida no sub: revelação, logo, número grande
    d = 1.1; t = tempo(d)
    f = 38 + 80 * np.exp(-t * 4.5)
    s = np.tanh(1.6 * np.sin(2 * np.pi * np.cumsum(f) / SR)) * np.exp(-t * 2.6) * np.minimum(1, t / .01)
    return np.stack([s, s], 1) * .75


def papel():   # folha que passa: carta, cartão e peça entrando no quadro
    d = .38; t = tempo(d)
    n = faixa(rng.standard_normal(len(t)).astype(np.float32), 1200, 6500)
    am = 1 + .6 * np.sign(np.sin(2 * np.pi * 37 * t + rng.uniform(0, 6)))
    s = n * am * np.sin(np.pi * np.clip(t / d, 0, 1)) ** 1.5
    pan = np.linspace(.5, -.5, len(t))
    return np.stack([s * (1 - pan), s * (1 + pan)], 1) * .45


GERAR = {'whoosh': whoosh, 'impacto': impacto, 'clique': clique, 'brilho': brilho, 'subida': subida,
         'obturador': obturador, 'pop': pop, 'tecla': tecla, 'grave': grave, 'papel': papel}
GOLPES = ('impacto', 'whoosh', 'grave')


def main(pasta, corta=None, sem_voz=False):
    cfg, pasta = projeto(pasta)
    mx = cfg['mix']
    A = os.path.join(pasta, 'build', 'audio')
    SFX = os.path.join(pasta, 'midia', 'sfx')
    arq_voz = os.path.join(A, 'narracao-montada.wav')
    tem_voz = os.path.exists(arq_voz) and bool(cfg.get('voz'))
    sons_arq = os.path.join(pasta, 'build', 'sons.json')
    dados = json.load(open(sons_arq, encoding='utf-8')) if os.path.exists(sons_arq) else {'sons': [], 'clipes': []}

    if tem_voz:
        voz = ler(arq_voz)
        if corta: voz = voz[:int(corta * SR)]
        N = len(voz)
    else:
        total = float(corta or cfg.get('duracao') or sys.exit('sem narração: informe "duracao" no projeto.json'))
        N = int(total * SR); voz = np.zeros((N, 2), dtype=np.float32)
    dur = N / SR

    # trilha: arquivo, "sintetica" ou nenhuma
    t_cfg = mx.get('trilha', 'sintetica')
    trilha = np.zeros_like(voz)
    if t_cfg:
        if t_cfg == 'sintetica':
            from trilha_sintetica import gerar
            trilha = gerar(dur + .5, mx.get('bpm', 112))[:N]
        else:
            mus = ler(os.path.join(pasta, t_cfg))[int(mx.get('adianta', 0) * SR):]
            if len(mus) < N:   # trilha curta: repete com emenda de 0,35 s
                xf = int(.35 * SR); rampa = np.linspace(0, 1, xf)[:, None]; base = mus
                while len(base) < N:
                    base = np.concatenate([base[:-xf], base[-xf:] * (1 - rampa) + mus[:xf] * rampa, mus[xf:]])
                mus = base
            trilha = mus[:N].copy()
        fo = int(min(.9, dur / 4) * SR); trilha[N - fo:] *= np.linspace(1, 0, fo)[:, None] ** 1.5

    # batidas
    BATIDAS = []
    if trilha.any():
        BPM, BATIDAS = achar_batidas(trilha)
        open(build(pasta, 'batidas.js'), 'w', encoding='utf-8').write('// Gerado por gerar/mix.py: batidas da trilha no tempo do vídeo (s).\nwindow.BATIDAS = ' + json.dumps({'bpm': BPM, 't': BATIDAS}) + ';\n')
        print(f'trilha a {BPM} bpm, {len(BATIDAS)} batidas → build/batidas.js')
    else:
        open(build(pasta, 'batidas.js'), 'w', encoding='utf-8').write('window.BATIDAS = { bpm: 0, t: [] };\n')
    if os.environ.get('SO_BATIDAS'): return

    # ducking: envelope da voz → a trilha cai enquanto há fala
    voz_rms = 0.1
    if trilha.any():
        if voz.any():
            mono = np.abs(voz).mean(1); hop = int(.01 * SR)
            rms = np.sqrt(np.convolve(mono ** 2, np.ones(int(.04 * SR)) / int(.04 * SR), 'same'))[::hop]
            alvo = (rms > 0.02).astype(np.float32)
            env = np.zeros_like(alvo); v = 0
            for i, t in enumerate(alvo):
                k = .25 if t > v else .028   # passos de 10 ms: ataque 40 ms, soltura 350 ms
                v += (t - v) * k; env[i] = v
            env = np.interp(np.arange(N) / hop, np.arange(len(env)), env)
            fala = voz[np.abs(voz).mean(1) > .02]
            voz_rms = np.sqrt(np.mean(fala ** 2)) if len(fala) else .1
        else:
            env = np.zeros(N)
        a, b = int(min(20, dur * .2) * SR), int(min(70, dur * .9) * SR)
        mus_rms = np.sqrt(np.mean(trilha[a:b] ** 2)) + 1e-9
        base = voz_rms / mus_rms * 10 ** (mx.get('trilha_db', -7) / 20)   # sem fala: trilha 7 dB abaixo da voz
        ganho = base * 10 ** (mx.get('duck_db', -8) * env / 20)             # com fala: mais 8 dB abaixo
        if sem_voz or not voz.any(): ganho = np.full(N, base)
        trilha = trilha * ganho[:, None]

    # efeitos
    def amostra(tipo, t):
        pasta_t = os.path.join(SFX, tipo)
        arqs = sorted(f for f in os.listdir(pasta_t) if f.lower().endswith(('.wav', '.mp3', '.ogg', '.flac', '.m4a'))) if os.path.isdir(pasta_t) else []
        if not arqs: return None
        x = ler(os.path.join(pasta_t, arqs[int(round(t * 1000)) % len(arqs)]))   # o mesmo t pega sempre o mesmo arquivo
        return x * (.5 / (np.abs(x).max() + 1e-9))
    sons = [s for s in dados['sons'] if not corta or s['t'] < corta - .3]
    falta = sorted({s['tipo'] for s in sons if s['tipo'] not in GERAR and not os.path.isdir(os.path.join(SFX, s['tipo']))})
    if falta: sys.exit(f'efeito sem síntese e sem pasta em midia/sfx/: {", ".join(falta)}')
    if BATIDAS and sons:
        golpes = [s for s in sons if s['tipo'] in GOLPES]
        na = sum(min(abs(b - s['t']) for b in BATIDAS) <= .05 for s in golpes)
        print(f'efeitos de golpe na batida (±50 ms): {na} de {len(golpes)}')
    efeitos = np.zeros_like(voz)
    for s in sons:
        e = amostra(s['tipo'], s['t'])
        e = (GERAR[s['tipo']]() if e is None else e) * s.get('ganho', 1)
        if s['tipo'] == 'subida': i = int((s['t'] + .55) * SR) - len(e)   # termina no instante marcado
        else: i = int(s['t'] * SR) - int(.06 * SR if s['tipo'] == 'whoosh' else 0)
        i = max(i, 0); j = min(i + len(e), N)
        efeitos[i:j] += e[:j - i]
    if efeitos.any():
        efeitos *= voz_rms / (np.sqrt(np.mean(efeitos[np.abs(efeitos).mean(1) > 1e-3] ** 2)) + 1e-9) * 10 ** (mx.get('efeitos_db', -9) / 20)

    # clipes: o áudio dos vídeos inseridos, no instante em que cada um entra
    clipes = np.zeros_like(voz)
    for c in dados['clipes']:
        arq = os.path.join(pasta, c['audio'])
        if not os.path.exists(arq): continue
        x = ler(arq)[int(c.get('inicio', 0) * SR):][:int(c['dur'] * SR)]
        fi = int(.05 * SR)
        if len(x) > 2 * fi: x[:fi] *= np.linspace(0, 1, fi)[:, None]; x[-fi:] *= np.linspace(1, 0, fi)[:, None]
        i = int(c['t'] * SR)
        if i >= N: continue
        j = min(i + len(x), N)
        clipes[i:j] += x[:j - i] * c.get('ganho', 1)
        # a voz cala sob o clipe com som? Não: quem decide é a cena (clipe com som costuma entrar onde a narração para)

    mix = (0 if sem_voz else voz) + trilha + efeitos + clipes
    suf = ('-corta' if corta else '') + ('-sem-voz' if sem_voz else '')
    pre = build(pasta, 'audio', f'mix-pre{suf}.wav')
    gravar_wav(pre, mix / max(1.0, np.abs(mix).max() / .95))

    # loudness em duas passadas
    lufs, pico = mx.get('lufs', -14), mx.get('pico', -1.5)
    med = subprocess.run(['ffmpeg', '-hide_banner', '-i', pre, '-af', f'loudnorm=I={lufs}:TP={pico}:LRA=11:print_format=json', '-f', 'null', '-'], capture_output=True, text=True).stderr
    j = json.loads(med[med.rindex('{'):med.rindex('}') + 1])
    if j['input_i'] in ('-inf', '-Infinity'): sys.exit('o mix saiu mudo (nenhuma voz, trilha ou efeito): confira a narração e o projeto.json')
    final = build(pasta, 'audio', f'mix-final{suf}.wav')
    subprocess.check_call(['ffmpeg', '-v', 'error', '-y', '-i', pre, '-af',
        f"loudnorm=I={lufs}:TP={pico}:LRA=11:measured_I={j['input_i']}:measured_TP={j['input_tp']}:measured_LRA={j['input_lra']}:measured_thresh={j['input_thresh']}:offset={j['target_offset']}:linear=true,aresample=48000",
        '-ar', '48000', final])
    print(f'mix: {len(sons)} efeitos, {len(dados["clipes"])} clipe(s) com som, {dur:.2f} s → {os.path.relpath(final, pasta)}')


if __name__ == '__main__':
    a = sys.argv[1:]
    corta = float(a[a.index('--corta') + 1]) if '--corta' in a else None
    main(a[0] if a and not a[0].startswith('--') else '.', corta, '--sem-voz' in a)
