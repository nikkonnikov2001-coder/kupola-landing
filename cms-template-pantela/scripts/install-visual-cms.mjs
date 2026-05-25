#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, '..');
const targetDir = path.resolve(process.argv[2] || '');
const cmsVersion = '3';

if (!process.argv[2]) {
  console.error('Usage: node scripts/install-visual-cms.mjs /path/to/site [--user=admin] [--password=secret]');
  process.exit(1);
}

const args = new Map(process.argv.slice(3).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=');
  return [key, rest.join('=') || ''];
}));

const user = args.get('user') || 'admin';
const password = args.get('password') || crypto.randomBytes(18).toString('base64url');

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) await copyDir(from, to);
    else await fs.copyFile(from, to);
  }
}

async function htmlFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.html') && entry.name !== 'admin.html')
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'ru'));
}

function pagePath(file) {
  return file === 'index.html' ? '/' : `/${file}`;
}

function labelFromHtml(file, html) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const raw = title || h1 || file.replace(/\.html$/i, '');
  return raw
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+[—|-].*$/, '')
    .trim() || file;
}

async function generatePagesJson(files) {
  const items = [];
  for (const file of files) {
    const html = await fs.readFile(path.join(targetDir, file), 'utf8');
    items.push({ path: pagePath(file), label: labelFromHtml(file, html) });
  }

  return {
    groups: [
      {
        label: 'Страницы сайта',
        items,
      },
    ],
  };
}

function injectCms(html) {
  let output = html;
  if (!/\/cms\/cms\.css(?:\?v=\d+)?/.test(output)) {
    output = output.replace(/\s*<\/head>/i, `\n    <link rel="stylesheet" href="/cms/cms.css?v=${cmsVersion}">\n  </head>`);
  } else {
    output = output.replace(/\/cms\/cms\.css(?:\?v=\d+)?/g, `/cms/cms.css?v=${cmsVersion}`);
  }

  if (!/\/cms\/cms\.js(?:\?v=\d+)?/.test(output)) {
    output = output.replace(/\s*<\/body>/i, `\n    <script src="/cms/cms.js?v=${cmsVersion}" defer></script>\n  </body>`);
  } else {
    output = output.replace(/\/cms\/cms\.js(?:\?v=\d+)?/g, `/cms/cms.js?v=${cmsVersion}`);
  }

  return output;
}

async function patchHtml(files) {
  for (const file of files) {
    const filePath = path.join(targetDir, file);
    const html = await fs.readFile(filePath, 'utf8');
    await fs.writeFile(filePath, injectCms(html));
  }
}

async function patchHtaccess() {
  const file = path.join(targetDir, '.htaccess');
  const snippet = await fs.readFile(path.join(packageRoot, 'snippets', 'htaccess.txt'), 'utf8');
  const current = await fs.readFile(file, 'utf8').catch(() => '');
  if (current.includes('Pantela Visual CMS') || current.includes('api/cms.php?action=')) return;
  await fs.writeFile(file, `${current.trimEnd()}\n\n${snippet.trim()}\n`);
}

async function patchGitignore() {
  const file = path.join(targetDir, '.gitignore');
  const lines = [
    'private/cms.php',
    'cms/history/',
    'uploads/*',
    '!uploads/.gitkeep',
  ];
  const current = await fs.readFile(file, 'utf8').catch(() => '');
  const missing = lines.filter((line) => !current.split(/\r?\n/).includes(line));
  if (!missing.length) return;
  await fs.writeFile(file, `${current.trimEnd()}\n${missing.join('\n')}\n`);
}

async function main() {
  if (!await exists(targetDir)) {
    throw new Error(`Target directory does not exist: ${targetDir}`);
  }

  await copyDir(path.join(packageRoot, 'cms'), path.join(targetDir, 'cms'));
  await copyDir(path.join(packageRoot, 'api'), path.join(targetDir, 'api'));
  await copyDir(path.join(packageRoot, 'uploads'), path.join(targetDir, 'uploads'));
  await fs.copyFile(path.join(packageRoot, 'editor.php'), path.join(targetDir, 'editor.php'));

  await fs.mkdir(path.join(targetDir, 'private'), { recursive: true });
  await fs.writeFile(
    path.join(targetDir, 'private', 'cms.php'),
    `<?php\nreturn [\n    'user' => ${JSON.stringify(user)},\n    'password' => ${JSON.stringify(password)},\n];\n`
  );

  const files = await htmlFiles(targetDir);
  await patchHtml(files);
  const pages = await generatePagesJson(files);
  await fs.writeFile(path.join(targetDir, 'cms', 'pages.json'), `${JSON.stringify(pages, null, 2)}\n`);
  await patchHtaccess();
  await patchGitignore();

  console.log('Pantela Visual CMS installed.');
  console.log(`Editor: /editor`);
  console.log(`User: ${user}`);
  console.log(`Password: ${password}`);
  console.log('Edit cms/pages.json to group catalog sections and product cards.');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
