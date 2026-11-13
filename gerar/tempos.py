"""Monta a narração com respiros entre as frases e grava o mapa de tempos que a cena lê (build/tempos.js).

Respiro = silêncio inserido DEPOIS da frase de índice k; o corte cai no meio do intervalo entre duas frases.
projeto.json: "respiros": {"2": 2.2, "5": 1.2}, "inicio": 1.2 (silêncio antes da 1ª frase), "cauda": 3 (depois da última).
Sem "voz" no projeto: gera só o tempos.js com a duração de "duracao".

Uso: python3 tempos.py <pasta-do-projeto>
"""
import json, os, subprocess, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import projeto, build, SR, ler, gravar_wav, duracao


def main(pasta):
    cfg, pasta = projeto(pasta)
    destino_js = build(pasta, 'tempos.js')
    if not cfg.get('voz'):
        total = float(cfg.get('duracao', 30))
        open(destino_js, 'w', encoding='utf-8').write('// Gerado por gerar/tempos.py\nwindow.TEMPOS = ' + json.dumps({'voz': None, 'total': total, 'frases': []}) + ';\n')
        print('sem narração: total', total); return
    A = os.path.join(pasta, 'build', 'audio')
    frases = json.load(open(os.path.join(A, 'frases.json'), encoding='utf-8'))
    src = os.path.join(A, 'narracao.mp3')
    dur = duracao(src)
    RESPIRO = {int(k): float(v) for k, v in cfg['respiros'].items()}
    INICIO, CAUDA = float(cfg['inicio']), float(cfg['cauda'])
    for k in RESPIRO:
        if k + 1 >= len(frases): sys.exit(f'respiro depois da frase {k}, mas a narração só tem {len(frases)} frases (0 a {len(frases) - 1})')

    cortes = [0.0]
    for k in sorted(RESPIRO):
        cortes.append(round((frases[k]['b'] + frases[k + 1]['a']) / 2, 3))
    cortes.append(dur)
    desloc, acum = [], INICIO   # deslocamento de cada trecho no tempo final
    for i in range(len(cortes) - 1):
        desloc.append(acum)
        if i < len(RESPIRO): acum += RESPIRO[sorted(RESPIRO)[i]]

    def novo(t):
        for i in range(len(cortes) - 1):
            if cortes[i] <= t <= cortes[i + 1] + 1e-6: return round(t + desloc[i], 3)
        return round(t + desloc[-1], 3)

    saida = [{'texto': f['texto'], 'a': novo(f['a']), 'b': novo(f['b']),
              'palavras': [{'t': w['t'], 'a': novo(w['a']), 'b': novo(w['b'])} for w in f['palavras']]} for f in frases]
    total = round(max(novo(dur) + CAUDA, float(cfg.get('duracao_minima', 0))), 3)

    # áudio: decodifica uma vez e cola cada trecho no deslocamento dele, com rampa de 20 ms nas pontas (sem estalo)
    x = ler(src) * 32768
    y = np.zeros((int(total * SR) + 1, 2), dtype=np.float32)
    for i in range(len(cortes) - 1):
        a, b = int(cortes[i] * SR), min(int(cortes[i + 1] * SR), len(x))
        seg = x[a:b].copy(); r = min(int(.02 * SR), len(seg) // 2)
        if r: seg[:r] *= np.linspace(0, 1, r)[:, None]; seg[-r:] *= np.linspace(1, 0, r)[:, None]
        o = int(round((cortes[i] + desloc[i]) * SR)); y[o:o + len(seg)] += seg
    dest = build(pasta, 'audio', 'narracao-montada.wav')
    gravar_wav(dest, y / 32768)
    open(destino_js, 'w', encoding='utf-8').write('// Gerado por gerar/tempos.py: frases da narração no tempo final do vídeo (s).\nwindow.TEMPOS = '
                                                   + json.dumps({'voz': cfg['voz'].get('provedor'), 'total': total, 'frases': saida}, ensure_ascii=False) + ';\n')
    for i, f in enumerate(saida): print(f'{i:2d} {f["a"]:6.2f}-{f["b"]:6.2f} {f["texto"][:60]}')
    print('total', total, '→', os.path.relpath(dest, pasta))


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
