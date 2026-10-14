import fs from 'node:fs';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';

const IG_HOSTS = ['instagram.com', 'www.instagram.com', 'ig.me'];
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

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

export function shortcodeToMediaId(shortcode) {
  let id = 0n;
  for (let i = 0; i < shortcode.length; i += 1) {
    const idx = BASE64_ALPHABET.indexOf(shortcode[i]);
    if (idx === -1) break;
    id = id * 64n + BigInt(idx);
  }
  return id.toString();
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
 * Resolve Instagram carousel / media using cookies via mobile & web APIs
 */
async function resolveWithCookies(shortcode, mediaId, cookieStr) {
  const endpoints = [
    `https://i.instagram.com/api/v1/media/${mediaId}/info/`,
    `https://www.instagram.com/api/v1/media/${mediaId}/info/`,
    `https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`,
  ];

  const headers = {
    'User-Agent': UA,
    Cookie: cookieStr,
    'x-ig-app-id': '936619743392459',
    'x-asbd-id': '129477',
    Accept: '*/*',
  };

  const csrfMatch = cookieStr.match(/csrftoken=([^;]+)/);
  if (csrfMatch) {
    headers['x-csrftoken'] = csrfMatch[1].trim();
  }

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, { headers });
      if (!res.ok) continue;

      const json = await res.json();

      // Format 1: items[0]
      const item = json.items?.[0];
      if (item) {
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
      }

      // Format 2: graphql.shortcode_media
      const sm = json.graphql?.shortcode_media;
      if (sm) {
        const imageUrls = [];
        const edges = sm.edge_sidecar_to_children?.edges;
        if (Array.isArray(edges) && edges.length > 0) {
          for (const edge of edges) {
            if (edge.node?.display_url) {
              imageUrls.push(edge.node.display_url);
            }
          }
        } else if (sm.display_url) {
          imageUrls.push(sm.display_url);
        }

        if (imageUrls.length > 0) {
          return {
            imageUrls,
            author: sm.owner?.username || null,
            title: sm.edge_media_to_caption?.edges?.[0]?.node?.text || null,
          };
        }
      }
    } catch {
      // try next endpoint
    }
  }

  throw new Error('Failed to resolve Instagram post via cookies.');
}

// ponytail: embed HTML regex scraping; upgrade to official Graph API if user has Meta App token.
async function resolveWithEmbedHtml(shortcode) {
  const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
  const res = await fetch(embedUrl, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  if (!res.ok) {
    throw new Error(`Instagram embed page returned HTTP ${res.status}`);
  }

  const html = await res.text();
  const cleanUrls = [];

  const displayUrlRegex = /"display_url"\s*:\s*"([^"]+)"/g;
  let match;
  while ((match = displayUrlRegex.exec(html)) !== null) {
    const rawUrl = match[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
    if (rawUrl.startsWith('https://') && !cleanUrls.includes(rawUrl)) {
      cleanUrls.push(rawUrl);
    }
  }

  if (cleanUrls.length === 0) {
    const imgMatch =
      html.match(/class=["'][^"']*EmbeddedMediaImage[^"']*["'][^>]*src=["']([^"']+)["']/i) ||
      html.match(/src=["']([^"']+)["'][^>]*class=["'][^"']*EmbeddedMediaImage[^"']*["']/i) ||
      html.match(/<img[^>]+src=["'](https:\/\/[^"']*(?:cdninstagram|fbcdn)[^"']*)["']/i);
    if (imgMatch) {
      cleanUrls.push(imgMatch[1].replace(/&amp;/g, '&'));
    }
  }

  if (cleanUrls.length === 0) {
    throw new Error('No images found in Instagram embed page.');
  }

  let author = null;
  const authorMatch =
    html.match(/class=["'][^"']*UsernameText[^"']*["'][^>]*>([^<]+)<\/span>/i) ||
    html.match(/"username"\s*:\s*"([^"]+)"/i) ||
    html.match(/href=["']\/([^"'\/?#]+)\/["'][^>]*class=["'][^"']*Avatar/i);
  if (authorMatch) {
    author = authorMatch[1].trim();
  }

  let title = null;
  const captionMatch = html.match(/class=["'][^"']*Caption[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  if (captionMatch) {
    title = captionMatch[1].replace(/<[^>]+>/g, '').trim();
  }

  return {
    imageUrls: cleanUrls,
    author,
    title,
  };
}

/**
 * Resolve Instagram post via public oEmbed.
 */
async function resolveWithOembed(shortcode) {
  const canonical = `https://www.instagram.com/p/${shortcode}/`;
  const urls = [
    `https://www.instagram.com/api/v1/oembed/?url=${encodeURIComponent(canonical)}`,
    `https://api.instagram.com/oembed/?url=${encodeURIComponent(canonical)}`,
  ];

  for (const apiUrl of urls) {
    try {
      const res = await fetch(apiUrl, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (!data.thumbnail_url) continue;

      const mediaId = (data.media_id || '').split('_')[0];
      return {
        mediaId: mediaId || shortcodeToMediaId(shortcode),
        thumbnailUrl: data.thumbnail_url,
        author: data.author_name || null,
        title: data.title || null,
      };
    } catch {
      // try next URL
    }
  }
  return null;
}

/**
 * Main resolve function for Instagram.
 * opts: { allImages?: boolean, cookies?: string }
 */
export async function resolveInstagramImage(postUrl, opts = {}) {
  const sc = extractShortcode(postUrl);
  if (!sc) {
    throw new Error('Could not extract shortcode from Instagram URL.');
  }

  const mediaId = shortcodeToMediaId(sc);
  const cookieStr = opts.cookies ? parseNetscapeCookies(opts.cookies) : '';

  // 1. If cookies are provided, resolve directly via authenticated endpoints
  if (cookieStr) {
    try {
      const cookieResult = await resolveWithCookies(sc, mediaId, cookieStr);
      const urls = opts.allImages ? cookieResult.imageUrls : [cookieResult.imageUrls[0]];
      return {
        imageUrls: urls,
        author: cookieResult.author,
        title: cookieResult.title,
        isCarousel: cookieResult.imageUrls.length > 1,
      };
    } catch {
      // Fall through to public resolvers if cookie endpoint fails
    }
  }

  // 2. Public resolvers (no cookies or cookie fallback)
  // 2a. Embed HTML page (works reliably for public posts without 400 error)
  try {
    const embedResult = await resolveWithEmbedHtml(sc);
    const urls = opts.allImages ? embedResult.imageUrls : [embedResult.imageUrls[0]];
    let warning = null;
    if (opts.allImages && !opts.cookies && embedResult.imageUrls.length === 1) {
      warning = 'Carousel post may require Instagram cookies to download all slides. Downloaded visible image(s).';
    }
    return {
      imageUrls: urls,
      author: embedResult.author,
      title: embedResult.title,
      warning,
      isCarousel: urls.length > 1,
    };
  } catch {}

  // 2b. oEmbed fallback
  try {
    const oembed = await resolveWithOembed(sc);
    if (oembed?.thumbnailUrl) {
      let warning = null;
      if (opts.allImages && !opts.cookies) {
        warning = 'Carousel post requires Instagram cookies to download all slides. Downloading cover image.';
      }
      return {
        imageUrls: [oembed.thumbnailUrl],
        author: oembed.author,
        title: oembed.title,
        warning,
        isCarousel: false,
      };
    }
  } catch {}

  throw new Error(
    `Failed to resolve Instagram post (${sc}). If the post is private or login-walled, provide cookies via -c <cookies.txt>.`
  );
}
