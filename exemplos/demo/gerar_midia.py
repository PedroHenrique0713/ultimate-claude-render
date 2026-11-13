"""Gera a mídia de exemplo do demo (tudo original, sem direitos de ninguém):
   midia/paisagem.jpg  uma "foto" procedural (crepúsculo com serras em camadas)
   midia/clipe.mp4     um clipe de 4 s com som (gradiente animado + arpejo), para mostrar vídeo inserido com áudio
Uso: python3 gerar_midia.py"""
import os, subprocess, sys, wave
import numpy as np
from PIL import Image, ImageFilter

AQUI = os.path.dirname(os.path.abspath(__file__))
rng = np.random.default_rng(11)


def serra(w, rugosidade, base, amp):
    n = 1 << int(np.ceil(np.log2(w)))
    y = np.zeros(n + 1); y[0] = rng.uniform(-1, 1); y[-1] = rng.uniform(-1, 1)
    passo, a = n, amp
    while passo > 1:
        meio = passo // 2
        for i in range(meio, n, passo): y[i] = (y[i - meio] + y[i + meio]) / 2 + rng.uniform(-a, a)
        passo, a = meio, a * rugosidade
    y = y[:w]
    return base + (y - y.min()) / (y.max() - y.min() + 1e-9) * amp * 3


def paisagem():
    W, H = 3000, 2000
    img = np.zeros((H, W, 3), dtype=np.float32)
    yy = np.linspace(0, 1, H)
    ceu_topo, ceu_meio, ceu_base = np.array([14, 22, 52]), np.array([188, 78, 116]), np.array([255, 170, 96])
    t = np.clip(yy / .62, 0, 1)[:, None]
    ceu = np.where(t < .55, ceu_topo + (ceu_meio - ceu_topo) * (t / .55), ceu_meio + (ceu_base - ceu_meio) * ((t - .55) / .45))   # (H, 3)
    img[:] = ceu[:, None, :]
    # sol e brilho
    cx, cy = W * .62, H * .52
    Y, X = np.mgrid[0:H, 0:W]
    d = np.sqrt((X - cx) ** 2 + (Y - cy) ** 2)
    img += (np.exp(-(d / 260) ** 2)[..., None] * np.array([255, 226, 170]) * 1.1) + (np.exp(-(d / 900))[..., None] * np.array([255, 140, 80]) * .22)
    # estrelas no alto
    for _ in range(420):
        x, y = rng.integers(0, W), rng.integers(0, int(H * .38))
        img[y:y + 2, x:x + 2] += rng.uniform(60, 200) * (1 - y / (H * .38))
    # serras em camadas, de longe (azul claro, névoa) para perto (quase preto)
    cores = [(120, 96, 150), (88, 70, 120), (58, 48, 92), (36, 30, 62), (18, 16, 36)]
    for k, cor in enumerate(cores):
        topo = serra(W, .55 + .04 * k, H * (.52 + .08 * k), 70 + 40 * k)
        for x in range(W):
            y0 = int(topo[x])
            if y0 < H:
                fundo = np.array(cor, dtype=np.float32)
                nev = np.linspace(1, 0, H - y0)[:, None] * (.35 if k < 3 else .12)
                img[y0:, x] = img[y0:, x] * 0 + fundo * (1 - nev) + np.array([255, 170, 140]) * nev * .5
    im = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
    a = np.asarray(im).astype(np.float32)
    a += rng.normal(0, 3.2, a.shape)                                  # grão
    v = 1 - .35 * (((X - W / 2) / (W / 2)) ** 2 + ((Y - H / 2) / (H / 2)) ** 2) / 2   # vinheta
    a *= v[..., None]
    Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).save(os.path.join(AQUI, 'midia', 'paisagem.jpg'), quality=90)


def arpejo(arq, dur=4.0):
    sr = 48000; n = int(dur * sr); t = np.arange(n) / sr; x = np.zeros(n)
    for t0, f in [(.0, 440), (.5, 554.37), (1.0, 659.25), (1.5, 880), (2.2, 659.25), (2.7, 880), (3.1, 1108.7)]:
        i = int(t0 * sr); m = n - i; u = np.arange(m) / sr
        x[i:] += (np.sin(2 * np.pi * f * u) + .4 * np.sin(4 * np.pi * f * u) * np.exp(-u * 6)) * np.exp(-u * 3.4) * np.minimum(1, u / .004) * .35
    x[-int(.25 * sr):] *= np.linspace(1, 0, int(.25 * sr))
    with wave.open(arq, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes((np.repeat(np.clip(x, -1, 1)[:, None], 2, 1) * 32767).astype(np.int16).tobytes())


def clipe():
    wav = os.path.join(AQUI, 'midia', '_arpejo.wav')
    arpejo(wav)
    saida = os.path.join(AQUI, 'midia', 'clipe.mp4')
    subprocess.check_call(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'gradients=s=900x760:c0=0xC6FF3D:c1=0x06080B:c2=0x3FD0C9:c3=0x0E1217:n=4:speed=0.06:rate=30:duration=4',
                           '-i', wav, '-vf', 'noise=alls=6:allf=t,format=yuv420p', '-c:v', 'libx264', '-crf', '23', '-preset', 'medium', '-c:a', 'aac', '-b:a', '128k', '-shortest', saida])
    os.remove(wav)


if __name__ == '__main__':
    os.makedirs(os.path.join(AQUI, 'midia'), exist_ok=True)
    paisagem(); print('midia/paisagem.jpg')
    clipe(); print('midia/clipe.mp4')
