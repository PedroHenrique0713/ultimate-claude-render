#!/usr/bin/env node
// ucr — Ultimate Claude Render. Um comando para todo o pipeline, igual em Linux, macOS e Windows.
//   ucr doctor                       confere node, ffmpeg, python, Chromium e o motor
//   ucr novo <pasta> [--marca X --formato vertical|horizontal|quadrado --nome "Título"]
//   ucr tudo <pasta>                 prep → midia → voz → tempos → batidas → sons → mix → render → QA
//   ucr prep|midia|voz|tempos|batidas|sons|mix|render|qa <pasta>      cada etapa sozinha
//   ucr stills <pasta> 2,8.5,15      quadros soltos para conferir sem renderizar o vídeo
//   ucr preview <pasta> [--audio]    abre a cena no navegador, em tempo real
//   ucr filmar <plano.json> <saida>  filma telas reais (Playwright) para usar na cena
//   ucr instalar-skill               instala a skill no Claude Code (~/.claude/skills)
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MOTOR = path.join(REPO, 'motor');
const GERAR = path.join(REPO, 'gerar');
const [cmd, ...resto] = process.argv.slice(2);
const flags = {}; const pos = [];
for (let i = 0; i < resto.length; i++) {
  if (resto[i].startsWith('--')) { const k = resto[i].slice(2); const v = resto[i + 1] && !resto[i + 1].startsWith('--') ? resto[++i] : true; flags[k] = v; }
  else pos.push(resto[i]);
}
const FORMATOS = { vertical: [1080, 1920], horizontal: [1920, 1080], quadrado: [1080, 1080] };
const falha = (m) => { console.error('\x1b[31m' + m + '\x1b[0m'); process.exit(1); };
const titulo = (m) => console.log('\n\x1b[1m▸ ' + m + '\x1b[0m');

// ── python: python3, python ou py -3 (o que existir e tiver numpy e scipy) ──
let _py;
function python() {
  if (_py) return _py;
  const env = { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' };
  const candidatos = [process.env.UCR_PYTHON && process.env.UCR_PYTHON.split(' '), ['python3'], ['python'], ['py', '-3']].filter(Boolean);
  let qualquer = null;
  for (const c of candidatos) {
    const r = spawnSync(c[0], [...c.slice(1), '-c', 'import numpy, scipy; print("ok")'], { encoding: 'utf8', env });
    if (r.status === 0) return (_py = c);
    const v = spawnSync(c[0], [...c.slice(1), '--version'], { encoding: 'utf8', env });
    if (v.status === 0 && !qualquer) qualquer = c;
  }
  return (_py = qualquer || ['python3']);
}
const rodar = (cmd, args, { env = {}, cwd, silencioso } = {}) => {
  const r = spawnSync(cmd, args, { stdio: silencioso ? 'pipe' : 'inherit', cwd, env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', ...env }, encoding: 'utf8' });
  if (r.error) falha(`não consegui rodar "${cmd}": ${r.error.message}`);
  if (r.status !== 0) { if (silencioso && r.stderr) console.error(r.stderr); falha(`falhou: ${cmd} ${args.slice(0, 3).join(' ')} … (código ${r.status})`); }
  return r;
};
const py = (script, args, env) => { const p = python(); return rodar(p[0], [...p.slice(1), path.join(GERAR, script), ...args], { env }); };
const nodeRender = (args, opts) => rodar(process.execPath, [path.join(MOTOR, 'render.mjs'), ...args], opts);

// ── projeto ──
function carregar(pasta) {
  if (!pasta) falha('informe a pasta do projeto: ucr <comando> <pasta>');
  const dir = path.resolve(pasta);
  const arq = path.join(dir, 'projeto.json');
  if (!fs.existsSync(arq)) falha(`${arq} não existe. Crie um projeto com: ucr novo ${pasta}`);
  const cfg = JSON.parse(fs.readFileSync(arq, 'utf8'));
  cfg.formato ||= 'vertical';
  if (!FORMATOS[cfg.formato]) falha(`formato "${cfg.formato}" desconhecido (${Object.keys(FORMATOS).join(', ')})`);
  cfg.nome ||= path.basename(dir);
  const cena = path.join(dir, cfg.cena || 'cena.html');
  return { dir, cfg, cena, W: FORMATOS[cfg.formato][0], H: FORMATOS[cfg.formato][1], build: path.join(dir, 'build'), saida: path.join(dir, 'saida') };
}

function prep(P) {
  titulo('prep: motor e marca');
  const u = path.join(P.dir, '.ucr');
  fs.mkdirSync(u, { recursive: true });
  for (const f of ['motor.js', 'motor.css', 'tema.js']) fs.copyFileSync(path.join(MOTOR, f), path.join(u, f));
  if (!fs.existsSync(path.join(MOTOR, 'vendor', 'gsap.min.js'))) falha('motor/vendor/gsap.min.js não existe: rode "npm install" na pasta do repo');
  fs.cpSync(path.join(MOTOR, 'vendor'), path.join(u, 'vendor'), { recursive: true });
  // marca: só os arquivos que o marca.json cita (logo, fontes, moldura) vão para .ucr/marca/ e os caminhos são reescritos.
  // Copiar a pasta inteira falhava com marca.json na raiz do projeto (o Node recusa copiar a pasta para dentro dela mesma).
  const marcaArq = path.resolve(P.dir, P.cfg.marca || 'marca/marca.json');
  if (!fs.existsSync(marcaArq)) falha(`marca não encontrada: ${marcaArq} (projeto.json → "marca")`);
  const marcaDir = path.dirname(marcaArq);
  const destMarca = path.join(u, 'marca');
  fs.rmSync(destMarca, { recursive: true, force: true });
  const marca = JSON.parse(fs.readFileSync(marcaArq, 'utf8'));
  const levar = (rel) => {
    if (!rel) return rel;
    const src = path.resolve(marcaDir, rel);
    if (!fs.existsSync(src)) falha(`marca: "${rel}" não existe (${src})`);
    const seguro = path.isAbsolute(rel) || rel.replace(/\\/g, '/').split('/').includes('..') ? '_ext/' + path.basename(rel) : rel.replace(/\\/g, '/');
    fs.mkdirSync(path.dirname(path.join(destMarca, seguro)), { recursive: true });
    fs.copyFileSync(src, path.join(destMarca, seguro));
    return '.ucr/marca/' + seguro;
  };
  if (marca.logo) marca.logo = levar(marca.logo);
  if (marca.celular?.moldura) marca.celular.moldura = levar(marca.celular.moldura);
  if (marca.fonte?.arquivos) for (const k of Object.keys(marca.fonte.arquivos)) marca.fonte.arquivos[k] = levar(marca.fonte.arquivos[k]);
  fs.writeFileSync(path.join(u, 'marca.js'), 'window.MARCA = ' + JSON.stringify(marca, null, 1) + ';\n');
  fs.writeFileSync(path.join(u, 'projeto.js'), 'window.PROJETO = ' + JSON.stringify({ nome: P.cfg.nome, formato: P.cfg.formato, zonas: P.cfg.zonas }) + ';\n');
  // stubs: a cena sempre carrega estes três arquivos; as etapas do pipeline os substituem pelos reais
  fs.mkdirSync(P.build, { recursive: true });
  const stub = { 'tempos.js': 'window.TEMPOS = { voz: null, total: ' + (P.cfg.duracao || 30) + ', frases: [] };\n', 'midia.js': 'window.MIDIA = {};\n', 'batidas.js': 'window.BATIDAS = { bpm: 0, t: [] };\n' };
  for (const [f, c] of Object.entries(stub)) if (!fs.existsSync(path.join(P.build, f))) fs.writeFileSync(path.join(P.build, f), c);
  console.log(`marca "${marca.nome || path.basename(marcaDir)}", formato ${P.cfg.formato} (${P.W}×${P.H})`);
}

const etapas = {
  midia: (P) => { titulo('midia: fotos e vídeos'); py('midia.py', [P.dir]); },
  voz: (P) => { if (!P.cfg.voz) return console.log('\n(sem "voz" no projeto: vídeo sem narração)'); titulo('voz: narração com tempo por palavra'); py('voz.py', [P.dir]); },
  tempos: (P) => { titulo('tempos: respiros e mapa de tempos'); py('tempos.py', [P.dir]); },
  batidas: (P) => { if (P.cfg.mix?.trilha === null) return; titulo('batidas da trilha'); py('mix.py', [P.dir], { SO_BATIDAS: '1' }); },
  sons: (P) => { titulo('sons: efeitos e clipes que a cena marcou'); nodeRender([P.cena, 'sons', '--w', String(P.W), '--h', String(P.H), '--out', path.join(P.build, 'sons.json')]); },
  mix: (P) => { titulo('mix: voz, trilha, efeitos e clipes em ' + (P.cfg.mix?.lufs ?? -14) + ' LUFS'); py('mix.py', [P.dir]); },
  render: (P) => {
    titulo('render');
    const d = nodeRender([P.cena, 'duracao', '--w', String(P.W), '--h', String(P.H)], { silencioso: true });
    const dur = parseFloat(String(d.stdout).trim().split('\n').pop());
    if (!(dur > 0)) falha('não consegui ler a duração da cena');
    const r = P.cfg.render || {};
    const procs = flags.procs || r.procs || Math.max(1, Math.min(3, os.cpus().length - 1));
    fs.mkdirSync(P.saida, { recursive: true });
    const mix = path.join(P.build, 'audio', 'mix-final.wav');
    if (!fs.existsSync(mix)) falha('build/audio/mix-final.wav não existe: rode "ucr mix" antes do render');
    const p = python();
    const a = [path.join(MOTOR, 'renderizar.mjs'), P.cena, mix, path.join(P.saida, P.cfg.nome), '--dur', String(dur), '--w', String(P.W), '--h', String(P.H),
      '--fps', String(flags.fps || P.cfg.fps || 60), '--dsf', String(flags.dsf || r.dsf || 1.5), '--mb', String(flags.mb || r.mb || 4), '--procs', String(procs),
      '--esperado', `${P.W}x${P.H}`, '--python', p.join(' ')];
    if (r.acabamento) a.push('--acabamento', r.acabamento);
    if (flags.de) a.push('--de', String(flags.de)); if (flags.ate) a.push('--ate', String(flags.ate));
    if (flags.preset) a.push('--preset', String(flags.preset));
    if (flags['sem-qa']) a.push('--sem-qa');
    rodar(process.execPath, a);
  },
  qa: (P) => {
    titulo('QA');
    const mp4 = path.join(P.saida, P.cfg.nome + '.mp4');
    if (!fs.existsSync(mp4)) falha(`${mp4} não existe: rode "ucr render"`);
    py('qa.py', [mp4, '--esperado', `${P.W}x${P.H}`, ...(P.cfg.mix?.lufs != null ? ['--lufs', String(P.cfg.mix.lufs)] : [])]);
  },
};

function abrir(url) {
  const c = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  spawn(c[0], c[1], { stdio: 'ignore', detached: true }).unref();
}

function doctor() {
  const linhas = []; let ruim = 0;
  const ok = (t, d = '') => linhas.push(`  \x1b[32mok\x1b[0m   ${t}${d ? '  ' + d : ''}`);
  const nao = (t, como) => { ruim++; linhas.push(`  \x1b[31mfalta\x1b[0m ${t}\n         → ${como}`); };
  const versao = (cmd, args) => { const r = spawnSync(cmd, args, { encoding: 'utf8' }); return r.status === 0 ? (r.stdout + r.stderr).split('\n')[0] : null; };
  const nv = parseInt(process.versions.node); nv >= 20 ? ok('node', process.version) : nao('node ≥ 20', 'instale em https://nodejs.org');
  const ff = versao('ffmpeg', ['-version']); ff ? ok('ffmpeg', ff.slice(0, 40)) : nao('ffmpeg', 'Linux: apt/dnf install ffmpeg · macOS: brew install ffmpeg · Windows: winget install ffmpeg');
  if (ff) { const enc = spawnSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' }).stdout || ''; /libx264/.test(enc) ? ok('ffmpeg com libx264') : nao('ffmpeg com libx264', 'instale um build completo do ffmpeg (o do Windows/Homebrew já vem com)'); }
  versao('ffprobe', ['-version']) ? ok('ffprobe') : nao('ffprobe', 'vem junto com o ffmpeg');
  const p = python();
  const mods = ['numpy', 'scipy', 'PIL'];
  const faltando = mods.filter((m) => spawnSync(p[0], [...p.slice(1), '-c', `import ${m}`], { encoding: 'utf8' }).status !== 0);
  const pv = versao(p[0], [...p.slice(1), '--version']);
  if (!pv) nao('python 3', 'instale em https://python.org (no Windows marque "Add to PATH")');
  else { ok('python', `${p.join(' ')} · ${pv}`); faltando.length ? nao('módulos ' + faltando.join(', '), `${p.join(' ')} -m pip install -r requirements.txt`) : ok('numpy, scipy, pillow'); }
  if (pv) { spawnSync(p[0], [...p.slice(1), '-c', 'import edge_tts'], { encoding: 'utf8' }).status === 0 ? ok('edge-tts (voz grátis)') : linhas.push('  --    edge-tts ausente (opcional, voz grátis): pip install edge-tts'); }
  for (const f of ['gsap.min.js', 'three/three.module.min.js']) fs.existsSync(path.join(MOTOR, 'vendor', f)) ? ok('vendor/' + f) : nao('vendor/' + f, 'rode "npm install" na pasta do repo');
  import('../motor/chrome.mjs').then(({ caminhoDoChrome }) => {
    const c = caminhoDoChrome();
    c ? ok('Chromium', c) : nao('Chromium', 'npx playwright-core install chromium  (ou CHROME_PATH=/caminho/do/chrome)');
  }, () => nao('playwright-core', 'rode "npm install" na pasta do repo')).then(() => {
    console.log('\nucr doctor\n' + linhas.join('\n') + '\n' + (ruim ? `\n${ruim} item(ns) para resolver.` : '\nTudo pronto.'));
    process.exit(ruim ? 1 : 0);
  });
}

function novo(pasta) {
  if (!pasta) falha('uso: ucr novo <pasta> [--marca <pasta-da-marca|nome>] [--formato vertical|horizontal|quadrado] [--nome "Título"]');
  const dir = path.resolve(pasta);
  if (fs.existsSync(path.join(dir, 'projeto.json'))) falha(`${dir} já tem um projeto`);
  const formato = flags.formato || 'vertical';
  if (!FORMATOS[formato]) falha(`formato "${formato}" desconhecido`);
  let marca = flags.marca || '_modelo';
  if (!marca.includes('/') && !marca.includes('\\') && fs.existsSync(path.join(REPO, 'marcas', marca))) marca = path.join(REPO, 'marcas', marca);
  marca = path.resolve(marca);
  if (!fs.existsSync(path.join(marca, 'marca.json'))) falha(`${marca}/marca.json não existe`);
  fs.mkdirSync(path.join(dir, 'midia'), { recursive: true });
  fs.cpSync(marca, path.join(dir, 'marca'), { recursive: true });
  const nome = String(flags.nome || path.basename(dir));
  const cfg = { nome: nome.replace(/[\\/:*?"<>|]/g, '-'), formato, fps: 30, marca: 'marca/marca.json',
    voz: { provedor: 'edge', voz: 'pt-BR-FranciscaNeural' }, inicio: 1.0, cauda: 3, respiros: {},
    mix: { trilha: 'sintetica', bpm: 112, lufs: -14 }, render: { dsf: 1.5, mb: 4 } };
  fs.writeFileSync(path.join(dir, 'projeto.json'), JSON.stringify(cfg, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'narracao.txt'), 'Este é o seu primeiro vídeo feito de HTML. A voz, as legendas, o ritmo e a trilha saem do roteiro. Troque este texto e rode de novo.\n');
  fs.copyFileSync(path.join(REPO, 'exemplos', 'modelo-cena.html'), path.join(dir, 'cena.html'));
  fs.writeFileSync(path.join(dir, '.gitignore'), 'build/\n.ucr/\nsaida/\ngasto.json\ngasto.json.lock\n.env\n');
  console.log(`projeto criado em ${dir}\n  marca     ${path.relative(dir, path.join(dir, 'marca'))}/marca.json (edite cores, fonte e logo)\n  roteiro   narracao.txt\n  cena      cena.html\nPróximo passo:  ucr tudo ${pasta}`);
}

function instalarSkill() {
  const origem = path.join(REPO, 'skills', 'ultimate-claude-render');
  const base = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  const destino = path.join(base, 'skills', 'ultimate-claude-render');
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.rmSync(destino, { recursive: true, force: true });
  try { fs.symlinkSync(origem, destino, process.platform === 'win32' ? 'junction' : 'dir'); console.log(`skill ligada (atualiza com o git pull): ${destino} → ${origem}`); }
  catch { fs.cpSync(origem, destino, { recursive: true }); console.log(`skill copiada para ${destino} (rode de novo depois de atualizar o repo)`); }
  console.log(`A skill aponta para o repo em ${REPO}. Se mover a pasta, rode "ucr instalar-skill" outra vez.`);
}

switch (cmd) {
  case 'doctor': doctor(); break;
  case 'novo': novo(pos[0]); break;
  case 'instalar-skill': instalarSkill(); break;
  case 'filmar': if (pos.length < 2) falha('uso: ucr filmar <plano.json> <pasta-de-saida> [ids]'); rodar(process.execPath, [path.join(MOTOR, 'filmar.mjs'), ...pos]); break;
  case 'prep': prep(carregar(pos[0])); break;
  case 'stills': { const P = carregar(pos[0]); prep(P); if (!pos[1]) falha('uso: ucr stills <pasta> 2,8.5,15');
    if (P.cfg.voz && !fs.existsSync(path.join(P.build, 'tempos.js')) || (P.cfg.voz && /frases: \[\]/.test(fs.readFileSync(path.join(P.build, 'tempos.js'), 'utf8')))) console.log('aviso: a narração ainda não foi gerada; rode "ucr voz" e "ucr tempos" (ou "ucr tudo") para a cena ter os tempos da fala'); nodeRender([P.cena, 'stills', pos[1], '--w', String(P.W), '--h', String(P.H), '--out', path.join(P.saida, 'stills')]); console.log('quadros em ' + path.join(P.saida, 'stills')); break; }
  case 'preview': {
    const P = carregar(pos[0]); prep(P);
    let url = pathToFileURL(P.cena).href;
    const mix = path.join(P.build, 'audio', 'mix-final.wav');
    if (flags.audio && fs.existsSync(mix)) url += '?audio=' + encodeURIComponent(pathToFileURL(mix).href);
    console.log(url); abrir(url); break;
  }
  case 'midia': case 'voz': case 'tempos': case 'batidas': case 'sons': case 'mix': case 'render': case 'qa': { const P = carregar(pos[0]); if (cmd !== 'qa') prep(P); etapas[cmd](P); break; }
  case 'tudo': {
    const P = carregar(pos[0]);
    prep(P); etapas.midia(P); etapas.voz(P); etapas.tempos(P); etapas.batidas(P); etapas.sons(P); etapas.mix(P); etapas.render(P);
    console.log(`\n\x1b[32mpronto:\x1b[0m ${path.join(P.saida, P.cfg.nome + '.mp4')}`);
    break;
  }
  default:
    { const ls = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1); const n = ls.findIndex((l) => !l.startsWith('//')); console.log(ls.slice(0, n).map((l) => l.slice(3)).join('\n')); }
    process.exit(cmd ? 1 : 0);
}
