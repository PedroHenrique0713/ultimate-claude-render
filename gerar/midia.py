"""Prepara a mídia do projeto: fotos e vídeos de midia/ viram o que o motor consome, e o manifesto build/midia.js.

    foto   (jpg, png, webp, heic…)  → build/foto/<nome>.jpg   (lado maior até 3200 px)
    vídeo  (mp4, mov, webm, mkv…)   → build/seq/<nome>/0001.jpg…  (JPEG por quadro, no fps do arquivo até 30)
                                       build/audio/clip-<nome>.wav  (se o vídeo tiver som)

O Chromium do render não toca H.264 e o seek de <video> custa 250 a 500 ms por quadro; sequência de JPEG custa ~10 ms.
O nome (sem extensão, espaços viram "-") é o que a cena usa: M.foto(pai, 'praia'), M.video(pai, 'clipe').
Reaproveita o que já foi convertido se o arquivo de origem não mudou.

Uso: python3 midia.py <pasta-do-projeto>
"""
import glob, json, os, re, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import projeto, build

FOTOS = ('.jpg', '.jpeg', '.png', '.webp', '.heic', '.avif', '.bmp', '.tiff')
VIDEOS = ('.mp4', '.mov', '.webm', '.mkv', '.m4v', '.avi')
LADO_FOTO = 3200
LADO_VIDEO = 1920


def nome_de(arq):
    return re.sub(r'[^\w.-]+', '-', os.path.splitext(os.path.basename(arq))[0]).strip('-')


def sonda(arq):
    j = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', arq]))
    v = next((s for s in j['streams'] if s['codec_type'] == 'video'), None)
    a = next((s for s in j['streams'] if s['codec_type'] == 'audio'), None)
    return j, v, a


def mais_novo(saida, origem):
    return os.path.exists(saida) and os.path.getmtime(saida) >= os.path.getmtime(origem)


def main(pasta):
    cfg, pasta = projeto(pasta)
    raiz = os.path.join(pasta, 'midia')
    manifesto = {}
    if os.path.isdir(raiz):
        arquivos = sorted(f for f in glob.glob(os.path.join(raiz, '**', '*'), recursive=True) if os.path.isfile(f))
        for f in arquivos:
            rel = os.path.relpath(f, raiz)
            if rel.split(os.sep)[0] in ('sfx',) or os.path.basename(f).lower().startswith(('trilha', 'voz')): continue
            ext = os.path.splitext(f)[1].lower()
            nome = nome_de(f)
            if ext in FOTOS:
                j, v, _ = sonda(f)
                alfa = ext in ('.png', '.webp') and any(x in v.get('pix_fmt', '') for x in ('rgba', 'ya', 'bgra', 'argb', 'abgr', 'yuva', 'pal8'))
                saida_ext = '.png' if alfa else '.jpg'   # JPEG trocaria o transparente por preto (logo, recorte de produto)
                dest = build(pasta, 'foto', nome + saida_ext)
                if not mais_novo(dest, f):
                    subprocess.check_call(['ffmpeg', '-v', 'error', '-y', '-i', f, '-vf', f"scale='min({LADO_FOTO},iw)':'min({LADO_FOTO},ih)':force_original_aspect_ratio=decrease:flags=lanczos",
                                           *(['-pix_fmt', 'rgba'] if alfa else ['-q:v', '2']), dest])
                    print('foto  ', nome)
                sw, sh = map(int, subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', dest]).decode().strip().split('x'))
                manifesto[nome] = {'tipo': 'foto', 'src': f'build/foto/{nome}{saida_ext}', 'w': sw, 'h': sh, 'alfa': alfa}
            elif ext in VIDEOS:
                j, v, a = sonda(f)
                num, den = map(int, v['r_frame_rate'].split('/'))
                fps_origem = num / den if den else 30
                fps = min(30, round(fps_origem)) if fps_origem > 0 else 30
                dur = float(j['format']['duration'])
                pasta_seq = build(pasta, 'seq', nome, 'x')[:-2]
                primeiro = os.path.join(pasta_seq, '0001.jpg')
                if not mais_novo(primeiro, f):
                    for velho in glob.glob(os.path.join(pasta_seq, '*.jpg')): os.remove(velho)
                    subprocess.check_call(['ffmpeg', '-v', 'error', '-y', '-i', f, '-vf', f"fps={fps},scale='min({LADO_VIDEO},iw)':'min({LADO_VIDEO},ih)':force_original_aspect_ratio=decrease:flags=lanczos",
                                           '-q:v', '3', os.path.join(pasta_seq, '%04d.jpg')])
                    print('vídeo ', nome)
                n = len(glob.glob(os.path.join(pasta_seq, '*.jpg')))
                wav = None
                if a:
                    wav = f'build/audio/clip-{nome}.wav'
                    dest = os.path.join(pasta, wav)
                    if not mais_novo(dest, f):
                        os.makedirs(os.path.dirname(dest), exist_ok=True)
                        subprocess.check_call(['ffmpeg', '-v', 'error', '-y', '-i', f, '-vn', '-ac', '2', '-ar', '48000', dest])
                manifesto[nome] = {'tipo': 'video', 'pasta': f'build/seq/{nome}', 'n': n, 'fps': fps, 'dur': round(n / fps, 3), 'w': v['width'], 'h': v['height'], 'audio': wav}
    destino = build(pasta, 'midia.js')
    open(destino, 'w', encoding='utf-8').write('// Gerado por gerar/midia.py\nwindow.MIDIA = ' + json.dumps(manifesto, indent=1) + ';\n')
    print(f'{len(manifesto)} mídia(s) no manifesto: ' + (', '.join(manifesto) or '(nenhuma)'))


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
