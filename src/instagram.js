import fs from 'node:fs';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';

const IG_HOSTS = ['instagram.com', 'www.instagram.com', 'ig.me'];

export function isInstagramUrl(url) {
  try {
    const { hostname } = new URL(url);
    return IG_HOSTS.includes(hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function extractShortcode(url) {
  try {
    const { pathname } = new URL(url);
    // /p/<code>/, /reel/<code>/, /reels/<code>/, /tv/<code>/
    const m = pathname.match(/\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
    if (m) return m[2];
    return null;
  } catch {
    return null;
  }
}

export function isInstagramPostUrl(url) {
  return isInstagramUrl(url) && extractShortcode(url) !== null;
}

/**
 * Parse a Netscape-format cookie file or raw cookie string
 */
export function parseNetscapeCookies(filePathOrString) {
  if (!filePathOrString) return '';
  let content = filePathOrString;
  if (fs.existsSync(filePathOrString)) {
    content = fs.readFileSync(filePathOrString, 'utf8');
  }

  const lines = content.split(/\r?\n/);
  const cookies = [];
  const seen = new Set();
  for (const line of lines) {
    if (line.startsWith('#') || line.startsWith('//') || !line.trim()) continue;
    const parts = line.split('\t');
    if (parts.length >= 7) {
      const name = parts[5];
      const value = parts[6];
      const key = `${name}=${value}`;
      if (!seen.has(key)) {
        seen.add(key);
        cookies.push(key);
      }
    } else if (line.includes('=')) {
      cookies.push(line.trim().replace(/;$/, ''));
    }
  }
  return cookies.join('; ');
}

/**
 * Resolve Instagram post via public oEmbed.
 */
async function resolveWithOembed(shortcode) {
  const canonical = `https://www.instagram.com/p/${shortcode}/`;
  const apiUrl = `https://www.instagram.com/api/v1/oembed/?url=${encodeURIComponent(canonical)}`;

  const res = await fetch(apiUrl, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`Instagram oEmbed error: HTTP ${res.status} (post private atau sudah dihapus)`);
  }

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error('Instagram oEmbed mengembalikan respons bukan JSON.');
  }

  if (!data.thumbnail_url) {
    throw new Error('Gak nemu gambar di postingan IG ini.');
  }

  const mediaId = (data.media_id || '').split('_')[0];

  return {
    mediaId,
    thumbnailUrl: data.thumbnail_url,
    author: data.author_name || null,
    title: data.title || null,
  };
}

/**
 * Resolve Instagram carousel / media using cookies via media info API
 */
async function resolveWithCookies(mediaId, cookieStr) {
  const endpoints = [
    `https://i.instagram.com/api/v1/media/${mediaId}/info/`,
    `https://www.instagram.com/api/v1/media/${mediaId}/info/`,
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        headers: {
          'User-Agent': UA,
          Cookie: cookieStr,
          'x-ig-app-id': '936619743392459',
          'x-asbd-id': '129477',
          Accept: 'application/json',
        },
      });

      if (!res.ok) continue;
      const json = await res.json();
      const item = json.items?.[0];
      if (!item) continue;

      const imageUrls = [];
      if (Array.isArray(item.carousel_media) && item.carousel_media.length > 0) {
        for (const cm of item.carousel_media) {
          const cands = cm.image_versions2?.candidates;
          if (Array.isArray(cands) && cands.length > 0) {
            imageUrls.push(cands[0].url);
          }
        }
      } else if (Array.isArray(item.image_versions2?.candidates) && item.image_versions2.candidates.length > 0) {
        imageUrls.push(item.image_versions2.candidates[0].url);
      }

      if (imageUrls.length > 0) {
        return {
          imageUrls,
          author: item.user?.username || null,
          title: item.caption?.text || null,
        };
      }
    } catch {
      // try next endpoint
    }
  }

  throw new Error('Gagal mengambil detail carousel via cookie IG.');
}

/**
 * Main resolve function for Instagram.
 * opts: { allImages?: boolean, cookies?: string }
 */
export async function resolveInstagramImage(postUrl, opts = {}) {
  const sc = extractShortcode(postUrl);
  if (!sc) {
    throw new Error('Gak bisa ekstrak shortcode dari URL Instagram.');
  }

  // 1. Get base info & media_id from oEmbed (always works for public posts)
  const oembed = await resolveWithOembed(sc);

  // 2. If user requested all images (carousel) AND cookies are available
  if (opts.allImages && opts.cookies && oembed.mediaId) {
    try {
      const cookieStr = parseNetscapeCookies(opts.cookies);
      if (cookieStr) {
        const cookieResult = await resolveWithCookies(oembed.mediaId, cookieStr);
        return {
          imageUrls: cookieResult.imageUrls,
          author: cookieResult.author || oembed.author,
          title: cookieResult.title || oembed.title,
          isCarousel: cookieResult.imageUrls.length > 1,
        };
      }
    } catch (err) {
      // Fallback with warning
    }
  }

  // 3. Without cookie or first image requested
  let warning = null;
  if (opts.allImages && !opts.cookies) {
    warning = 'Postingan carousel memerlukan cookie IG untuk mengunduh semua slide. Mengunduh gambar pertama (cover).';
  }

  return {
    imageUrls: [oembed.thumbnailUrl],
    author: oembed.author,
    title: oembed.title,
    warning,
    isCarousel: false,
  };
}
