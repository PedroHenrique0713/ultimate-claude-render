# Conferência automática de um MP4 de entrega: formato e cor, quadro parado, trecho preto, loudness e textos fora da faixa segura.
# Uso: python3 gerar/qa.py <video.mp4> [--zonas zonas.json] [--parado 1.5] [--lufs -14] [--esperado 1080x1920]
# Não reprova nada sozinha: lista o que pede olho. "Parado" = composição sem mudar por mais de ~1,5 s (o espectador pula).
import argparse, json, os, re, subprocess, sys
for _f in (sys.stdout, sys.stderr):   # Windows: console em cp1252
    try: _f.reconfigure(encoding='utf-8', errors='replace')
    except Exception: pass

ap = argparse.ArgumentParser()
ap.add_argument('video')
ap.add_argument('--zonas')
ap.add_argument('--parado', type=float, default=1.5)
ap.add_argument('--mudanca', type=float, default=3.0)
ap.add_argument('--lufs', type=float, default=-14.0)
ap.add_argument('--esperado', help='WxH esperado da entrega, ex.: 1080x1920')
a = ap.parse_args()
linhas, avisos = [], 0


def ok(txt): linhas.append('  ok   ' + txt)


def aviso(txt):
    global avisos
    avisos += 1; linhas.append('  [!]  ' + txt)


def ffmpeg_stderr(*args):
    return subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', a.video, *args, '-f', 'null', '-'], capture_output=True, text=True).stderr


j = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', a.video]))
v = next(s for s in j['streams'] if s['codec_type'] == 'video')
au = next((s for s in j['streams'] if s['codec_type'] == 'audio'), None)
num, den = map(int, v['r_frame_rate'].split('/'))
dur = float(j['format']['duration'])
if a.esperado and a.esperado != f"{v['width']}x{v['height']}": aviso(f"tamanho {v['width']}x{v['height']}, esperado {a.esperado}")
ok(f"{v['width']}x{v['height']}, {num / den:g} fps, {dur:.2f} s, {int(j['format']['bit_rate']) / 1e6:.1f} Mb/s, {os.path.getsize(a.video) / 1e6:.1f} MB")

# cor: entrega é yuv420p, faixa limitada, BT.709 marcado nas três propriedades
cor = {k: v.get(k, '?') for k in ('pix_fmt', 'color_range', 'color_space', 'color_primaries', 'color_transfer')}
esperado = {'pix_fmt': 'yuv420p', 'color_range': 'tv', 'color_space': 'bt709', 'color_primaries': 'bt709', 'color_transfer': 'bt709'}
erradas = {k: cor[k] for k in esperado if cor[k] != esperado[k]}
if erradas: aviso('cor fora do padrão de entrega (yuv420p, tv, bt709): ' + ', '.join(f'{k}={x}' for k, x in erradas.items()))
else: ok('cor: yuv420p, faixa limitada, BT.709 marcado')

if not au: aviso('sem faixa de áudio')
else:
    da = float(au.get('duration', dur))
    if abs(da - dur) > .1: aviso(f'áudio com {da:.2f} s e vídeo com {dur:.2f} s')
    if au.get('sample_rate') != '48000': aviso(f"áudio a {au.get('sample_rate')} Hz (esperado 48000)")

# composição parada: quanto o quadro muda em 1,5 s, em 135x240 cinza por média de área (o grão some; a deriva lenta da câmera não conta).
# Abaixo de 3 níveis a composição não mudou. Calibrado em vídeos reais: um reprovado como "parado" ficou 34% do
# tempo abaixo de 3; um aprovado, 0%; um "pausado demais", 6%.
import numpy as np
FPSQ, k = 10, int(round(a.parado * 10))
raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', a.video, '-vf', f'fps={FPSQ},scale=135:240:flags=area,format=gray', '-f', 'rawvideo', '-'])
q = np.frombuffer(raw, np.uint8).reshape(-1, 240, 135).astype(np.float32)
d = np.abs(q[k:] - q[:-k]).mean((1, 2)) if len(q) > k else np.array([99.0])
paradas, ini = [], None
for i, x in enumerate(np.append(d, 99)):
    if x < a.mudanca and ini is None: ini = i
    elif x >= a.mudanca and ini is not None:
        s, e = ini / FPSQ, (i - 1 + k) / FPSQ; ini = None
        if paradas and s <= paradas[-1][1]: paradas[-1] = (paradas[-1][0], max(e, paradas[-1][1]))   # junta janelas que se sobrepõem
        else: paradas.append((s, e))
if paradas:
    aviso(f'{len(paradas)} trecho(s) com a composição parada por {a.parado:g} s ou mais ({(d < a.mudanca).mean():.0%} do vídeo): '
          + ', '.join(f'{s:.1f}–{e:.1f} s' for s, e in paradas))
else: ok(f'a composição muda a cada {a.parado:g} s em todo o vídeo')

err = ffmpeg_stderr('-an', '-vf', 'blackdetect=d=0.1:pix_th=0.10')
pretos = re.findall(r'black_start:([\d.]+) black_end:([\d.]+)', err)
if pretos: aviso('trecho preto: ' + ', '.join(f'{float(s):.2f}–{float(e):.2f} s' for s, e in pretos))
else: ok('nenhum trecho preto')

if au:
    err = ffmpeg_stderr('-vn', '-af', 'ebur128=peak=true')
    resumo = err[err.rfind('Summary:'):]
    I = float(re.search(r'I:\s+(-?[\d.]+) LUFS', resumo).group(1))
    tp = re.search(r'True peak:\s+Peak:\s+(-?[\d.]+|-inf) dBFS', resumo)
    TP = float(tp.group(1)) if tp else float('nan')
    txt = f'loudness {I:.1f} LUFS (alvo {a.lufs:g}), pico verdadeiro {TP:.1f} dBTP'
    (aviso if abs(I - a.lufs) > 1 or TP > -1.0 else ok)(txt)

if a.zonas and os.path.exists(a.zonas):
    z = json.load(open(a.zonas))
    grupos = []
    for x in z['achados']:   # junta o mesmo texto em instantes seguidos
        g = next((g for g in grupos if g['texto'] == x['texto'] and x['t'] - g['ate'] <= z['passo'] * 1.5), None)
        if g: g['ate'] = x['t']
        else: grupos.append({'texto': x['texto'], 'zona': x['zona'], 'de': x['t'], 'ate': x['t']})
    if grupos:
        aviso(f"{len(grupos)} texto(s) fora da zona segura da plataforma (topo {z['topo']:.0%}, base {z['base']:.0%}):")
        for g in grupos[:15]: linhas.append(f"         {g['de']:5.1f}–{g['ate']:5.1f} s  {g['zona']:4s}  “{g['texto']}”")
        if len(grupos) > 15: linhas.append(f'         … e mais {len(grupos) - 15}')
    else: ok('todo texto dentro da zona segura')

print(f'QA · {os.path.basename(a.video)}')
print('\n'.join(linhas))
print(f'  → {avisos} ponto(s) para olhar' if avisos else '  → tudo dentro do padrão')
