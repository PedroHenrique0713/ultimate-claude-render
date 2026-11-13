"""Livro de gasto com teto, por projeto. Todo serviço pago (voz, imagem, vídeo) passa por aqui antes de ser chamado.

    from gasto import Livro
    livro = Livro('/caminho/do/projeto/gasto.json', teto=8.0)
    livro.debitar(0.30, 'elevenlabs/v3', 'narracao')      # levanta SystemExit se estourar o teto; nada é chamado
    livro.estornar('elevenlabs/v3', 'narracao')           # chamada que falhou não cobra

O livro é protegido por trava de thread e de arquivo (três chamadas em paralelo já corromperam um livro).
"""
import json, os, threading, time

try:
    import fcntl
except ImportError:   # Windows
    fcntl = None

_TRAVA = threading.Lock()


class Livro:
    def __init__(self, caminho, teto=None):
        self.caminho = caminho
        self.teto = teto

    def ler(self):
        if os.path.exists(self.caminho):
            return json.load(open(self.caminho, encoding='utf-8'))
        return {'teto': self.teto, 'total': 0.0, 'chamadas': []}

    def _com_trava(self, f):
        with _TRAVA:
            os.makedirs(os.path.dirname(os.path.abspath(self.caminho)), exist_ok=True)
            with open(self.caminho + '.lock', 'w') as tr:
                if fcntl: fcntl.flock(tr, fcntl.LOCK_EX)
                return f()

    def debitar(self, valor, servico, rotulo):
        def f():
            l = self.ler()
            teto = self.teto if self.teto is not None else l.get('teto')
            if teto is not None and l['total'] + valor > teto + 1e-9:
                raise SystemExit(f'Teto de US$ {teto:.2f} atingido (gasto US$ {l["total"]:.2f}, pedido US$ {valor:.2f}). Nada foi chamado.')
            l['teto'] = teto
            l['chamadas'].append({'quando': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'servico': servico, 'rotulo': rotulo, 'preco': round(valor, 4)})
            l['total'] = round(l['total'] + valor, 4)
            json.dump(l, open(self.caminho, 'w', encoding='utf-8'), indent=2)
        return self._com_trava(f)

    def estornar(self, servico, rotulo):
        def f():
            l = self.ler()
            for i in range(len(l['chamadas']) - 1, -1, -1):
                c = l['chamadas'][i]
                if c['servico'] == servico and c['rotulo'] == rotulo:
                    l['total'] = round(l['total'] - c['preco'], 4); l['chamadas'].pop(i); break
            json.dump(l, open(self.caminho, 'w', encoding='utf-8'), indent=2)
        return self._com_trava(f)
