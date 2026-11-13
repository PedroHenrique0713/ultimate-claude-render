// Renderiza uma cena do motor quadro a quadro (seek determinístico na timeline GSAP) e codifica com ffmpeg.
// Uso:
//   node render.mjs <cena.html> stills 2,8.5,15 --out <pasta>                 quadros soltos em PNG
//   node render.mjs <cena.html> video --fps 60 --out <base> [--f0 N --f1 M]    trecho [f0, f1) em <base>.mp4 (sem áudio)
//        [--mb 4 --borrao auto|tudo|nada] [--sem-perda: <base>.mkv sem perda] [--lista "f0:f1:base;..." vários trechos num navegador só]
//   node render.mjs <cena.html> sons --out <sons.json>                         efeitos e clipes marcados pela cena, para o mix
//   node render.mjs <cena.html> duracao                                       imprime a duração da cena (s)
//   node render.mjs <cena.html> zonas --out <zonas.json> [--passo .5]         textos fora da zona segura da plataforma
// Dimensões: --w e --h (o `ucr` passa as do formato do projeto). Supersampling: --dsf 1.5.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { abrirChrome } from './chrome.mjs';

const [cena, modo, lista] = process.argv.slice(2);
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i > -1 ? args[i + 1] : d; };
const W = parseInt(opt('w', '1080')), H = parseInt(opt('h', '1920'));
const DSF = parseFloat(opt('dsf', '1'));   // supersampling: captura maior e reduz com lanczos (texto mais nítido)

const browser = await abrirChrome();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: DSF });
const cdp = await page.context().newCDPSession(page);
// captura em JPEG pelo protocolo, no modo rápido: o PNG do page.screenshot custa caro por quadro
const capturar = async () => Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 94, optimizeForSpeed: true })).data, 'base64');
const erros = [];
// erro de script (sintaxe, variável repetida, palavra fora da narração) derruba na hora, sem esperar o tempo-limite.
// A promessa nasce antes do goto: o SyntaxError do script embutido dispara durante o carregamento.
let derrubar;
const erroDePagina = new Promise((_, rej) => { derrubar = rej; });
erroDePagina.catch(() => {});
page.on('pageerror', (e) => { erros.push(String(e)); derrubar(e); });
page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
await page.goto(pathToFileURL(path.resolve(cena)).href);
try {
  await Promise.race([page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 }), erroDePagina]);
} catch (e) {
  console.error('A cena não ficou pronta:\n' + (erros.join('\n') || '(sem erro de página: confira os caminhos dos scripts e das mídias na cena)'));
  await browser.close();
  process.exit(1);
}
const dur = await page.evaluate(() => window.__dur);
if (modo !== 'duracao') console.error(`duração ${dur.toFixed(2)} s`);

if (modo === 'duracao') {
  console.log(dur);   // stdout: só o número, para o ucr ler
} else if (modo === 'sons') {
  const sons = await page.evaluate(() => ({ sons: window.SONS || [], clipes: window.CLIPES || [] }));
  fs.writeFileSync(opt('out', path.join(os.tmpdir(), 'sons.json')), JSON.stringify(sons, null, 1));
  console.error(`${sons.sons.length} efeitos, ${sons.clipes.length} clipes com som`);
} else if (modo === 'stills') {
  const out = opt('out', path.join(os.tmpdir(), 'stills'));
  fs.mkdirSync(out, { recursive: true });
  for (const t of lista.split(',').map(Number)) {
    await page.evaluate((t) => window.__seek(t), t);
    await page.screenshot({ path: path.join(out, `t${t.toFixed(2).padStart(6, '0')}.png`) });
  }
} else if (modo === 'zonas') {
  // textos visíveis fora da zona segura (topo e base, fração do quadro), de passo em passo
  const z = await page.evaluate(() => window.FORMATO?.zonas || { topo: .14, base: .25 });
  const passo = parseFloat(opt('passo', '0.5')), topo = parseFloat(opt('topo', z.topo)), base = parseFloat(opt('base', z.base));
  const achados = [];
  for (let t = 0; t < dur; t += passo) {
    await page.evaluate((t) => window.__seek(t), t);
    const fora = await page.evaluate(({ W, H, topo, base }) => {
      const y0 = H * topo, y1 = H * (1 - base), r = [], vistos = new Set();
      // o aviso sai por bloco de texto (a frase), não por palavra: a cena anima palavra a palavra em spans separados
      const bloco = (e) => { while (e.parentElement && getComputedStyle(e).display.startsWith('inline')) e = e.parentElement; return e; };
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const el = n.parentElement;
        if (!n.textContent.trim() || !el || !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
        const b = bloco(el);
        if (vistos.has(b)) continue;
        const rg = document.createRange(); rg.selectNodeContents(n);
        for (const q of rg.getClientRects()) {
          if (q.width < 2 || q.height < 2 || q.right <= 0 || q.left >= W || q.bottom <= 0 || q.top >= H) continue;   // fora do quadro
          if (q.top < y0 || q.bottom > y1) {
            vistos.add(b);
            r.push({ texto: b.textContent.replace(/\s+/g, ' ').trim().slice(0, 48), y: Math.round(q.top), y2: Math.round(q.bottom), zona: q.top < y0 ? 'topo' : 'base' });
            break;
          }
        }
      }
      return r;
    }, { W, H, topo, base });
    for (const f of fora) achados.push({ t: +t.toFixed(2), ...f });
  }
  fs.writeFileSync(opt('out', path.join(os.tmpdir(), 'zonas.json')), JSON.stringify({ topo, base, passo, achados }, null, 1));
  console.error(`${achados.length} ocorrências de texto fora da zona segura`);
} else if (modo === 'video') {
  const fps = parseInt(opt('fps', '60'));
  const total = Math.round(dur * fps);
  // borrão de movimento: MB amostras por quadro, espalhadas por meio intervalo (obturador de 180 graus), e a média no ffmpeg.
  // --borrao auto (padrão): amostras extras só nas janelas da cena (window.BORRAO; cena sem janela = vídeo todo); 'tudo' | 'nada'.
  // Fora da janela o quadro é tirado uma vez e repetido MB vezes, então o tmix devolve o mesmo quadro.
  const MB = parseInt(opt('mb', process.env.MB || '1')), OBT = .5;
  const modoBorrao = opt('borrao', process.env.BORRAO || 'auto');
  const janelas = MB > 1 && modoBorrao === 'auto' ? await page.evaluate(() => window.BORRAO || []) : [];
  const comBorrao = (t) => MB > 1 && modoBorrao !== 'nada' && (modoBorrao === 'tudo' || !janelas.length || janelas.some(([a, b]) => t >= a && t <= b));
  // --sem-perda: pedaço intermediário em H.264 sem perda (.mkv); o encode com perda acontece uma vez só, na entrega
  const semPerda = args.includes('--sem-perda');
  // o JPEG do Chrome é BT.601 em faixa cheia; a entrega é BT.709 em faixa limitada e marcada (sem isso saía yuvj420p/pc/bt470bg).
  // A conversão é no filtro colorspace: pelo scale (swscale) o quadro saía ~2,5 níveis mais escuro. Primárias e gama não mudam.
  const escala = `scale=${W}:${H}:flags=lanczos,colorspace=space=bt709:primaries=bt709:trc=bt709:range=tv:ispace=bt470bg:iprimaries=bt709:itrc=bt709:irange=pc:format=yuv420p,setparams=range=tv:colorspace=bt709:color_primaries=bt709:color_trc=bt709`;
  const filtro = MB > 1 ? `tmix=frames=${MB},select='eq(mod(n+1\\,${MB})\\,0)',setpts=N/(${fps}*TB),${escala}` : escala;
  const codec = semPerda ? ['-c:v', 'libx264', '-preset', 'veryfast', '-qp', '0'] : ['-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-profile:v', 'high'];

  async function trecho(f0, f1, base) {
    const saida = base + (semPerda ? '.mkv' : '.mp4');
    const enc = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps * MB), '-c:v', 'mjpeg', '-i', '-',
      '-threads', '4', '-vf', filtro, ...codec, '-r', String(fps), saida], { stdio: ['pipe', 'inherit', 'inherit'] });
    const fechou = new Promise((r) => enc.on('close', r));
    const escrever = async (buf) => { if (!enc.stdin.write(buf)) await new Promise((r) => enc.stdin.once('drain', r)); };
    const t0 = Date.now();
    let capturas = 0;
    for (let f = f0; f < f1; f++) {
      if (comBorrao(f / fps)) {
        for (let k = 0; k < MB; k++) {
          await page.evaluate((t) => window.__seek(t), f / fps + (k / MB) * (OBT / fps));
          await escrever(await capturar()); capturas++;
        }
      } else {
        await page.evaluate((t) => window.__seek(t), f / fps);
        const buf = await capturar(); capturas++;
        for (let k = 0; k < MB; k++) await escrever(buf);
      }
      if ((f - f0) % (fps * 5) === 0) console.error(`quadro ${f - f0}/${f1 - f0} · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    }
    enc.stdin.end();
    const codigo = await fechou;
    if (codigo !== 0) throw new Error(`ffmpeg saiu com código ${codigo} em ${saida}`);
    console.error(`${path.basename(saida)}: ${f1 - f0} quadros, ${capturas} capturas, pronto em ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }

  // um trecho (--f0 --f1 --out) ou vários com o mesmo navegador (--lista "f0:f1:base;f0:f1:base")
  const pedidos = opt('lista', '')
    ? opt('lista').split(';').filter(Boolean).map((s) => { const [a, b, ...o] = s.split(':'); return [parseInt(a), Math.min(parseInt(b), total), o.join(':')]; })
    : [[parseInt(opt('f0', '0')), Math.min(parseInt(opt('f1', String(total))), total), opt('out', path.join(os.tmpdir(), 'cena'))]];
  if (MB > 1 && modoBorrao === 'auto') console.error(janelas.length ? `borrão em ${janelas.length} janelas da cena` : 'cena sem janela de borrão: borrão no vídeo todo');
  try {
    for (const [f0, f1, base] of pedidos) await trecho(f0, f1, base);
  } catch (e) {
    console.error(String(e)); process.exitCode = 1;
  }
}
if (erros.length) console.error('ERROS NA PÁGINA:\n' + erros.join('\n'));
await browser.close();
