import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const encoded = await readFile(new URL('../icon-assets/operator-calm.webp.base64', import.meta.url), 'utf8');
const image = Buffer.from(encoded.trim(), 'base64');
for (const size of [180, 192, 512]) {
  const output = fileURLToPath(new URL('../public/operator-calm-' + size + '.png', import.meta.url));
  await sharp(image).resize(size, size).flatten({ background: '#101113' }).png().toFile(output);
}
