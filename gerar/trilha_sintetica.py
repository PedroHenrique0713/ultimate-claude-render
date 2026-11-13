"""Trilha original sintetizada em numpy: sem arquivo, sem licença, sem chave. Serve para o primeiro vídeo e para demo;
para uso sério, ponha a sua música em midia/trilha.mp3 (e licenciada).

Estrutura: Lá menor (Am–F–C–G), 112 bpm por padrão. Abre só com pad e pulso, entra o grave e o arpejo, o bumbo e o chimbal
chegam no compasso 5, e o final fecha com um acorde longo. Gera exatamente `duracao` segundos.

Uso: python3 trilha_sintetica.py <saida.wav> <duracao-s> [bpm]
"""
import os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import SR, gravar_wav


def nota(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def gerar(duracao, bpm=112, semente=5):
    rng = np.random.default_rng(semente)
    N = int(duracao * SR)
    x = np.zeros((N, 2), dtype=np.float32)
    beat = 60 / bpm
    compasso = 4 * beat
    # progressão: Am F C G  (notas MIDI: fundamental, terça, quinta, oitava)
    acordes = [(57, 60, 64, 69), (53, 57, 60, 65), (48, 52, 55, 60), (55, 59, 62, 67)]
    fundamentais = [45, 41, 36, 43]

    def env_adsr(n, a, d, s, r):
        e = np.full(n, s, dtype=np.float32)
        na = min(int(a * SR), n)
        if na: e[:na] = np.linspace(0, 1, na)
        nd = min(int(d * SR), n - na)
        if nd > 0: e[na:na + nd] = np.linspace(1, s, nd)
        nr = min(int(r * SR), n)
        if nr > 0: e[-nr:] *= np.linspace(1, 0, nr)
        return e

    def som_pad(midis, dur):
        n = int(dur * SR); t = np.arange(n) / SR
        s = np.zeros(n, dtype=np.float32)
        for m in midis:
            for det in (-0.07, 0.0, 0.07):
                f = nota(m) * 2 ** (det / 12)
                s += (np.sin(2 * np.pi * f * t) + .35 * np.sin(2 * np.pi * 2 * f * t) + .12 * np.sin(2 * np.pi * 3 * f * t)).astype(np.float32)
        return s / (len(midis) * 3) * env_adsr(n, .5, .6, .8, .8)

    def som_baixo(m, dur):
        n = int(dur * SR); t = np.arange(n) / SR
        s = np.tanh(1.8 * np.sin(2 * np.pi * nota(m) * t)) * np.exp(-t * 2.4) * np.minimum(1, t / .006)
        return s.astype(np.float32)

    def som_pluck(m, dur=.5):
        n = int(dur * SR); t = np.arange(n) / SR
        f = nota(m)
        s = (np.sin(2 * np.pi * f * t) + .5 * np.sin(4 * np.pi * f * t) * np.exp(-t * 12) + .25 * np.sin(6 * np.pi * f * t) * np.exp(-t * 18)) * np.exp(-t * 7) * np.minimum(1, t / .003)
        return s.astype(np.float32)

    def som_bumbo():
        n = int(.45 * SR); t = np.arange(n) / SR
        f = 48 + 120 * np.exp(-t * 28)
        return (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9)).astype(np.float32)

    def som_chimbal(aberto=False):
        n = int((.25 if aberto else .06) * SR); t = np.arange(n) / SR
        r = rng.standard_normal(n).astype(np.float32)
        r = np.diff(r, prepend=0)   # passa-alta simples: som de metal
        return (r * np.exp(-t * (14 if aberto else 70)) * .5).astype(np.float32)

    def colocar(sinal, t0, ganho=1.0, pan=0.0):
        i = int(t0 * SR)
        if i >= N: return
        j = min(i + len(sinal), N)
        x[i:j, 0] += sinal[:j - i] * ganho * (1 - max(pan, 0))
        x[i:j, 1] += sinal[:j - i] * ganho * (1 + min(pan, 0))

    total_comp = int(np.ceil(duracao / compasso))
    for c in range(total_comp):
        t0 = c * compasso
        k = c % 4
        ultimo = c == total_comp - 1
        # pad no compasso inteiro (o último acorde dura até o fim, com cauda)
        dur_pad = (duracao - t0) if ultimo else compasso * 1.05
        colocar(som_pad(acordes[k], max(dur_pad, .5)), t0, .55 if c < 4 else .62)
        if c >= 1 and not ultimo:   # grave: colcheias no compasso 2 em diante
            for b in range(4):
                colocar(som_baixo(fundamentais[k], beat * .95), t0 + b * beat, .5 if b % 2 == 0 else .38)
        if c >= 2 and not ultimo:   # arpejo em colcheias
            seq = [acordes[k][0] + 12, acordes[k][2] + 12, acordes[k][1] + 12, acordes[k][3] + 12, acordes[k][1] + 12, acordes[k][2] + 12, acordes[k][0] + 12, acordes[k][1] + 12]
            for i8, m in enumerate(seq):
                colocar(som_pluck(m), t0 + i8 * beat / 2, .26 if i8 % 2 == 0 else .18, pan=(-.4 if i8 % 2 == 0 else .4))
        if c >= 4 and not ultimo:   # bumbo na semínima e chimbal na contratempo
            for b in range(4):
                colocar(som_bumbo(), t0 + b * beat, .75)
                colocar(som_chimbal(), t0 + b * beat + beat / 2, .35, pan=.25)
            colocar(som_chimbal(True), t0 + 3.5 * beat, .3, pan=-.25)
        if ultimo:   # batida final no 1 e grave longo
            colocar(som_bumbo(), t0, .85)
            colocar(som_baixo(fundamentais[k], min(compasso * 2, duracao - t0)), t0, .6)
    # sopro de subida no compasso que antecede o compasso 5 (a virada)
    if total_comp > 5:
        n = int(compasso * SR); t = np.arange(n) / SR
        r = rng.standard_normal(n).astype(np.float32)
        alfa = 1 - np.exp(-2 * np.pi * (300 + 6000 * (t / compasso) ** 2) / SR)
        y = np.empty_like(r); v = 0.0
        for i in range(n): v += alfa[i] * (r[i] - v); y[i] = v
        colocar(y * (t / compasso) ** 2 * .5, 3 * compasso, .5)
    # fade de saída e normalização de pico
    fo = int(min(1.2, duracao / 4) * SR)
    x[-fo:] *= np.linspace(1, 0, fo)[:, None] ** 1.4
    x *= .6 / (np.abs(x).max() + 1e-9)
    return x


if __name__ == '__main__':
    saida, dur = sys.argv[1], float(sys.argv[2])
    bpm = float(sys.argv[3]) if len(sys.argv) > 3 else 112
    gravar_wav(saida, gerar(dur, bpm))
    print(f'trilha sintética: {dur:g} s a {bpm:g} bpm → {saida}')
