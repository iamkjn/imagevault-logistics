import { mkdir, readdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
const root = process.cwd();
for (const sub of ['core', 'lang'])
  await mkdir(path.join(root, 'public/ocr', sub), { recursive: true });
await copyFile(
  path.join(root, 'node_modules/tesseract.js/dist/worker.min.js'),
  path.join(root, 'public/ocr/worker.min.js'),
);
const core = path.join(root, 'node_modules/tesseract.js-core');
for (const file of await readdir(core))
  if (/\.wasm(?:\.js)?$/.test(file))
    await copyFile(
      path.join(core, file),
      path.join(root, 'public/ocr/core', file),
    );
await copyFile(
  path.join(
    root,
    'node_modules/@tesseract.js-data/eng/4.0.0/eng.traineddata.gz',
  ),
  path.join(root, 'public/ocr/lang/eng.traineddata.gz'),
);
console.log('Local OCR worker, cores and English model prepared.');
