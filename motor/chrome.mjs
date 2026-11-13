// Acha o playwright-core e o Chromium sem caminho fixo: CHROME_PATH → o que o playwright-core instalou → cache do Playwright.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(raiz, 'package.json'));
export const { chromium } = require('playwright-core');

function doCache() {
  const bases = [process.env.PLAYWRIGHT_BROWSERS_PATH, path.join(os.homedir(), '.cache/ms-playwright'), path.join(os.homedir(), 'Library/Caches/ms-playwright'),
    path.join(process.env.LOCALAPPDATA || '', 'ms-playwright')].filter(Boolean);
  const candidatos = [];
  for (const b of bases) {
    if (!fs.existsSync(b)) continue;
    for (const d of fs.readdirSync(b)) {
      if (!/^chromium(_headless_shell)?-\d+$/.test(d)) continue;
      const rev = parseInt(d.split('-').pop());
      for (const rel of ['chrome-linux64/chrome', 'chrome-linux/chrome', 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
        'chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', 'chrome-win64/chrome.exe', 'chrome-win/chrome.exe',
        'chrome-headless-shell-linux64/chrome-headless-shell', 'chrome-headless-shell-mac-arm64/chrome-headless-shell', 'chrome-headless-shell-mac-x64/chrome-headless-shell',
        'chrome-headless-shell-win64/chrome-headless-shell.exe']) {
        const f = path.join(b, d, rel);
        if (fs.existsSync(f)) candidatos.push({ f, rev, completo: !d.includes('headless') && !rel.includes('headless') });
      }
    }
  }
  // o Chrome completo (modo headless novo) renderiza igual ao que se vê na tela; o headless_shell fica de reserva
  candidatos.sort((a, b) => (b.completo - a.completo) || (b.rev - a.rev));
  return candidatos[0]?.f;
}

export function caminhoDoChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  try { const f = chromium.executablePath(); if (f && fs.existsSync(f)) return f; } catch {}
  return doCache();
}

// WebGL no headless: por padrão, software (SwiftShader), que funciona em qualquer máquina; RENDER_GPU=1 usa a placa pelo Vulkan (Linux)
export function argsDoChrome() {
  const base = ['--force-color-profile=srgb', '--disable-lcd-text', '--autoplay-policy=no-user-gesture-required', '--allow-file-access-from-files'];
  if (process.env.RENDER_GPU) return [...base, '--use-gl=angle', '--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist'];
  return [...base, '--enable-unsafe-swiftshader'];
}

export async function abrirChrome(extra = {}) {
  const executablePath = caminhoDoChrome();
  if (!executablePath) {
    console.error('Chromium não encontrado. Rode:  npx playwright-core install chromium   (ou aponte CHROME_PATH para um Chrome/Chromium)');
    process.exit(1);
  }
  return chromium.launch({ executablePath, args: argsDoChrome(), ...extra });
}
