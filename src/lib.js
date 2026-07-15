import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

export const SUPPORTED_FORMATS = ['png', 'jpg', 'jpeg', 'webp', 'avif', 'tiff', 'gif'];
export const LOSSY_FORMATS = ['jpeg', 'webp', 'avif', 'tiff'];

const CONTENT_TYPE_MAP = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/tiff': 'tiff',
  'image/gif': 'gif',
};

export function normalizeFormat(fmt) {
  const f = (fmt || 'png').toLowerCase();
  return f === 'jpeg' ? 'jpg' : f;
}

export function guessExtFromContentType(ct) {
  if (!ct) return null;
  const clean = ct.split(';')[0].trim().toLowerCase();
  return CONTENT_TYPE_MAP[clean] || null;
}

export function guessExtFromUrl(url) {
  try {
    const { pathname } = new URL(url);
    const ext = path.extname(pathname).replace('.', '').toLowerCase();
    const norm = ext === 'jpeg' ? 'jpg' : ext;
    return SUPPORTED_FORMATS.includes(norm) ? norm : null;
  } catch {
    return null;
  }
}

export function guessNameFromUrl(url) {
  try {
    const { pathname } = new URL(url);
    const base = path.basename(pathname);
    const nameOnly = base.replace(/\.[a-zA-Z0-9]+$/, '');
    return nameOnly || 'image';
  } catch {
    return 'image';
  }
}

export function uniquePath(dir, name, ext) {
  let candidate = path.join(dir, `${name}.${ext}`);
  let i = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${name}-${i}.${ext}`);
    i += 1;
  }
  return candidate;
}

export async function downloadBuffer(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
    },
    redirect: 'follow',
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  const contentType = res.headers.get('content-type');
  const arrayBuffer = await res.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), contentType };
}

/**
 * Download + convert one image.
 * opts: { format, output, name, quality }
 * returns { outPath, sourceExt, targetFormat, sizeBytes, usedConversion }
 */
export async function processOne(url, opts) {
  const targetFormat = normalizeFormat(opts.format);
  const sharpFormat = targetFormat === 'jpg' ? 'jpeg' : targetFormat;

  const { buffer, contentType } = await downloadBuffer(url);

  const sourceExt = guessExtFromContentType(contentType) || guessExtFromUrl(url) || 'bin';
  const baseName = opts.name || guessNameFromUrl(url);

  fs.mkdirSync(opts.output, { recursive: true });

  let finalBuffer = buffer;
  let usedConversion = false;

  if (sourceExt !== targetFormat) {
    const formatOpts = {};
    if (opts.quality && LOSSY_FORMATS.includes(sharpFormat)) {
      formatOpts.quality = opts.quality;
    }
    finalBuffer = await sharp(buffer).toFormat(sharpFormat, formatOpts).toBuffer();
    usedConversion = true;
  } else if (opts.quality && LOSSY_FORMATS.includes(sharpFormat)) {
    finalBuffer = await sharp(buffer).toFormat(sharpFormat, { quality: opts.quality }).toBuffer();
    usedConversion = true;
  }

  const outPath = uniquePath(opts.output, baseName, targetFormat);
  fs.writeFileSync(outPath, finalBuffer);

  return {
    outPath,
    sourceExt,
    targetFormat,
    sizeBytes: finalBuffer.length,
    usedConversion,
  };
}

export function readBatchFile(file) {
  const content = fs.readFileSync(file, 'utf8');
  return content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}