import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { resolveInstagramImage, isInstagramPostUrl, extractShortcode } from './instagram.js';

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
 * opts: { format, output, name, quality, allImages }
 * returns [{ outPath, sourceExt, targetFormat, sizeBytes, usedConversion, sourceLabel? }]
 */
export async function processOne(url, opts) {
  const targetFormat = normalizeFormat(opts.format);
  const sharpFormat = targetFormat === 'jpg' ? 'jpeg' : targetFormat;

  let imageUrls = [];
  let igMeta = null;

  if (isInstagramPostUrl(url)) {
    igMeta = await resolveInstagramImage(url, { allImages: opts.allImages, cookies: opts.cookies });
    imageUrls = igMeta.imageUrls;
  } else {
    imageUrls = [url];
  }

  const results = [];

  for (let i = 0; i < imageUrls.length; i++) {
    const imgUrl = imageUrls[i];
    const { buffer, contentType } = await downloadBuffer(imgUrl);
    const sourceExt =
      guessExtFromContentType(contentType) || guessExtFromUrl(imgUrl) || 'bin';

    // naming: if IG multi-image, append index
    let baseName;
    if (opts.name) {
      baseName = imageUrls.length > 1 && i > 0
        ? `${opts.name}-${i + 1}`
        : opts.name;
    } else if (igMeta) {
      const suffix = imageUrls.length > 1 ? `-${i + 1}` : '';
      baseName = `ig-${igMeta.author || 'post'}-${extractShortcode(url)}${suffix}`;
    } else {
      baseName = imageUrls.length > 1 && i > 0
        ? `${guessNameFromUrl(imgUrl)}-${i + 1}`
        : guessNameFromUrl(imgUrl);
    }

    fs.mkdirSync(opts.output, { recursive: true });
    const outPath = uniquePath(opts.output, baseName, targetFormat);

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

    fs.writeFileSync(outPath, finalBuffer);

    results.push({
      outPath,
      sourceExt,
      targetFormat,
      sizeBytes: finalBuffer.length,
      usedConversion,
      warning: igMeta?.warning || null,
      ...(igMeta ? { sourceLabel: `instagram @${igMeta.author}` } : {}),
    });
  }

  return results;
}

export function readBatchFile(file) {
  const content = fs.readFileSync(file, 'utf8');
  return content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}
