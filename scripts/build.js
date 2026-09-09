const { minify } = require('terser');
const { readFileSync, writeFileSync, readdirSync, cpSync } = require('fs');
const path = require('path');

async function build() {
  // Copy docs/ to dist/
  cpSync('docs', 'dist', { recursive: true, force: true });
  console.log('Copied docs/ -> dist/');

  // Minify all JS files in dist/js/
  const jsDir = path.join('dist', 'js');
  const files = readdirSync(jsDir).filter(f => f.endsWith('.js'));

  for (const file of files) {
    const filePath = path.join(jsDir, file);
    const code = readFileSync(filePath, 'utf8');
    const result = await minify(code, { compress: true, mangle: true });
    writeFileSync(filePath, result.code);
    console.log(`Minified: js/${file}`);
  }

  console.log('Build complete.');
}

build().catch(err => {
  console.error(err);
  process.exit(1);
});
