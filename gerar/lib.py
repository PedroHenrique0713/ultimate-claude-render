"""Utilidades comuns do pipeline de áudio e mídia: projeto, caminhos, leitura de áudio e gravação de WAV."""
import json, os, subprocess, sys, wave
import numpy as np

for _f in (sys.stdout, sys.stderr):   # Windows: o console padrão é cp1252 e quebra com acento e seta
    try: _f.reconfigure(encoding='utf-8', errors='replace')
    except Exception: pass

SR = 48000
_PASTA = None
AQUI = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(AQUI)


def projeto(pasta):
    """Lê o projeto.json (com padrões) e devolve (config, pasta absoluta)."""
    pasta = os.path.abspath(pasta)
    arq = os.path.join(pasta, 'projeto.json')
    if not os.path.exists(arq):
        sys.exit(f'projeto.json não existe em {pasta} (crie o projeto com: ucr novo <pasta>)')
    cfg = json.load(open(arq, encoding='utf-8'))
    global _PASTA
    _PASTA = pasta
    cfg.setdefault('formato', 'vertical')
    cfg.setdefault('teto_usd', 5.0)   # serviço pago para em US$ 5 por projeto se ninguém disser outro valor
    cfg.setdefault('fps', 60)
    cfg.setdefault('inicio', 1.2)
    cfg.setdefault('cauda', 3.0)
    cfg.setdefault('respiros', {})
    cfg.setdefault('mix', {})
    return cfg, pasta


def build(pasta, *partes):
    d = os.path.join(pasta, 'build', *partes[:-1]) if partes else os.path.join(pasta, 'build')
    os.makedirs(d, exist_ok=True)
    return os.path.join(pasta, 'build', *partes)


def ler(arq):
    """Qualquer áudio → float32 estéreo a 48 kHz, em [-1, 1]."""
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', arq, '-f', 's16le', '-ac', '2', '-ar', str(SR), '-'])
    return np.frombuffer(raw, dtype=np.int16).reshape(-1, 2).astype(np.float32) / 32768


def gravar_wav(arq, x):
    """float32 estéreo em [-1, 1] → WAV 16 bits."""
    os.makedirs(os.path.dirname(arq), exist_ok=True)
    with wave.open(arq, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())


def duracao(arq):
    return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', arq]).decode())


def chave(nome, *arquivos):
    """Chave de API: variável de ambiente, ou a primeira linha de um arquivo (nunca é impressa)."""
    v = os.environ.get(nome)
    if v: return v.strip()
    for a in arquivos:
        a = os.path.expanduser(a)
        if os.path.exists(a):
            return open(a).read().strip().split('\n')[0].strip()
    # .env do projeto, da pasta atual ou do repo
    for base in dict.fromkeys(b for b in (_PASTA, os.getcwd(), REPO) if b):
        env = os.path.join(base, '.env')
        if os.path.exists(env):
            for l in open(env, encoding='utf-8'):
                if l.startswith(nome + '='): return l.split('=', 1)[1].strip().strip('"\'')
    sys.exit(f'Faltou a chave {nome}: exporte a variável de ambiente ou ponha {nome}=... num arquivo .env.')
