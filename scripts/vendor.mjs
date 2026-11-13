// Copia GSAP e Three.js do node_modules para motor/vendor (o repo não redistribui as bibliotecas).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nm = path.join(raiz, 'node_modules');
const vendor = path.join(raiz, 'motor', 'vendor');
fs.mkdirSync(path.join(vendor, 'three'), { recursive: true });

const copias = [
  ['gsap/dist/gsap.min.js', 'gsap.min.js'],
  ['three/build/three.module.min.js', 'three/three.module.min.js'],
  ['three/build/three.core.min.js', 'three/three.core.min.js'],   // three >= r171: o .module importa o .core
  ['three/examples/jsm/environments/RoomEnvironment.js', 'three/RoomEnvironment.js'],
];
for (const [de, para] of copias) {
  const src = path.join(nm, de);
  if (!fs.existsSync(src)) { console.warn(`vendor: ${de} não existe (pulando)`); continue; }
  fs.copyFileSync(src, path.join(vendor, para));
}
console.log('vendor: gsap e three copiados para motor/vendor');
