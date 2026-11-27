import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALLOWED_LYRICS_HOSTS = new Set(['www.lyricsify.com', 'lyricsify.com']);

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
  Referer: 'https://www.lyricsify.com/',
};

interface SearchResultItem {
  id: string;
  source: 'lyricsify' | 'lrclib';
  title: string;
  artist: string;
  album?: string;
  duration?: number;
  url?: string;
  hasSynced: boolean;
  syncedLyrics?: string;
  plainLyrics?: string;
}

function validateAllowedUrl(rawUrl: string): URL | null {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }
    if (!ALLOWED_LYRICS_HOSTS.has(parsed.hostname.toLowerCase())) {
      return null;
    }
    parsed.protocol = 'https:';
    return parsed;
  } catch {
    return null;
  }
}

function cleanTextLines(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line, idx, arr) => line.length > 0 || (idx > 0 && arr[idx - 1].length > 0))
    .join('\n')
    .trim();
}

function parseArtistTitleFromSlug(titleText: string, href: string): { artist: string; title: string } {
  const cleaned = titleText.replace(/\s+/g, ' ').replace(/\s*[-–|]\s*Lyricsify.*$/i, '').trim();
  const dashSplit = cleaned.split(/\s+[-–]\s+/);
  if (dashSplit.length >= 2) {
    return {
      artist: dashSplit[0].trim(),
      title: dashSplit.slice(1).join(' - ').trim(),
    };
  }
  const parts = href.split('/').filter(Boolean);
  if (parts.length >= 3 && parts[0] === 'lyrics') {
    const artist = decodeURIComponent(parts[1]).replace(/-/g, ' ');
    const song = decodeURIComponent(parts[2]).replace(/-/g, ' ');
    return {
      artist: artist.replace(/\b\w/g, (c) => c.toUpperCase()),
      title: cleaned || song.replace(/\b\w/g, (c) => c.toUpperCase()),
    };
  }
  return { artist: 'Unknown Artist', title: cleaned || 'Unknown Track' };
}

async function searchLyricsify(query: string): Promise<{ items: SearchResultItem[]; status: 'ok' | 'blocked' | 'empty' }> {
  try {
    const targetUrl = `https://www.lyricsify.com/search?q=${encodeURIComponent(query)}`;
    const response = await fetch(targetUrl, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(7500),
    });

    if (response.status === 403 || response.status === 429 || response.status === 503) {
      return { items: [], status: 'blocked' };
    }
    if (!response.ok) {
      return { items: [], status: 'empty' };
    }

    const html = await response.text();
    if (
      html.includes('Just a moment...') ||
      html.includes('cf-browser-verification') ||
      html.includes('Enable JavaScript and cookies to continue')
    ) {
      return { items: [], status: 'blocked' };
    }

    const $ = cheerio.load(html);
    const seen = new Set<string>();
    const items: SearchResultItem[] = [];

    $('a[href*="/lyrics/"], a.title, .li_link a').each((_idx, el) => {
      const href = $(el).attr('href');
      if (!href || !href.includes('/lyrics/')) return;
      const fullUrl = href.startsWith('http') ? href : `https://www.lyricsify.com${href.startsWith('/') ? '' : '/'}${href}`;
      const validated = validateAllowedUrl(fullUrl);
      if (!validated) return;
      const canonical = validated.toString();
      if (seen.has(canonical)) return;
      seen.add(canonical);

      const rawTitle = $(el).text().trim();
      if (!rawTitle || rawTitle.length < 2) return;
      const { artist, title } = parseArtistTitleFromSlug(rawTitle, validated.pathname);

      items.push({
        id: `lyricsify:${Buffer.from(canonical).toString('base64url').slice(0, 32)}`,
        source: 'lyricsify',
        title,
        artist,
        url: canonical,
        hasSynced: true,
      });
    });

    return {
      items: items.slice(0, 16),
      status: items.length > 0 ? 'ok' : 'empty',
    };
  } catch {
    return { items: [], status: 'blocked' };
  }
}

async function searchLrclib(query: string): Promise<SearchResultItem[]> {
  try {
    const url = `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'SonaraLRC/1.0 (https://localhost)',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(7500),
    });
    if (!response.ok) return [];
    const data = (await response.json()) as Array<{
      id: number;
      trackName?: string;
      artistName?: string;
      albumName?: string;
      duration?: number;
      syncedLyrics?: string | null;
      plainLyrics?: string | null;
    }>;

    if (!Array.isArray(data)) return [];

    return data
      .filter((row) => Boolean(row.syncedLyrics || row.plainLyrics))
      .slice(0, 20)
      .map((row) => ({
        id: `lrclib:${row.id}`,
        source: 'lrclib' as const,
        title: row.trackName || 'Unknown Track',
        artist: row.artistName || 'Unknown Artist',
        album: row.albumName || undefined,
        duration: typeof row.duration === 'number' ? Math.round(row.duration) : undefined,
        hasSynced: Boolean(row.syncedLyrics && row.syncedLyrics.trim().length > 0),
        syncedLyrics: row.syncedLyrics || undefined,
        plainLyrics: row.plainLyrics || undefined,
      }));
  } catch {
    return [];
  }
}

function buildLrcWithHeaders(
  content: string,
  meta: { title?: string; artist?: string; album?: string }
): string {
  const cleaned = cleanTextLines(content);
  const hasHeader = /^\[(ti|ar|al|by|offset):/im.test(cleaned);
  if (hasHeader) return cleaned;

  const headers: string[] = [];
  if (meta.title) headers.push(`[ti:${meta.title}]`);
  if (meta.artist) headers.push(`[ar:${meta.artist}]`);
  if (meta.album) headers.push(`[al:${meta.album}]`);
  return headers.length > 0 ? `${headers.join('\n')}\n\n${cleaned}` : cleaned;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/lyrics/search', async (req, res) => {
    const rawQuery = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const sourceFilter = typeof req.query.source === 'string' ? req.query.source : 'all';

    if (!rawQuery || rawQuery.length > 200) {
      res.status(400).json({ error: 'Kata kunci pencarian lirik harus diisi (maks. 200 karakter).' });
      return;
    }

    const [lyricsifyRes, lrclibItems] = await Promise.all([
      sourceFilter === 'lrclib'
        ? Promise.resolve({ items: [], status: 'empty' as const })
        : searchLyricsify(rawQuery),
      sourceFilter === 'lyricsify' ? Promise.resolve([]) : searchLrclib(rawQuery),
    ]);

    const sortedLrclib = [...lrclibItems].sort((a, b) => Number(b.hasSynced) - Number(a.hasSynced));
    const results =
      sourceFilter === 'lyricsify'
        ? lyricsifyRes.items
        : sourceFilter === 'lrclib'
          ? sortedLrclib
          : [...lyricsifyRes.items, ...sortedLrclib];

    res.json({
      query: rawQuery,
      lyricsifyStatus: lyricsifyRes.status,
      results,
    });
  });

  app.get('/api/lyrics/fetch', async (req, res) => {
    const source = typeof req.query.source === 'string' ? req.query.source : '';

    if (source === 'lrclib') {
      const rawId = typeof req.query.id === 'string' ? req.query.id.replace(/^lrclib:/, '').trim() : '';
      if (!/^\d{1,12}$/.test(rawId)) {
        res.status(400).json({ error: 'ID LRCLIB tidak valid.' });
        return;
      }
      try {
        const response = await fetch(`https://lrclib.net/api/get/${rawId}`, {
          headers: { Accept: 'application/json', 'User-Agent': 'SonaraLRC/1.0' },
          signal: AbortSignal.timeout(7500),
        });
        if (!response.ok) {
          res.status(404).json({ error: 'Lirik tidak ditemukan di LRCLIB.' });
          return;
        }
        const data = (await response.json()) as {
          trackName?: string;
          artistName?: string;
          albumName?: string;
          syncedLyrics?: string | null;
          plainLyrics?: string | null;
        };
        const raw = data.syncedLyrics || data.plainLyrics || '';
        if (!raw.trim()) {
          res.status(404).json({ error: 'Konten lirik kosong.' });
          return;
        }
        const lrcText = buildLrcWithHeaders(raw, {
          title: data.trackName,
          artist: data.artistName,
          album: data.albumName,
        });
        res.json({
          source: 'lrclib',
          title: data.trackName || 'Unknown Track',
          artist: data.artistName || 'Unknown Artist',
          album: data.albumName || '',
          hasSynced: Boolean(data.syncedLyrics),
          lrcText,
        });
      } catch {
        res.status(502).json({ error: 'Gagal mengambil lirik dari LRCLIB.' });
      }
      return;
    }

    if (source === 'lyricsify') {
      const rawUrl = typeof req.query.url === 'string' ? req.query.url : '';
      const validated = validateAllowedUrl(rawUrl);
      if (!validated) {
        res.status(400).json({ error: 'URL harus berasal dari domain lyricsify.com yang valid.' });
        return;
      }

      try {
        const response = await fetch(validated.toString(), {
          headers: BROWSER_HEADERS,
          signal: AbortSignal.timeout(8000),
        });

        if (response.status === 403 || response.status === 429 || response.status === 503) {
          res.status(502).json({
            error:
              'Lyricsify.com membatasi akses otomatis dari server cloud. Anda dapat membuka halaman Lyricsify di browser lalu menempelkan teks .lrc ke Editor Real-Time.',
            blocked: true,
          });
          return;
        }
        if (!response.ok) {
          res.status(404).json({ error: 'Halaman lirik di Lyricsify tidak ditemukan.' });
          return;
        }

        const html = await response.text();
        if (html.includes('Just a moment...') || html.includes('cf-browser-verification')) {
          res.status(502).json({
            error:
              'Lyricsify.com memerlukan verifikasi browser. Silakan buka link di tab baru dan tempelkan isi .lrc ke Editor LRC.',
            blocked: true,
          });
          return;
        }

        const $ = cheerio.load(html);
        // Extract LRC text from common Lyricsify containers
        let extracted = '';
        const candidates = ['#lyrics', '.lyrics', 'div[id^="lyrics"]', 'pre', '.entry-content'];
        for (const selector of candidates) {
          const el = $(selector).first();
          if (el.length > 0) {
            el.find('br').replaceWith('\n');
            el.find('p').after('\n');
            const text = el.text();
            if (text && (/\[\d{1,2}:\d{2}/.test(text) || text.trim().length > 40)) {
              extracted = text;
              break;
            }
          }
        }

        // Also scan for any raw LRC download endpoint on the page
        const lrcHref = $('a[href*=".lrc"], a[href*="/download/"]').first().attr('href');
        if (!/\[\d{1,2}:\d{2}/.test(extracted) && lrcHref) {
          const dlUrl = lrcHref.startsWith('http')
            ? lrcHref
            : `https://www.lyricsify.com${lrcHref.startsWith('/') ? '' : '/'}${lrcHref}`;
          const validDl = validateAllowedUrl(dlUrl);
          if (validDl) {
            const dlResp = await fetch(validDl.toString(), {
              headers: BROWSER_HEADERS,
              signal: AbortSignal.timeout(6000),
            });
            if (dlResp.ok) {
              const dlText = await dlResp.text();
              if (/\[\d{1,2}:\d{2}/.test(dlText)) {
                extracted = dlText;
              }
            }
          }
        }

        const cleaned = cleanTextLines(extracted);
        if (!cleaned) {
          res.status(404).json({ error: 'Teks lirik tidak ditemukan pada halaman Lyricsify tersebut.' });
          return;
        }

        const pageTitle = $('h1').first().text().trim() || $('title').first().text().trim();
        const { artist, title } = parseArtistTitleFromSlug(pageTitle, validated.pathname);
        const lrcText = buildLrcWithHeaders(cleaned, { title, artist });

        res.json({
          source: 'lyricsify',
          title,
          artist,
          hasSynced: /\[\d{1,2}:\d{2}/.test(lrcText),
          lrcText,
        });
      } catch {
        res.status(502).json({ error: 'Gagal terhubung ke Lyricsify.com.' });
      }
      return;
    }

    res.status(400).json({ error: 'Sumber lirik tidak dikenal.' });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Sonara LRC server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
