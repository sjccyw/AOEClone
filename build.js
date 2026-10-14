#!/usr/bin/env node
// 將整個遊戲打包成單一 HTML 檔（dist/index.html），可直接雙擊以 file:// 開啟遊玩。
const fs = require('fs');
const path = require('path');
const root = __dirname;
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const safe = js => js.replace(/<\/script/gi, '<\\/script');

// 1. three.js：把 ESM 的 export{...} 轉成 window.THREE
let three = read('vendor/three.module.min.js');
const m = three.match(/export\{([^}]*)\};?\s*$/);
if (!m) throw new Error('找不到 three.js 的 export 區段');
const pairs = m[1].split(',').map(s => s.trim()).filter(Boolean).map(s => { const [a, b] = s.split(/\s+as\s+/); return `${(b || a).trim()}:${a.trim()}`; });
three = three.slice(0, m.index) + `\nwindow.THREE={${pairs.join(',')}};`;
three = `(function(){\n${three}\n})();`;

// 2. 遊戲模組（依相依順序）
const order = ['data', 'world', 'meshes', 'sfx', 'ai', 'game', 'input', 'ui', 'main'];
let bundle = 'const __m = {};\n';
for (const name of order) {
  let src = read(`src/${name}.js`);
  const exportsList = [];
  src = src.replace(/^import \* as THREE from 'three';\s*$/m, 'const THREE = window.THREE;');
  src = src.replace(/^import \{([^}]*)\} from '\.\/(\w+)\.js';\s*$/gm, (_, names, mod) => `const {${names}} = __m['${mod}'];`);
  src = src.replace(/^export (const|let|function|class) (\w+)/gm, (_, kw, id) => { exportsList.push(id); return `${kw} ${id}`; });
  if (/^import |^export /m.test(src)) throw new Error(`模組 ${name} 含有未處理的 import/export`);
  bundle += `__m['${name}'] = (function(){\n${src}\nreturn {${exportsList.join(', ')}};\n})();\n`;
}

// 3. 組合 HTML
let html = read('index.html');
html = html.replace(/<link rel="stylesheet" href="style.css">/, `<style>\n${read('style.css')}\n</style>`);
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>/, '');
html = html.replace(/<script type="module" src="src\/main.js"><\/script>/, `<script>\n${safe(three)}\n</script>\n<script>\n${safe(bundle)}\n</script>`);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/index.html'), html);
console.log(`已輸出 dist/index.html（${(html.length / 1024).toFixed(0)} KB）`);
