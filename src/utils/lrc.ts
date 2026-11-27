import type { LrcLine, LrcMetadata } from '../types/music';

let uidCounter = 0;
export function nextLineId(): string {
  uidCounter += 1;
  return `lrc-${Date.now()}-${uidCounter}`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const totalSec = Math.floor(seconds);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatLrcTag(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return '[--:--.--]';
  const clamped = Math.max(0, Math.round(ms));
  const mins = Math.floor(clamped / 60000);
  const secs = Math.floor((clamped % 60000) / 1000);
  const centis = Math.floor((clamped % 1000) / 10);
  return `[${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${centis
    .toString()
    .padStart(2, '0')}]`;
}

const TIMESTAMP_REGEX = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
const META_REGEX = /^\[(ti|ar|al|by|offset):(.*)\]$/i;

export function parseLrc(rawText: string): { metadata: LrcMetadata; lines: LrcLine[]; hasTimestamps: boolean } {
  const metadata: LrcMetadata = {};
  const timedLines: LrcLine[] = [];
  const untimedLines: LrcLine[] = [];

  if (!rawText || !rawText.trim()) {
    return { metadata, lines: [], hasTimestamps: false };
  }

  const rawLines = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    const metaMatch = trimmed.match(META_REGEX);
    if (metaMatch) {
      const key = metaMatch[1].toLowerCase();
      const val = metaMatch[2].trim();
      if (key === 'ti') metadata.ti = val;
      else if (key === 'ar') metadata.ar = val;
      else if (key === 'al') metadata.al = val;
      else if (key === 'by') metadata.by = val;
      else if (key === 'offset') {
        const parsedOffset = parseInt(val, 10);
        if (!Number.isNaN(parsedOffset)) metadata.offset = parsedOffset;
      }
      continue;
    }

    const timestamps: number[] = [];
    TIMESTAMP_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = TIMESTAMP_REGEX.exec(trimmed)) !== null) {
      const min = parseInt(match[1], 10);
      const sec = parseInt(match[2], 10);
      const fracRaw = match[3] || '0';
      const ms =
        fracRaw.length === 1
          ? parseInt(fracRaw, 10) * 100
          : fracRaw.length === 2
            ? parseInt(fracRaw, 10) * 10
            : parseInt(fracRaw.slice(0, 3), 10);
      timestamps.push(min * 60000 + sec * 1000 + ms);
    }

    const lyricText = trimmed.replace(TIMESTAMP_REGEX, '').trim();

    if (timestamps.length > 0) {
      for (const ts of timestamps) {
        timedLines.push({
          id: nextLineId(),
          timeMs: ts,
          text: lyricText || '♪',
        });
      }
    } else {
      untimedLines.push({
        id: nextLineId(),
        timeMs: null,
        text: lyricText,
      });
    }
  }

  if (timedLines.length > 0) {
    timedLines.sort((a, b) => (a.timeMs ?? 0) - (b.timeMs ?? 0));
    // Preserve any untimed lines appended at the bottom so user doesn't lose un-synced edits
    return {
      metadata,
      lines: [...timedLines, ...untimedLines],
      hasTimestamps: true,
    };
  }

  return {
    metadata,
    lines: untimedLines,
    hasTimestamps: false,
  };
}

export function serializeLrc(lines: LrcLine[], metadata: LrcMetadata): string {
  const out: string[] = [];
  if (metadata.ti) out.push(`[ti:${metadata.ti}]`);
  if (metadata.ar) out.push(`[ar:${metadata.ar}]`);
  if (metadata.al) out.push(`[al:${metadata.al}]`);
  if (metadata.by) out.push(`[by:${metadata.by}]`);
  if (typeof metadata.offset === 'number' && metadata.offset !== 0) {
    out.push(`[offset:${Math.round(metadata.offset)}]`);
  }

  if (out.length > 0 && lines.length > 0) {
    out.push('');
  }

  for (const line of lines) {
    const cleanText = line.text.trim();
    if (line.timeMs !== null && Number.isFinite(line.timeMs)) {
      out.push(`${formatLrcTag(line.timeMs)} ${cleanText}`);
    } else if (cleanText) {
      out.push(cleanText);
    }
  }

  return out.join('\n');
}

export function findActiveLineIndex(
  lines: LrcLine[],
  currentTimeMs: number,
  offsetMs = 0
): number {
  const effectiveMs = currentTimeMs - offsetMs;
  let active = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const t = lines[i].timeMs;
    if (t !== null && t <= effectiveMs) {
      active = i;
    } else if (t !== null && t > effectiveMs) {
      break;
    }
  }
  return active;
}
