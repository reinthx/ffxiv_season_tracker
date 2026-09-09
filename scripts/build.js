const { minify } = require('terser');
const { readFileSync, writeFileSync, readdirSync, cpSync } = require('fs');
const { execSync } = require('child_process');
const path = require('path');

// Stamp which commit this bundle was built from (gitignored — never committed).
// Served as /data/version.json and rendered into the page footer by shared.js,
// so the live site can always be matched back to a commit ("check valve").
function writeVersion() {
  let commit = 'unknown', message = '';
  try {
    commit  = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    message = execSync('git log -1 --format=%s', { encoding: 'utf8' }).trim();
  } catch {}
  const version = { commit, short: commit.slice(0, 7), message, builtAt: new Date().toISOString() };
  writeFileSync('docs/data/version.json', JSON.stringify(version, null, 2) + '\n');
  console.log(`version.json → ${version.short} "${message}"`);
}

async function build() {
  writeVersion();
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
