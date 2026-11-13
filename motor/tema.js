// Tema: traduz window.MARCA (marca.json) e window.PROJETO (projeto.json) em variáveis CSS, fonte e dimensões do palco.
// Carrega antes do motor.js. É o único lugar que conhece cores e formatos; o resto do motor só lê as variáveis.
(() => {
  const M = window.MARCA || {};
  const P = window.PROJETO || {};

  // formatos: dimensões do palco, a faixa da legenda e a zona segura de cada plataforma (fração do quadro)
  const FORMATOS = {
    vertical:   { W: 1080, H: 1920, leg: { x: 70,  y: 300, h: 300, tam: 60 }, zonas: { topo: .14, base: .25 }, marcaTopo: 1370 },   // Reels, Shorts, TikTok
    horizontal: { W: 1920, H: 1080, leg: { x: 260, y: 790, h: 200, tam: 56 }, zonas: { topo: .06, base: .08 }, marcaTopo: 90 },    // YouTube, site, apresentação
    quadrado:   { W: 1080, H: 1080, leg: { x: 70,  y: 780, h: 220, tam: 54 }, zonas: { topo: .08, base: .12 }, marcaTopo: 100 },    // feed
  };
  const nomeFormato = P.formato && FORMATOS[P.formato] ? P.formato : 'vertical';
  const F = { ...FORMATOS[nomeFormato], nome: nomeFormato };
  if (P.zonas) F.zonas = { ...F.zonas, ...P.zonas };

  const hex = (h) => { h = h.replace('#', ''); if (h.length === 3) h = [...h].map((x) => x + x).join(''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
  const rgba = (h, a) => { const [r, g, b] = hex(h); return `rgba(${r},${g},${b},${a})`; };
  const misturar = (a, b, k) => { const x = hex(a), y = hex(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join(''); };
  const luz = (h) => { const [r, g, b] = hex(h); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };

  const c = { fundo: '#0B0907', breu: '#14110E', texto: '#F4EEE3', destaque: '#E0B570', 'destaque-claro': '#F6DDAE', acento: '#D9826B', ...(M.cores || {}) };
  const aura = M.fundo || {};
  const v = {
    '--W': F.W + 'px', '--H': F.H + 'px',
    '--fundo': c.fundo, '--breu': c.breu, '--texto': c.texto, '--destaque': c.destaque, '--destaque-claro': c['destaque-claro'], '--acento': c.acento,
    '--fundo-centro': c['fundo-centro'] || misturar(c.fundo, c.destaque, .07),
    '--apagado': c.apagado || rgba(c.texto, .58),
    '--linha': c.linha || rgba(c.texto, .14),
    '--vidro': c.vidro || rgba(misturar(c.breu, c.texto, .05), .86),
    '--barra': c.barra || misturar(c.breu, c.texto, .05),
    '--sobre-destaque': c['sobre-destaque'] || (luz(c.destaque) > .5 ? '#1B1510' : '#FFFFFF'),
    '--destaque-fraco': rgba(c.destaque, .16), '--destaque-brilho': rgba(c.destaque, .55),
    '--aura-a-1': rgba(c.destaque, .17), '--aura-a-2': rgba(c.destaque, .08),
    '--aura-b-1': rgba(aura.aura_b || '#8FD9F2', .075), '--aura-b-2': rgba(aura.aura_b || '#8FD9F2', .03),
    '--vinheta': aura.vinheta ?? .55,
    '--leg-x': F.leg.x + 'px', '--leg-y': F.leg.y + 'px', '--leg-h': F.leg.h + 'px', '--leg-tam': (M.legenda?.tamanho ?? F.leg.tam) + 'px',
    '--marca-topo': F.marcaTopo + 'px',
  };
  const raiz = document.documentElement;
  for (const [k, x] of Object.entries(v)) raiz.style.setProperty(k, x);

  // fonte: marca.fonte = { familia, arquivos: { "400": "fonts/x.woff2", ... } } (o prep já resolve os caminhos para .ucr/marca/)
  const f = M.fonte || {};
  const familia = f.familia || 'Inter';
  raiz.style.setProperty('--fonte', `'${familia}'`);
  const faces = Object.entries(f.arquivos || {}).map(([peso, url]) => `@font-face { font-family: '${familia}'; font-weight: ${peso}; src: url(${url}) format('woff2'); font-display: block; }`);
  if (faces.length) { const s = document.createElement('style'); s.textContent = faces.join('\n'); document.head.appendChild(s); }
  if (M.nome && !document.title) document.title = M.nome;

  window.FORMATO = F;
  window.COR = { ...c, rgba, misturar };
})();
