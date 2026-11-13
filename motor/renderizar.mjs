// Render em pedaços de PEDACO s repartidos entre N processos, intermediário SEM perda e um único encode com perda por entrega.
// (Port em Node do antigo renderizar.sh: roda igual em Linux, macOS e Windows.)
//
// Uso: node renderizar.mjs <cena.html> <mix.wav> <saida-base> --dur <s> [--w 1080 --h 1920 --fps 60 --procs 3 --dsf 1.5 --mb 4]
//        [--pedaco 2] [--de 30 --ate 38] [--acabamento "noise=c0s=9:allf=t"] [--sem-qa] [--python python3] [--esperado 1080x1920]
//   --mb         borrão de movimento, só nas janelas da cena (whoosh, impacto, M.borrao)
//   --pedaco     segundos por pedaço (2)
//   --preset     preset do x264 na entrega (medium; use slow para o último render)
//   --de/--ate   refaz só os pedaços desse intervalo e reaproveita o resto (mesmos parâmetros do render anterior)
// Saída: <saida-base>.mp4 (entrega) e "<saida-base> - leve.mp4" (30 fps, para mandar por mensagem) e "<saida-base> - QA.txt".
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.dirname(aqui);
const args = process.argv.slice(2);
const pos = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && !['--sem-qa'].includes(args[i - 1])));
const opt = (k, d) => { const i = args.indexOf('--' + k); return i > -1 ? args[i + 1] : d; };
const [CENA, MIX, OUT] = pos;
if (!CENA || !MIX || !OUT || !opt('dur')) { console.error('uso: node renderizar.mjs <cena.html> <mix.wav> <saida-base> --dur <s> [opções]'); process.exit(2); }
const DUR = parseFloat(opt('dur')), FPS = parseInt(opt('fps', '60')), N = parseInt(opt('procs', '3')), DSF = opt('dsf', '1.5'), MB = opt('mb', process.env.MB || '1');
const W = opt('w', '1080'), H = opt('h', '1920'), PEDACO = parseFloat(opt('pedaco', process.env.PEDACO || '2'));
const DE = opt('de', process.env.DE), ATE = opt('ate', process.env.ATE);
const ACABAMENTO = opt('acabamento', process.env.ACABAMENTO || '');
const PRESET = opt('preset', process.env.PRESET || 'medium');
const PY = (opt('python', process.env.UCR_PYTHON || 'python3')).split(' ');

const TMP = path.join(path.dirname(path.resolve(OUT)), 'trechos-' + path.basename(OUT));
fs.mkdirSync(TMP, { recursive: true });
const TOTAL = Math.round(DUR * FPS), P = Math.max(1, Math.round(PEDACO * FPS));
const NP = Math.ceil(TOTAL / P);
const params = `cena=${path.resolve(CENA)} w=${W} h=${H} fps=${FPS} dsf=${DSF} mb=${MB} pedaco=${P} total=${TOTAL}`;
const nomePedaco = (i) => `p${String(i).padStart(4, '0')}`;

let F0 = 0, F1 = TOTAL;
if (DE || ATE) {
  const antes = fs.existsSync(path.join(TMP, 'params.txt')) ? fs.readFileSync(path.join(TMP, 'params.txt'), 'utf8') : '';
  if (antes !== params) { console.error('--de/--ate só reaproveita pedaços feitos com os mesmos parâmetros: rode o vídeo inteiro antes.'); process.exit(1); }
  F0 = Math.floor((parseFloat(DE || 0)) * FPS); F1 = Math.round(parseFloat(ATE || DUR) * FPS);
} else {
  for (const f of fs.readdirSync(TMP)) if (/^p\d+\.mkv$/.test(f)) fs.unlinkSync(path.join(TMP, f));
}
fs.writeFileSync(path.join(TMP, 'params.txt'), params);

// pedaços em rodízio entre os processos: o trecho pesado da cena não cai inteiro num processo só
const listas = Array.from({ length: N }, () => []);
const concat = [];
let k = 0;
for (let i = 0; i < NP; i++) {
  const a = i * P, b = Math.min((i + 1) * P, TOTAL);
  concat.push(`file '${nomePedaco(i)}.mkv'`);
  if (b > F0 && a < F1) { listas[k % N].push(`${a}:${b}:${path.join(TMP, nomePedaco(i))}`); k++; }
}
fs.writeFileSync(path.join(TMP, 'lista.txt'), concat.join('\n') + '\n');
console.error(`${k} de ${NP} pedaços para renderizar em até ${N} processos`);

const rodar = (cmd, a, opts = {}) => new Promise((res, rej) => {
  const p = spawn(cmd, a, { stdio: ['ignore', 'inherit', 'inherit'], ...opts });
  p.on('close', (c) => (c === 0 ? res() : rej(new Error(`${cmd} saiu com código ${c}`))));
  p.on('error', rej);
});

const trabalhadores = listas.map((l, j) => {
  if (!l.length) return null;
  const log = fs.openSync(path.join(TMP, `w${j}.log`), 'w');
  return new Promise((res, rej) => {
    const p = spawn(process.execPath, [path.join(aqui, 'render.mjs'), CENA, 'video', '--w', W, '--h', H, '--fps', String(FPS), '--dsf', DSF, '--mb', MB, '--sem-perda', '--lista', l.join(';') + ';'],
      { stdio: ['ignore', log, log] });
    p.on('close', (c) => (c === 0 ? res() : rej(new Error(`um processo de render falhou: ver ${path.join(TMP, `w${j}.log`)}`))));
  });
}).filter(Boolean);
try { await Promise.all(trabalhadores); } catch (e) { console.error(String(e.message)); process.exit(1); }
for (let i = 0; i < NP; i++) {
  const f = path.join(TMP, nomePedaco(i) + '.mkv');
  if (!fs.existsSync(f) || fs.statSync(f).size === 0) { console.error(`faltou o pedaço ${i}`); process.exit(1); }
}

// um encode com perda por entrega (antes eram três gerações). O render.mjs já converteu a cor; aqui só se marca BT.709 limitada.
const COR = 'setparams=range=tv:colorspace=bt709:color_primaries=bt709:color_trc=bt709';
const vf = (extra = '') => `${ACABAMENTO ? ACABAMENTO + ',' : ''}${extra}${COR}`;
fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
const base = ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(TMP, 'lista.txt'), '-i', MIX, '-map', '0:v', '-map', '1:a'];
await Promise.all([rodar('ffmpeg', [...base, '-vf', vf(), '-c:v', 'libx264', '-preset', PRESET, '-b:v', '22M', '-maxrate', '30M', '-bufsize', '44M', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', String(FPS),
  '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-shortest', '-movflags', '+faststart', OUT + '.mp4']),
rodar('ffmpeg', [...base, '-vf', vf('fps=30,'), '-c:v', 'libx264', '-preset', PRESET, '-b:v', '3500k', '-maxrate', '4500k', '-bufsize', '9000k', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-shortest', '-movflags', '+faststart', OUT + ' - leve.mp4'])]);
console.error(`pronto: ${OUT}.mp4`);

if (!args.includes('--sem-qa')) {
  const zonas = path.join(TMP, 'zonas.json');
  const z = spawnSync(process.execPath, [path.join(aqui, 'render.mjs'), CENA, 'zonas', '--w', W, '--h', H, '--out', zonas], { encoding: 'utf8' });
  if (z.status !== 0) console.error('zonas: falhou\n' + z.stderr);
  const qa = spawnSync(PY[0], [...PY.slice(1), path.join(raiz, 'gerar', 'qa.py'), OUT + '.mp4', '--zonas', zonas, ...(opt('esperado') ? ['--esperado', opt('esperado')] : [])],
    { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' } });
  process.stdout.write(qa.stdout || ''); if (qa.stderr) process.stderr.write(qa.stderr);
  fs.writeFileSync(OUT + ' - QA.txt', qa.stdout || '');
}
