// Builds the whole app into one self-contained HTML file: dist/overlab-single.html.
//
// The normal production build produces several files (lazy-loaded route chunks, a stylesheet, a
// service worker). That is right for hosting, but a single file is handy for trying the app on a
// phone without deploying it: send the file, open it in the browser.
//
// Usage: pnpm build:single
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'esbuild';

const browserDir = 'dist/overlab/browser';
const outputFile = 'dist/overlab-single.html';

// 1. The regular production build has already run (see the `build:single` script in package.json).
const files = readdirSync(browserDir);
const mainFile = files.find((name) => /^main-.*\.js$/.test(name));
const styleFile = files.find((name) => /^styles-.*\.css$/.test(name));
if (!mainFile || !styleFile) {
  throw new Error(`Could not find main-*.js and styles-*.css in ${browserDir}`);
}

// 2. Re-bundle the entry point. Without code splitting, esbuild pulls every lazy chunk into the
//    one output, and the "iife" format gives a classic script that runs from any kind of URL.
const bundle = await build({
  entryPoints: [join(browserDir, mainFile)],
  bundle: true,
  format: 'iife',
  minify: true,
  write: false,
  logLevel: 'warning',
});
const script = bundle.outputFiles[0].text
  // A literal "</script>" inside the code would end the inline script element early.
  .replaceAll('</script', '<\\/script');
// Fonts are separate files referenced from the stylesheet; embed them as data URIs.
const styles = readFileSync(join(browserDir, styleFile), 'utf8').replace(
  /url\(["']?\.\/(media\/[^"')]+\.woff2)["']?\)/g,
  (_match, file) =>
    `url(data:font/woff2;base64,${readFileSync(join(browserDir, file)).toString('base64')})`,
);

// The exercise drawings are separate SVG files that the app loads by URL
// ("exercise-drawings/<id>-1.svg"). A single file has nowhere to load them from, so they are
// embedded as data URIs, and a small script that runs before the app redirects every attempt to
// set an image's `src` to one of those URLs. The app code stays unaware of the single-file build.
const drawingsDir = 'exercise-drawings';
const drawings = Object.fromEntries(
  readdirSync(join(browserDir, drawingsDir))
    .filter((name) => name.endsWith('.svg'))
    .map((name) => [
      `${drawingsDir}/${name}`,
      `data:image/svg+xml;base64,${readFileSync(join(browserDir, drawingsDir, name)).toString('base64')}`,
    ]),
);
const drawingsScript = `(() => {
  const drawings = ${JSON.stringify(drawings)};
  const src = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    ...src,
    set(value) { src.set.call(this, drawings[value] ?? value); },
  });
})();`;

// 3. Inline everything into the HTML shell.
const html = readFileSync(join(browserDir, 'index.html'), 'utf8')
  // No <base>: the single file uses hash-based routes (see app.config.ts).
  .replace(/<base [^>]*>/, '')
  .replace(/<link rel="manifest"[^>]*>/, '')
  .replace(/<link rel="(icon|apple-touch-icon)"[^>]*>/g, '')
  .replace(/<link rel="stylesheet"[^>]*>/g, '')
  .replace(/<link rel="modulepreload"[^>]*>/g, '')
  .replace(/<script [^>]*><\/script>/g, '')
  // Function replacements, so "$" sequences in the code are not treated as patterns.
  .replace('</head>', () => `<style>${styles}</style></head>`)
  .replace('</body>', () => `<script>${drawingsScript}</script><script>${script}</script></body>`);

writeFileSync(outputFile, html);
console.log(`\nWrote ${outputFile} (${Math.round(html.length / 1024)} kB)`);
