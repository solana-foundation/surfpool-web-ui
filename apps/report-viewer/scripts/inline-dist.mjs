import fs from 'node:fs/promises';
import path from 'node:path';

const distDir = new URL('../dist/', import.meta.url);
const distPath = path.resolve(distDir.pathname);
const indexPath = path.join(distPath, 'index.html');

const escapeInlineScript = (source) => source.split('</script').join('<\\/script');
const escapeInlineStyle = (source) => source.split('</style').join('<\\/style');

const inlineDist = async () => {
  let html = await fs.readFile(indexPath, 'utf8');
  const assetsDir = path.join(distPath, 'assets');

  const assetEntries = await fs.readdir(assetsDir);
  for (const entry of assetEntries) {
    const assetPath = path.join(assetsDir, entry);
    const source = await fs.readFile(assetPath, 'utf8');

    if (entry.endsWith('.js')) {
      const escapedSource = escapeInlineScript(source);
      html = html.replace(
        `<script type="module" crossorigin src="./assets/${entry}"></script>`,
        () => `<script type="module">${escapedSource}</script>`
      );
      continue;
    }

    if (entry.endsWith('.css')) {
      const escapedSource = escapeInlineStyle(source);
      html = html.replace(
        `<link rel="stylesheet" crossorigin href="./assets/${entry}">`,
        () => `<style>${escapedSource}</style>`
      );
    }
  }

  html = html.replace(/<link rel="modulepreload"[^>]+>/g, '');

  const scriptOpen = '<script type="module">';
  const scriptStart = html.indexOf(scriptOpen);
  if (scriptStart !== -1) {
    const contentStart = scriptStart + scriptOpen.length;
    const scriptEnd = html.lastIndexOf('</script>');
    if (scriptEnd === -1 || scriptEnd <= contentStart) {
      throw new Error('Expected a closing </script> tag for the inlined module script');
    }

    const before = html.slice(0, contentStart);
    const scriptContent = html.slice(contentStart, scriptEnd);
    const after = html.slice(scriptEnd);
    const escapedScriptContent = escapeInlineScript(scriptContent);
    html = `${before}${escapedScriptContent}${after}`;
  }

  const literalScriptClosers = [...html.matchAll(/<\/script/gi)].length;
  if (literalScriptClosers > 2) {
    throw new Error(
      `Inlining failed: expected at most 2 literal </script sequences, found ${literalScriptClosers}`
    );
  }

  await fs.writeFile(indexPath, html);
  await fs.rm(assetsDir, { recursive: true, force: true });
};

inlineDist().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
