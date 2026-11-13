// Ultimate Claude Render — motor. Uma página HTML vira vídeo: a timeline GSAP é a fonte da verdade e o render
// (render.mjs) pede cada quadro por window.__seek(t). Tudo que mexe tem de depender só de t: tweens na timeline,
// fundo e contadores desenhados por t (M.ATUALIZAR), vídeo como sequência de quadros trocada por t.
//
// Peças: fundo, camera, marca, legendas, grande, celular, janela, terminal, foto, video, recorte, cursor, clicar, tocar, luz, som, T, batida, iniciar.
// Cores, fonte e formato vêm do tema.js (marca.json + projeto.json); nada aqui é de uma marca.
window.M = (() => {
  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, cls, estilo, pai) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    Object.assign(e.style, estilo || {});
    if (pai) pai.appendChild(e);
    return e;
  };
  const px = (v) => v + 'px';
  const F = window.FORMATO || { W: 1080, H: 1920, leg: {}, zonas: {} };
  const W = F.W, H = F.H;
  const MARCA = window.MARCA || {};
  const tl = gsap.timeline({ paused: true, defaults: { ease: 'power3.out', duration: .8 } });

  // palco e cena: a página só precisa de <script> no fim do body
  const palco = $('#palco') || el('div', '', {}, document.body); palco.id = 'palco';
  const cena = $('#cena') || el('div', '', {}, palco); cena.id = 'cena';

  // ── efeitos sonoros e clipes: a cena marca, o mix põe o som ──
  const SONS = window.SONS = [];      // {t, tipo, ganho}: whoosh, impacto, clique, brilho, subida, obturador, pop, tecla, grave, papel (ou pasta em midia/sfx/)
  const CLIPES = window.CLIPES = [];  // {nome, t, inicio, dur, ganho}: o áudio de um vídeo inserido, no instante em que ele entra
  // janelas [t0, t1] com borrão de movimento: o render só tira as amostras extras dentro delas.
  // whoosh e impacto marcam movimento rápido e abrem janela sozinhos (window.BORRAO_AUTO = false desliga).
  const BORRAO = window.BORRAO = [];
  const borrao = (t0, t1) => BORRAO.push([+t0.toFixed(3), +t1.toFixed(3)]);
  const JANELA_SOM = { whoosh: [-.1, .8], impacto: [-.05, .35] };
  const som = (t, tipo, ganho = 1) => {
    SONS.push({ t: +t.toFixed(3), tipo, ganho });
    const j = JANELA_SOM[tipo];
    if (j && window.BORRAO_AUTO !== false) borrao(t + j[0], t + j[1]);
  };

  // ── tempo pela fala: M.T('sua coleção') devolve o início da 1ª ocorrência dessas palavras na narração ──
  // Âncora em palavra, não em índice de frase: trocar ou cortar uma frase não desloca o resto da cena.
  // n escolhe a ocorrência; fim = true devolve o fim da última palavra.
  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  function fala(texto, n = 0) {
    const ws = (window.TEMPOS?.frases || []).flatMap((f, i) => f.palavras.map((w) => ({ ...w, i, k: norm(w.t) })));
    const alvo = texto.split(/\s+/).map(norm).filter(Boolean);
    const achados = [];
    for (let s = 0; s + alvo.length <= ws.length; s++) {
      if (alvo.every((p, j) => ws[s + j].k.startsWith(p))) achados.push({ a: ws[s].a, b: ws[s + alvo.length - 1].b, frase: ws[s].i });
    }
    if (!achados[n]) throw new Error(`"${texto}" não está na narração` + (achados.length ? ` (só ${achados.length} ocorrência(s))` : ''));
    return achados[n];
  }
  const T = (texto, n = 0, fim = false) => fala(texto, n)[fim ? 'b' : 'a'];

  // batida da trilha mais próxima de t (window.BATIDAS, gerado pelo mix); fora da janela devolve t
  function batida(t, janela = .08) {
    const bs = window.BATIDAS?.t;
    if (!bs?.length) return t;
    let melhor = t, d = janela;
    for (const b of bs) { if (Math.abs(b - t) <= d) { d = Math.abs(b - t); melhor = b; } }
    return melhor;
  }
  const ATUALIZAR = [];   // funções f(t) chamadas a cada quadro (céu, respiração, contadores, digitação)

  // ── fundo: céu de estrelas que deriva, auras que respiram. O grão de filme entra no ffmpeg (ACABAMENTO) ──
  let semente = 11;
  const aleatorio = () => (semente = (semente * 16807) % 2147483647) / 2147483647;
  function fundo({ estrelas = true, auras = true, n = 260 } = {}) {
    const corEstrela = window.COR?.texto || '#fff';
    let c = null, lista = [];
    if (estrelas) {
      const ceu = el('canvas', '', {}, palco); ceu.id = 'ceu'; ceu.width = W; ceu.height = H;
      lista = Array.from({ length: n }, () => ({ x: aleatorio() * W, y: aleatorio() * H, r: .5 + aleatorio() * 1.6, a: .1 + aleatorio() * .5,
        v: .4 + aleatorio() * 1.6, f: aleatorio() * 6.28, d: 4 + aleatorio() * 14 }));
      c = ceu.getContext('2d');
    }
    if (auras) { el('div', 'aura', {}, palco).id = 'aura-a'; el('div', 'aura', {}, palco).id = 'aura-b'; }
    el('div', '', {}, palco).id = 'vinheta';
    ATUALIZAR.push((t) => {
      if (c) {
        c.clearRect(0, 0, W, H);
        c.fillStyle = corEstrela;
        for (const e of lista) {
          c.globalAlpha = e.a * (.55 + .45 * Math.sin(t * e.v + e.f));
          c.beginPath(); c.arc(e.x, ((e.y - t * e.d) % H + H) % H, e.r, 0, 6.2832); c.fill();
        }
        c.globalAlpha = 1;
      }
      if (auras) {
        const k = W / 1080;
        // as auras respiram e passeiam: é a luz que mexe no quadro inteiro quando o primeiro plano descansa
        const ra = 1 + .12 * Math.sin(t * .9), rb = 1 + .14 * Math.cos(t * .7);
        $('#aura-a').style.transform = `translate(${(-140 + 220 * Math.sin(t * .33)) * k}px, ${(420 + 260 * Math.cos(t * .27)) * (H / 1920)}px) scale(${ra})`;
        $('#aura-b').style.transform = `translate(${(560 + 180 * Math.cos(t * .31)) * k}px, ${(1120 + 240 * Math.sin(t * .23)) * (H / 1920)}px) scale(${rb})`;
      }
    });
  }

  // marca no topo: logo + nome (de marca.json)
  function marca({ nome = MARCA.nome, logo = MARCA.logo } = {}) {
    const m = el('div', '', {}, palco); m.id = 'marca';
    if (logo) el('img', '', {}, m).src = logo;
    if (nome) el('span', '', {}, m).textContent = nome;
    return m;
  }

  // ── texto: separa em palavras para animar uma a uma ──
  function palavras(e) {
    const txt = e.textContent; e.textContent = '';
    return txt.split(/(\s+)/).map((p) => {
      if (/^\s+$/.test(p)) { e.appendChild(document.createTextNode(' ')); return null; }
      const s = el('span', 'p', { display: 'inline-block' }, e); s.textContent = p; return s;
    }).filter(Boolean);
  }

  // ── legendas: cada frase vira blocos de até ~7 palavras, quebrados na pontuação; a palavra acende quando é dita ──
  // slam: o bloco entra inteiro e cada palavra bate (escala e assenta); a palavra-chave bate mais forte, girada.
  // chaves: palavras (início) que ganham a cor de destaque. jaNaTela: blocos já escritos no quadro 0 (o que o feed mostra antes do play).
  function legendas(frases, { de = 0, ate = frases.length - 1, chaves = [], jaNaTela = 0, slam = false } = {}) {
    const caixa = $('#legendas') || (() => { const e = el('div', '', {}, palco); e.id = 'legendas'; return e; })();
    const blocos = [];
    const partir = (ws) => {   // bloco sem pontuação com mais de 9 palavras é partido ao meio
      if (ws.length <= 9) return [ws];
      let melhor = -1;
      ws.forEach((w, k) => { if (k >= 2 && k <= ws.length - 3 && /[,:;…]$|\.\.\.$/.test(w.t) && Math.abs(k + 1 - ws.length / 2) < Math.abs(melhor + 1 - ws.length / 2)) melhor = k; });
      const k = melhor >= 0 ? melhor + 1 : Math.ceil(ws.length / 2);
      return [...partir(ws.slice(0, k)), ...partir(ws.slice(k))];
    };
    for (let i = de; i <= ate; i++) {
      const ws = frases[i].palavras;
      const grupos = [];
      let atual = [];
      ws.forEach((w, k) => { atual.push(w); if (/[,:;…]$|\.\.\.$/.test(w.t) && atual.length >= 4 && ws.length - k - 1 >= 3) { grupos.push(atual); atual = []; } });
      if (atual.length) grupos.push(atual);
      const juntos = [];   // junta grupos curtos vizinhos se couberem em 9 palavras
      for (const g of grupos) { const u = juntos[juntos.length - 1]; if (u && u.length + g.length <= 9 && u.length < 5) juntos[juntos.length - 1] = u.concat(g); else juntos.push(g); }
      juntos.forEach((g) => blocos.push(...partir(g)));
    }
    blocos.forEach((b, i) => {
      const d = el('div', 'leg', {}, caixa);
      const spans = b.map((w, k) => {
        const s = el('span', 'p' + (chaves.some((c) => w.t.toLowerCase().startsWith(c)) ? ' chave' : ''), {}, d);
        s.textContent = w.t;
        if (k < b.length - 1) d.appendChild(document.createTextNode(' '));
        return s;
      });
      // entra 0,12 s antes da primeira palavra; sai inteiro antes do próximo entrar (nunca dois blocos na tela)
      const ini = b[0].a - .12, prox = blocos[i + 1] ? blocos[i + 1][0].a - .12 : b[b.length - 1].b + .8;
      const fim = Math.min(prox - .2, b[b.length - 1].b + 1.2);
      if (i < jaNaTela) { gsap.set(d, { opacity: 1 }); gsap.set(spans, { opacity: 1 }); }
      else if (slam) tl.set(d, { opacity: 1 }, ini);
      else tl.fromTo(d, { opacity: 0, y: 26, filter: 'blur(10px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: .26, ease: 'power2.out', immediateRender: false }, ini);
      b.forEach((w, k) => {
        if (!slam) { tl.to(spans[k], { opacity: 1, duration: .14, ease: 'none' }, w.a - .04); return; }
        const ch = spans[k].classList.contains('chave');
        tl.fromTo(spans[k], { opacity: 0, scale: ch ? 1.9 : 1.55, y: 16, rotation: ch ? -8 : 0 },
          { opacity: 1, scale: 1, y: 0, rotation: ch ? -2 : 0, duration: .2, ease: 'back.out(2.4)', immediateRender: false }, w.a - .06);
        if (ch) som(w.a - .06, 'clique', .3);
      });
      tl.to(d, slam ? { opacity: 0, y: -18, duration: .14, ease: 'power2.in' } : { opacity: 0, y: -18, filter: 'blur(8px)', duration: .18, ease: 'power2.in' }, fim);
    });
  }

  // ── frase grande: as palavras entram uma a uma (mola), ficam e saem juntas ──
  function grande(texto, { t, fim, y = H * .42, tam = 120, cor, pai = cena, destaque = [] } = {}) {
    const e = el('div', 'grande', { top: px(y), fontSize: px(tam), color: cor || '', opacity: 1, zIndex: 40 }, pai);
    e.textContent = texto;
    const ps = palavras(e);
    ps.forEach((p) => { if (destaque.some((d) => p.textContent.toLowerCase().startsWith(d))) p.style.color = 'var(--destaque)'; });
    tl.fromTo(ps, { opacity: 0, y: 46, scale: .9 }, { opacity: 1, y: 0, scale: 1, duration: .5, ease: 'back.out(1.8)', stagger: .09, immediateRender: false }, t);
    tl.set(e, { opacity: 1 }, 0);
    if (fim != null) tl.to(e, { opacity: 0, y: -30, duration: .3, ease: 'power2.in' }, fim);
    gsap.set(ps, { opacity: 0 });
    return e;
  }

  // ── celular: moldura de CSS (sem imagem de fabricante) ou a sua, em marca.celular.moldura ──
  // Canvas 1350 × 2760 (tela 1206 × 2622 = 402 × 874 pt); B é a escala.
  function celular(pai, { x, y, B = .46, id, moldura } = {}) {
    const Wc = 1350 * B, Hc = 2760 * B;
    const SX = 72 * B, SY = 69 * B, SW = 1206 * B, SH = 2622 * B, RAIO = 186 * B, P = SW / 402;
    const STATUS = 62 * P;
    const c = el('div', 'celular', { left: px(x), top: px(y), width: px(Wc), height: px(Hc) }, pai); if (id) c.id = id;
    const f = el('div', 'flutua', {}, c);
    el('div', 'sombra', { left: px(30), right: px(30), top: px(40), bottom: px(20) }, f);
    const tela = el('div', 'tela', { left: px(SX), top: px(SY), width: px(SW), height: px(SH), borderRadius: px(RAIO) }, f);
    const status = el('div', 'status', { height: px(STATUS) }, tela);
    const hora = el('div', 'hora', { left: px(20 * P), width: px(110 * P), top: px(19 * P), fontSize: px(17 * P), lineHeight: px(22 * P) }, status); hora.textContent = '9:41';
    status.insertAdjacentHTML('beforeend', `<svg viewBox="0 0 78 13" style="left:${296 * P}px;top:${24 * P}px;width:${78 * P}px;height:${13 * P}px">
      <g fill="#fff"><rect x="0" y="8.5" width="3" height="4" rx=".9"/><rect x="4.6" y="6.2" width="3" height="6.3" rx=".9"/><rect x="9.2" y="3.6" width="3" height="8.9" rx=".9"/><rect x="13.8" y="1" width="3" height="11.5" rx=".9"/></g>
      <g transform="translate(46 .5)"><rect x=".5" y=".5" width="24" height="11.5" rx="3.6" fill="none" stroke="#fff" stroke-opacity=".45"/><rect x="2.3" y="2.3" width="17.6" height="7.9" rx="2" fill="#fff"/></g></svg>`);
    const app = el('div', 'app', { top: px(STATUS), height: px(SH - STATUS) }, tela);
    el('div', 'ilha', { width: px(126 * P), height: px(37 * P), top: px(11 * P), marginLeft: px(-63 * P) }, tela);
    el('div', 'home', { bottom: px(8 * P), width: px(140 * P), height: px(5 * P), marginLeft: px(-70 * P) }, tela).style.zIndex = 9;
    const dedo = el('div', 'dedo', { width: px(46 * P), height: px(46 * P), marginLeft: px(-23 * P), marginTop: px(-23 * P) }, tela);
    el('div', 'reflexo', { borderRadius: px(RAIO) }, tela);
    const img = moldura || MARCA.celular?.moldura;
    if (img) { const m = el('img', 'moldura', { width: px(Wc), height: px(Hc) }, f); m.src = img; }
    else {   // anel de CSS: o box-shadow com spread segue o raio e desenha a borda do aparelho em volta da tela
      const e1 = 40 * B, e2 = 12 * B;
      el('div', 'moldura', { left: px(SX), top: px(SY), width: px(SW), height: px(SH), borderRadius: px(RAIO),
        boxShadow: `0 0 0 ${e1}px #0c0c0e, 0 0 0 ${e1 + e2}px #55565c, 0 0 0 ${e1 + e2 + 3 * B}px #1c1c1f` }, f);
    }
    const K = SW / 390;   // css px do app capturado (390 de largura) → px do palco dentro da tela
    const pagina = (src) => { const i = el('img', 'pg', {}, app); i.src = src; return i; };
    const noPalco = (cx, cy, rolagem = 0) => [x + SX + cx * K, y + SY + STATUS + (cy - rolagem) * K];
    return { c, f, tela, app, dedo, K, STATUS, SX, SY, SW, SH, W: Wc, H: Hc, pagina, noPalco };
  }

  // ── janela de navegador (o desktop): conteúdo é uma captura de 1440 de largura ──
  function janela(pai, { x, y, largura = 960, altura = 667, url = MARCA.url || 'exemplo.com', id }) {
    const BAR = 46;
    const j = el('div', 'janela', { left: px(x), top: px(y), width: px(largura), height: px(altura + BAR) }, pai); if (id) j.id = id;
    const f = el('div', 'flutua', {}, j);
    const corpo = el('div', 'corpo', {}, f);
    const barra = el('div', 'barra', {}, corpo);
    ['#E36B5A', '#E2B54A', '#62B862'].forEach((cor, i) => el('i', '', { left: px(18 + i * 22), background: cor }, barra));
    const u = el('div', 'url', {}, barra); u.textContent = url;
    const conteudo = el('div', 'conteudo', {}, corpo);
    el('div', 'brilho', {}, corpo);
    const K = largura / 1440;
    const pagina = (src, estilo) => { const i = el('img', 'pg', estilo || {}, conteudo); i.src = src; return i; };
    const noPalco = (cx, cy, rolagem = 0) => [x + cx * K, y + BAR + (cy - rolagem) * K];
    return { j, f, corpo, conteudo, url: u, K, BAR, x, y, largura, altura, pagina, noPalco };
  }

  // ── terminal: linhas que aparecem ou são digitadas, sempre em função de t (nada de setInterval) ──
  // linhas: [{ t, texto, prefixo: '$ ', classe: 'ok'|'ap'|'pr', vel: 26 (caracteres/s; 0 = aparece inteira) }]
  function terminal(pai, { x, y, largura = 900, altura = 520, titulo = 'terminal', linhas = [], som: comSom = true, cursor: comCursor = true } = {}) {
    const e = el('div', 'terminal', { left: px(x), top: px(y), width: px(largura), height: px(altura) }, pai);
    const barra = el('div', 'barra', {}, e);
    ['#E36B5A', '#E2B54A', '#62B862'].forEach((cor, i) => el('i', '', { left: px(22 + i * 24), background: cor }, barra));
    el('b', '', {}, barra).textContent = titulo;
    const corpo = el('div', 'corpo', {}, e);
    const itens = linhas.map((l) => {
      const d = el('span', 'l', { display: 'none' }, corpo);
      const pre = l.prefixo ? el('span', 'pr', {}, d) : null; if (pre) pre.textContent = l.prefixo;
      const txt = el('span', l.classe || '', {}, d);
      const vel = l.vel ?? (l.prefixo ? 26 : 0);
      if (vel && comSom) for (let k = 0; k < l.texto.length; k += 2) som(l.t + k / vel, 'tecla', .5);
      return { ...l, d, txt, vel };
    });
    const cur = comCursor ? el('i', 'cur', {}) : null;
    ATUALIZAR.push((t) => {
      let ultimo = null;
      for (const l of itens) {
        const vis = t >= l.t;
        l.d.style.display = vis ? 'block' : 'none';
        if (!vis) continue;
        const n = l.vel ? Math.min(l.texto.length, Math.floor((t - l.t) * l.vel)) : l.texto.length;
        l.txt.textContent = l.texto.slice(0, n);
        ultimo = l;
      }
      if (cur && ultimo) { ultimo.d.appendChild(cur); cur.style.opacity = (Math.floor(t * 2.2) % 2 === 0 || (ultimo.vel && t - ultimo.t < ultimo.texto.length / ultimo.vel)) ? 1 : 0; }
      else if (cur) cur.style.opacity = 0;
    });
    return { e, corpo };
  }

  // ── cursor de mouse e clique com onda (coordenadas do pai) ──
  const SETA = `<svg viewBox="0 0 34 46" width="34" height="46"><path d="M3 2 L3 37 L12 29 L18 43 L24 40 L18 27 L30 27 Z" fill="#fff" stroke="#111" stroke-width="2.4" stroke-linejoin="round"/></svg>`;
  function cursor(pai) { const c = el('div', 'cursor', {}, pai); c.innerHTML = SETA; return c; }
  function clicar(pai, c, x, y, t, { de = null, dur = .7 } = {}) {
    if (de) tl.fromTo(c, { x: de[0], y: de[1], opacity: 0 }, { x, y, opacity: 1, duration: dur, ease: 'power2.inOut', immediateRender: false }, t - dur);
    else tl.to(c, { x, y, opacity: 1, duration: dur, ease: 'power2.inOut' }, t - dur);
    som(t, 'clique');
    tl.to(c, { scale: .82, duration: .08, ease: 'power1.in', transformOrigin: '3px 2px' }, t);
    tl.to(c, { scale: 1, duration: .14, ease: 'power1.out' }, t + .08);
    const o = el('div', 'onda', { left: px(x - 40 + 3), top: px(y - 40 + 2), width: '80px', height: '80px' }, pai);
    tl.fromTo(o, { scale: .2, opacity: .95 }, { scale: 1.4, opacity: 0, duration: .55, ease: 'power2.out', immediateRender: false }, t);
  }
  // toque de dedo no celular (coordenadas da tela do celular)
  function tocar(cel, x, y, t) {
    tl.set(cel.dedo, { left: x, top: y }, t - .3);
    tl.fromTo(cel.dedo, { opacity: 0, scale: 1.5 }, { opacity: 1, scale: 1, duration: .18, ease: 'power2.out', immediateRender: false }, t - .18);
    som(t, 'clique');
    tl.to(cel.dedo, { scale: .86, duration: .1 }, t);
    tl.to(cel.dedo, { opacity: 0, scale: 1.2, duration: .25, ease: 'power2.in' }, t + .12);
  }

  // ── câmera: a cena inteira balança em 3D, para nada ficar parado (o QA reprova composição parada por 1,5 s) ──
  // A perspectiva vai no transform do próprio #cena (transformPerspective): sem ela, girar o #cena só o achata.
  function camera({ rotY = 3, rotX = 1.4, periodoY = 5.2, periodoX = 7.4, zoom = 0, perspectiva = 2400, ate = window.TEMPOS?.total || 60 } = {}) {
    gsap.set(cena, { transformPerspective: perspectiva, transformOrigin: '50% 50%' });
    if (rotY) tl.fromTo(cena, { rotationY: -rotY }, { rotationY: rotY, duration: periodoY / 2, ease: 'sine.inOut', yoyo: true, repeat: Math.ceil(ate / (periodoY / 2)), immediateRender: false }, 0);
    if (rotX) tl.fromTo(cena, { rotationX: rotX }, { rotationX: -rotX, duration: periodoX / 2, ease: 'sine.inOut', yoyo: true, repeat: Math.ceil(ate / (periodoX / 2)), immediateRender: false }, 0);
    if (zoom) tl.fromTo(cena, { scale: 1 }, { scale: 1 + zoom, duration: ate, ease: 'none', immediateRender: false }, 0);
  }

  // ── mídia inserida: foto e vídeo ──
  // O `ucr midia` converte cada arquivo de midia/ e escreve o manifesto window.MIDIA (midia/midia.js):
  //   foto  → { tipo: 'foto', src, w, h }
  //   vídeo → { tipo: 'video', pasta, n, fps, dur, w, h, audio }  (quadros JPEG: trocar o src custa ~10 ms; o seek de <video> custava 250 a 500 ms por quadro)
  const manifesto = (nome) => {
    const m = (window.MIDIA || {})[nome];
    if (!m) throw new Error(`mídia "${nome}" não está no manifesto: ponha o arquivo em midia/ e rode "ucr midia"`);
    return m;
  };

  // foto com entrada e saída suaves e movimento lento de câmera (zoom e deriva). Preenche a caixa (cover);
  // PNG com transparência (logo, produto recortado) fica inteiro (contain), sem fundo nem sombra de cartão.
  function foto(pai, nome, { x = 0, y = 0, w = W, h = H, de = 0, ate, zoom = [1, 1.1], deriva = [0, 0], raio = 0, entrada = .45, saida = .35, sombra, ajuste, z } = {}) {
    const m = manifesto(nome);
    const cartao = !m.alfa;
    const caixa = el('div', 'midia', { left: px(x), top: px(y), width: px(w), height: px(h), borderRadius: px(raio), opacity: 0, zIndex: z ?? '',
      boxShadow: (sombra ?? cartao) ? '' : 'none', background: cartao ? '' : 'transparent' }, pai);
    const img = el('img', '', { objectFit: ajuste || (cartao ? 'cover' : 'contain') }, caixa); img.src = m.src;
    const fim = ate ?? de + 4;
    tl.set(caixa, { opacity: 0 }, 0);
    tl.fromTo(caixa, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: entrada, ease: 'power2.out', immediateRender: false }, de);
    tl.fromTo(img, { scale: zoom[0], x: 0, y: 0 }, { scale: zoom[1], x: deriva[0], y: deriva[1], duration: fim - de, ease: 'none', immediateRender: false }, de);
    tl.to(caixa, { opacity: 0, duration: saida, ease: 'power2.in' }, fim - saida);
    return caixa;
  }

  // vídeo como sequência de quadros JPEG (pasta com 0001.jpg…); modo: 'laco' | 'vaivem' | 'uma' (para no último)
  const SEQS = [];
  function sequencia(pai, base, { de, ate, n, fps = 24, inicio = 0, modo = 'laco', estilo } = {}) {
    const i = el('img', '', estilo || {}, pai);
    const s = { i, base, de, ate, n, fps, inicio, modo, atual: 0 };
    SEQS.push(s);
    i.src = `${base}/0001.jpg`;
    return i;
  }
  function quadroDe(s, t) {
    let k = Math.floor(Math.max(0, t - s.de + s.inicio) * s.fps);
    if (s.modo === 'laco') k %= s.n;
    else if (s.modo === 'vaivem') { const p = 2 * s.n - 2; k %= p; if (k >= s.n) k = p - k; }
    else k = Math.min(k, s.n - 1);
    return k + 1;
  }
  async function sincronizarSeqs(t, esperar = true) {
    await Promise.all(SEQS.map((s) => {
      if (t < s.de - .05 || t > s.ate + .05) return null;
      const k = quadroDe(s, t);
      if (k === s.atual) return null;
      s.atual = k; s.i.src = `${s.base}/${String(k).padStart(4, '0')}.jpg`;
      return esperar ? s.i.decode().catch(() => {}) : null;
    }));
  }

  // vídeo inserido no meio da cena. som: true leva o áudio do arquivo para o mix (ganho em `ganho`).
  function video(pai, nome, { x = 0, y = 0, w = W, h = H, de = 0, ate, inicio = 0, laco = false, som: comSom = false, ganho = 1, raio = 0, entrada = .4, saida = .3, sombra = true, z } = {}) {
    const m = manifesto(nome);
    if (m.tipo !== 'video') throw new Error(`"${nome}" é ${m.tipo}, não vídeo`);
    const fim = ate ?? (laco ? de + m.dur - inicio : Math.min(de + m.dur - inicio, de + 60));
    const caixa = el('div', 'midia', { left: px(x), top: px(y), width: px(w), height: px(h), borderRadius: px(raio), opacity: 0, boxShadow: sombra ? '' : 'none', zIndex: z ?? '' }, pai);
    sequencia(caixa, m.pasta, { de, ate: fim, n: m.n, fps: m.fps, inicio, modo: laco ? 'laco' : 'uma' });
    tl.set(caixa, { opacity: 0 }, 0);
    tl.fromTo(caixa, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: entrada, ease: 'power2.out', immediateRender: false }, de);
    tl.to(caixa, { opacity: 0, duration: saida, ease: 'power2.in' }, fim - saida);
    if (comSom && m.audio) CLIPES.push({ nome, audio: m.audio, t: +de.toFixed(3), inicio, dur: +(fim - de).toFixed(3), ganho });
    return caixa;
  }

  const quadro = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  async function iniciar(total = window.TEMPOS?.total) {
    await document.fonts.ready;
    await Promise.all([...document.images].map((i) => (i.complete ? i.decode().catch(() => {}) : new Promise((r) => { i.onload = () => i.decode().then(r, r); i.onerror = r; }))));
    if (tl.duration() < total) tl.to({}, { duration: total - tl.duration() });
    window.__seek = async (t) => { tl.seek(t, false); for (const f of ATUALIZAR) f(t); await sincronizarSeqs(t); await quadro(); };
    await window.__seek(0);
    window.__dur = total;
    window.__ready = true;
    // pré-visualização no navegador (fora do render): toca em tempo real; ?t=20 começa no segundo 20; ?audio=<mix.wav> toca junto
    if (!navigator.webdriver) {
      const q = new URLSearchParams(location.search);
      const t0 = parseFloat(q.get('t') || '0');
      const audio = q.has('audio') ? new Audio(q.get('audio')) : null;
      const inicio = performance.now() - t0 * 1000;
      if (audio) { audio.currentTime = t0; audio.play().catch(() => {}); }
      const passo = () => {
        const t = ((performance.now() - inicio) / 1000) % total;
        tl.seek(t, false); for (const f of ATUALIZAR) f(t); sincronizarSeqs(t, false);
        requestAnimationFrame(passo);
      };
      requestAnimationFrame(passo);
    }
  }

  // faixa de luz que atravessa uma janela (entrada)
  function luz(J, t) {
    const l = el('div', '', { position: 'absolute', top: '-10%', bottom: '-10%', width: '240px', left: '-320px', zIndex: 7, pointerEvents: 'none', transform: 'skewX(-18deg)',
      background: 'linear-gradient(90deg, rgba(255,244,220,0), rgba(255,244,220,.16), rgba(255,244,220,0))' }, J.corpo);
    tl.fromTo(l, { left: -320 }, { left: J.largura + 120, duration: 1.1, ease: 'power2.inOut', immediateRender: false }, t);
  }

  // recorte de uma tela real pela borda de um componente medido (rect em px css), com margem igual em volta
  // larguraCss: largura da página capturada em px css (1440 no desktop, 390 no celular)
  function recorte(pai, src, larguraCss, r, { margem = 16, escala = 1, left = 0, top = 0, rot = 0, raio = 30, classe = 'recorte' } = {}) {
    const x = r.x - margem, y = r.y - margem, w = r.w + 2 * margem, h = r.h + 2 * margem;
    const d = el('div', classe, { left: px(left), top: px(top), width: px(w * escala), height: px(h * escala), borderRadius: px(raio), transform: `rotate(${rot}deg)`, overflow: 'hidden' }, pai);
    el('img', '', { position: 'absolute', left: 0, top: 0, width: px(larguraCss * escala), transformOrigin: '0 0', transform: `translate(${-x * escala}px, ${-y * escala}px)` }, d).src = src;
    d.dataset.x = x; d.dataset.y = y; d.dataset.escala = escala;
    return d;
  }

  return { $, el, px, W, H, palco, cena, tl, ATUALIZAR, som, borrao, fala, T, batida, luz, recorte, fundo, marca, palavras, legendas, grande, camera,
           celular, iphone: celular, janela, terminal, cursor, clicar, tocar, foto, video, sequencia, iniciar };
})();
