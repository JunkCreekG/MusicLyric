export interface ParsedAudioMeta {
  title?: string;
  artist?: string;
  album?: string;
  coverUrl?: string;
  embeddedLyrics?: string;
}

function decodeTextFrame(bytes: Uint8Array): string {
  if (bytes.length === 0) return '';
  const encoding = bytes[0];
  const payload = bytes.slice(1);
  try {
    if (encoding === 0) {
      return new TextDecoder('latin1').decode(payload).replace(/\0/g, '').trim();
    }
    if (encoding === 1) {
      return new TextDecoder('utf-16').decode(payload).replace(/\0/g, '').trim();
    }
    if (encoding === 2) {
      return new TextDecoder('utf-16be').decode(payload).replace(/\0/g, '').trim();
    }
    return new TextDecoder('utf-8').decode(payload).replace(/\0/g, '').trim();
  } catch {
    return new TextDecoder('utf-8').decode(payload).replace(/\0/g, '').trim();
  }
}

function parseSynchsafeInt(b0: number, b1: number, b2: number, b3: number): number {
  return ((b0 & 0x7f) << 21) | ((b1 & 0x7f) << 14) | ((b2 & 0x7f) << 7) | (b3 & 0x7f);
}

function parseUint32BE(b0: number, b1: number, b2: number, b3: number): number {
  return ((b0 << 24) | (b1 << 16) | (b2 << 8) | b3) >>> 0;
}

export function cleanBaseName(fileName: string): string {
  return fileName.replace(/\.[^/.]+$/, '');
}

export function inferMetaFromFileName(fileName: string): { title: string; artist: string } {
  const base = cleanBaseName(fileName)
    .replace(/^\d{1,3}[\s._-]+/, '')
    .trim();
  const parts = base.split(/\s+[-–]\s+/);
  if (parts.length >= 2) {
    return {
      artist: parts[0].trim(),
      title: parts.slice(1).join(' - ').trim(),
    };
  }
  return {
    artist: 'Artis Lokal',
    title: base || fileName,
  };
}

export async function extractAudioMetadata(file: File): Promise<ParsedAudioMeta> {
  const result: ParsedAudioMeta = {};
  try {
    // Read first 512KB which covers ID3v2 headers & embedded artwork in nearly all files
    const slice = file.slice(0, Math.min(file.size, 512 * 1024));
    const buf = new Uint8Array(await slice.arrayBuffer());

    // Check ID3v2 header
    if (buf.length >= 10 && buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
      const version = buf[3];
      const tagSize = parseSynchsafeInt(buf[6], buf[7], buf[8], buf[9]);
      const limit = Math.min(buf.length, 10 + tagSize);
      let offset = 10;

      // Skip extended header if present
      if ((buf[5] & 0x40) !== 0 && offset + 4 <= limit) {
        const extSize =
          version === 4
            ? parseSynchsafeInt(buf[offset], buf[offset + 1], buf[offset + 2], buf[offset + 3])
            : parseUint32BE(buf[offset], buf[offset + 1], buf[offset + 2], buf[offset + 3]);
        offset += extSize;
      }

      while (offset + 10 <= limit) {
        const frameId = String.fromCharCode(
          buf[offset],
          buf[offset + 1],
          buf[offset + 2],
          buf[offset + 3]
        );
        if (!/^[A-Z0-9]{4}$/.test(frameId)) break;

        const frameSize =
          version === 4
            ? parseSynchsafeInt(buf[offset + 4], buf[offset + 5], buf[offset + 6], buf[offset + 7])
            : parseUint32BE(buf[offset + 4], buf[offset + 5], buf[offset + 6], buf[offset + 7]);

        offset += 10;
        if (frameSize <= 0 || offset + frameSize > limit) break;

        const frameData = buf.slice(offset, offset + frameSize);
        if (frameId === 'TIT2') {
          result.title = decodeTextFrame(frameData);
        } else if (frameId === 'TPE1') {
          result.artist = decodeTextFrame(frameData);
        } else if (frameId === 'TALB') {
          result.album = decodeTextFrame(frameData);
        } else if (frameId === 'USLT' && frameData.length > 4) {
          // encoding (1) + language (3) + descriptor\0 + lyrics
          const encoding = frameData[0];
          let pos = 4;
          while (pos < frameData.length && frameData[pos] !== 0) pos += 1;
          pos += 1;
          if (encoding === 1 || encoding === 2) {
            while (pos < frameData.length && frameData[pos] === 0) pos += 1;
          }
          if (pos < frameData.length) {
            const textBytes = new Uint8Array(1 + (frameData.length - pos));
            textBytes[0] = encoding;
            textBytes.set(frameData.slice(pos), 1);
            const lyr = decodeTextFrame(textBytes);
            if (lyr) result.embeddedLyrics = lyr;
          }
        } else if (frameId === 'APIC' && !result.coverUrl && frameData.length > 10) {
          let pos = 1;
          const mimeStart = pos;
          while (pos < frameData.length && frameData[pos] !== 0) pos += 1;
          const mime =
            new TextDecoder('latin1').decode(frameData.slice(mimeStart, pos)) || 'image/jpeg';
          pos += 2; // skip null + picture type
          const encoding = frameData[0];
          if (encoding === 1 || encoding === 2) {
            while (pos + 1 < frameData.length && !(frameData[pos] === 0 && frameData[pos + 1] === 0)) {
              pos += 2;
            }
            pos += 2;
          } else {
            while (pos < frameData.length && frameData[pos] !== 0) pos += 1;
            pos += 1;
          }
          if (pos < frameData.length) {
            const imgBlob = new Blob([frameData.slice(pos)], { type: mime });
            result.coverUrl = URL.createObjectURL(imgBlob);
          }
        }

        offset += frameSize;
      }
    }
  } catch {
    // Ignore malformed tags; fallback to filename parsing
  }

  return result;
}
