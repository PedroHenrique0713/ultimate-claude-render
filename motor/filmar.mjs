// Filma telas reais da plataforma para o motion: para cada tomada, abre a rota logada, executa ações (clicar,
// esperar, rolar), esconde o que não é produto (botão de dev do Next, aviso de ambiente local, tour) e grava:
//   <id>.png          a tela (página inteira ou só a dobra)
//   <id>-vazio.png    a mesma tela sem os elementos marcados (para o motion trazer os elementos de fora)
//   <id>.json         viewport, escala e o retângulo de cada elemento marcado, em px CSS
//   <id>-<nome>-<i>.png  o recorte de cada elemento
// Uso: node filmar.mjs <plano.json> <saida> [ids separados por vírgula]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { abrirChrome } from './chrome.mjs';

const [planoArq, OUT, so] = process.argv.slice(2);
const plano = JSON.parse(fs.readFileSync(planoArq, 'utf8'));
// base local: "base": "app" (pasta relativa ao plano) vira file:// e as rotas são arquivos ("url": "index.html")
if (!/^https?:|^file:/.test(plano.base)) plano.base = pathToFileURL(path.resolve(path.dirname(path.resolve(planoArq)), plano.base)).href;
fs.mkdirSync(OUT, { recursive: true });
const ESCONDER = `html, body, main { scroll-behavior: auto !important; }
  nextjs-portal, [data-nextjs-toast], [data-nextjs-dev-tools-button] { display: none !important; }
  *, *::before, *::after { caret-color: transparent !important; }`;
const DISPOSITIVO = {
  desk: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  cel: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};

const b = await abrirChrome();
const sessoes = {};
async function pagina(disp, logado) {
  const chave = disp + (logado ? '-in' : '-out');
  if (sessoes[chave]) return sessoes[chave];
  const ctx = await b.newContext({ ...DISPOSITIVO[disp], locale: 'pt-BR' });
  const p = await ctx.newPage();
  if (logado && plano.login) {
    // login genérico: plano.login = { url, campos: [{ css, valor }], enviar: css, depois: regex da URL de destino }
    const L = plano.login;
    await p.goto(plano.base + (L.url || '/login'), { waitUntil: 'networkidle' });
    for (const c of L.campos || []) await p.locator(c.css).fill(c.valor);
    await p.locator(L.enviar || 'button[type="submit"]').first().click();
    if (L.depois) await p.waitForURL(new RegExp(L.depois), { timeout: 60000 });
  }
  return (sessoes[chave] = p);
}

async function limpar(p) {
  for (const t of plano.fechar || ['Pular tour', 'Fechar tour', 'Agora não', 'Pular']) {
    const x = p.getByRole('button', { name: t }).first();
    if (await x.count() && await x.isVisible().catch(() => false)) { await x.click({ force: true }).catch(() => {}); await p.waitForTimeout(300); }
  }
  await p.addStyleTag({ content: ESCONDER });
  // avisos que só existem na bancada local (sem chave de provedor)
  await p.evaluate((frases) => {
    for (const el of document.querySelectorAll('p, span, div')) {
      if (el.children.length === 0 && frases.some((f) => el.textContent.includes(f))) el.style.visibility = 'hidden';
    }
  }, plano.esconderTextos || []);
  // valores borrados (a /brands não publica preço): folhas cujo texto casa com algum padrão
  if (plano.borrar && p.__borrar) await p.evaluate((pads) => {
    const res = pads.map((x) => new RegExp(x));
    for (const el of document.querySelectorAll('p, span, div, b, strong, dd, td')) {
      if (el.children.length === 0 && res.some((r) => r.test(el.textContent))) el.style.filter = 'blur(7px)';
    }
  }, plano.borrar);
}

function alvo(p, e) {
  if (e.css) return p.locator(e.css);
  if (e.texto) return p.getByText(e.texto, { exact: !!e.exato });
  if (e.papel) return p.getByRole(e.papel, { name: e.rotulo });
  throw new Error('elemento sem seletor: ' + JSON.stringify(e));
}

for (const t of plano.tomadas) {
  if (so && !so.split(',').includes(t.id)) continue;
  const p = await pagina(t.dispositivo, t.logado !== false);
  p.__borrar = !!t.borrar;
  // Desktop com janela alta em vez de página inteira: o cabeçalho e a barra lateral são fixos e a captura
  // de página inteira os repete no meio da imagem.
  await p.setViewportSize({ width: DISPOSITIVO[t.dispositivo].viewport.width, height: t.altura || DISPOSITIVO[t.dispositivo].viewport.height });
  await p.goto(plano.base + t.url, { waitUntil: 'networkidle', timeout: 120000 });
  await p.waitForTimeout(t.esperar ?? 2500);
  await limpar(p);
  for (const a of t.acoes || []) {
    if (a.clicar) { await alvo(p, a.clicar).first().click({ force: true }); }
    if (a.esperar) await p.waitForTimeout(a.esperar);
    if (a.rolar !== undefined) await p.evaluate((y) => window.scrollTo(0, y), a.rolar);
    if (a.css) await p.addStyleTag({ content: a.css });
    await limpar(p);
  }
  // espera a rolagem automática do app assentar (ela chega depois do clique e mudava a tela entre medir e fotografar)
  let ant = -1;
  for (let k = 0; k < 20; k++) { const y = await p.evaluate(() => [...document.querySelectorAll('*')].reduce((s, e) => s + e.scrollTop, scrollY)); if (y === ant) break; ant = y; await p.waitForTimeout(350); }
  // Sem forçar o topo: o app rola sozinho até o elemento clicado e devolve a rolagem depois de qualquer reset;
  // mede e fotografa no estado em que a tela ficou.
  if (t.topo) { await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(400); }
  const meta = { id: t.id, url: t.url, dispositivo: t.dispositivo, ...DISPOSITIVO[t.dispositivo],
    pagina: await p.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight })), elementos: {} };
  const marcados = [], recortes = [];
  for (const e of t.elementos || []) {
    const loc = alvo(p, e);
    const n = Math.min(await loc.count(), e.max ?? 99);
    meta.elementos[e.nome] = [];
    for (let i = 0; i < n; i++) {
      const el = loc.nth(i);
      // página inteira: coordenada de página; só a janela: coordenada da janela (a tela pode ter rolado sozinha ao clicar)
      // cartao: sobe até o componente que tem borda e canto arredondado, para o recorte sair pela borda dele
      const r = await el.evaluate((d, [inteira, cartao, subir]) => {
        let n = d;
        if (cartao) { let e = d; for (let k = 0; e && k < 10; k++, e = e.parentElement) { const cs = getComputedStyle(e); if (parseFloat(cs.borderTopLeftRadius) >= 10 && parseFloat(cs.borderTopWidth) >= 1) { n = e; break; } } }
        for (let k = 0; k < (subir || 0) && n.parentElement; k++) n = n.parentElement;
        const b = n.getBoundingClientRect(); return { x: b.x + (inteira ? scrollX : 0), y: b.y + (inteira ? scrollY : 0), w: b.width, h: b.height };
      }, [!!t.paginaInteira, !!e.cartao, e.subir || 0]);
      if (r.w < 2 || r.h < 2) continue;
      meta.elementos[e.nome].push(r);
      if (e.recortar !== false) recortes.push([el, `${OUT}/${t.id}-${e.nome}-${meta.elementos[e.nome].length - 1}.png`]);
      if (e.tirarDoVazio) marcados.push(el);
    }
  }
  await p.screenshot({ path: `${OUT}/${t.id}.png`, fullPage: !!t.paginaInteira, animations: 'disabled' });
  if (marcados.length) {
    for (const el of marcados) await el.evaluate((d) => { d.dataset.filmarOculto = d.style.visibility; d.style.visibility = 'hidden'; });
    await p.screenshot({ path: `${OUT}/${t.id}-vazio.png`, fullPage: !!t.paginaInteira, animations: 'disabled' });
    for (const el of marcados) await el.evaluate((d) => { d.style.visibility = d.dataset.filmarOculto || ''; });
  }
  // recortes por último: element.screenshot() rola a página até o elemento e estragava a foto principal
  for (const [el, arq] of recortes) await el.screenshot({ path: arq, animations: 'disabled' });
  fs.writeFileSync(`${OUT}/${t.id}.json`, JSON.stringify(meta, null, 2));
  console.log('ok', t.id, JSON.stringify(Object.fromEntries(Object.entries(meta.elementos).map(([k, v]) => [k, v.length]))));
}
await b.close();
