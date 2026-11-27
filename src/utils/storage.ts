import type { EqualizerSettings, Playlist, Track } from '../types/music';
import { cleanBaseName, extractAudioMetadata, inferMetaFromFileName } from './id3';

const DB_NAME = 'sonara_lrc_db';
const DB_VERSION = 1;
const STORE_LYRICS = 'lyrics';
const STORE_PREFS = 'prefs';

const AUDIO_EXTENSIONS = new Set([
  'mp3',
  'flac',
  'wav',
  'ogg',
  'm4a',
  'aac',
  'opus',
  'webm',
  'wma',
  'alac',
]);

export function isAudioFile(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return AUDIO_EXTENSIONS.has(ext);
}

export function isLrcFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.lrc');
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_LYRICS)) {
        db.createObjectStore(STORE_LYRICS, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORE_PREFS)) {
        db.createObjectStore(STORE_PREFS, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveLyricToDb(key: string, lrcContent: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_LYRICS, 'readwrite');
      tx.objectStore(STORE_LYRICS).put({ key: key.toLowerCase(), lrcContent, updatedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // IndexedDB unavailable in private contexts
  }
}

export async function getLyricFromDb(key: string): Promise<string | null> {
  try {
    const db = await openDb();
    return await new Promise<string | null>((resolve) => {
      const tx = db.transaction(STORE_LYRICS, 'readonly');
      const req = tx.objectStore(STORE_LYRICS).get(key.toLowerCase());
      req.onsuccess = () => resolve(req.result?.lrcContent ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function savePrefToDb<T>(key: string, value: T): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_PREFS, 'readwrite');
      tx.objectStore(STORE_PREFS).put({ key, value });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore
  }
}

export async function getPrefFromDb<T>(key: string): Promise<T | null> {
  try {
    const db = await openDb();
    return await new Promise<T | null>((resolve) => {
      const tx = db.transaction(STORE_PREFS, 'readonly');
      const req = tx.objectStore(STORE_PREFS).get(key);
      req.onsuccess = () => resolve(req.result?.value ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export const DEFAULT_EQUALIZER: EqualizerSettings = {
  enabled: true,
  preset: 'Studio Flat',
  bands: [0, 0, 0, 0, 0],
  bassBoost: 2,
  playbackRate: 1,
};

export const DEFAULT_PLAYLISTS: Playlist[] = [];

function getAudioDurationFromUrl(url: string): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.preload = 'metadata';
    const done = (dur: number) => {
      audio.src = '';
      resolve(Number.isFinite(dur) ? dur : 0);
    };
    audio.onloadedmetadata = () => done(audio.duration);
    audio.onerror = () => done(0);
    audio.src = url;
  });
}

interface ScannedEntry {
  file: File;
  folderPath: string;
  fileHandle?: FileSystemFileHandle;
  dirHandle?: FileSystemDirectoryHandle;
}

async function collectDirectoryEntries(
  dirHandle: FileSystemDirectoryHandle,
  prefix: string,
  out: ScannedEntry[]
): Promise<void> {
  for await (const [, handle] of dirHandle.entries()) {
    if (handle.kind === 'file') {
      if (isAudioFile(handle.name) || isLrcFile(handle.name)) {
        const file = await handle.getFile();
        out.push({
          file,
          folderPath: prefix,
          fileHandle: handle,
          dirHandle,
        });
      }
    } else if (handle.kind === 'directory') {
      await collectDirectoryEntries(handle, `${prefix}/${handle.name}`, out);
    }
  }
}

async function buildTracksFromEntries(entries: ScannedEntry[]): Promise<Track[]> {
  const lrcMap = new Map<string, { text: string; fileName: string }>();
  const audioEntries: ScannedEntry[] = [];

  for (const entry of entries) {
    if (isLrcFile(entry.file.name)) {
      const base = cleanBaseName(entry.file.name).toLowerCase();
      const folderKey = `${entry.folderPath.toLowerCase()}::${base}`;
      const text = await entry.file.text();
      lrcMap.set(folderKey, { text, fileName: entry.file.name });
      if (!lrcMap.has(base)) {
        lrcMap.set(base, { text, fileName: entry.file.name });
      }
    } else if (isAudioFile(entry.file.name)) {
      audioEntries.push(entry);
    }
  }

  const tracks: Track[] = [];
  for (const entry of audioEntries) {
    const { file, folderPath, fileHandle, dirHandle } = entry;
    const baseName = cleanBaseName(file.name);
    const ext = file.name.split('.').pop()?.toUpperCase() || 'AUDIO';
    const audioUrl = URL.createObjectURL(file);

    const [id3Meta, duration] = await Promise.all([
      extractAudioMetadata(file),
      getAudioDurationFromUrl(audioUrl),
    ]);

    const inferred = inferMetaFromFileName(file.name);
    const title = id3Meta.title || inferred.title;
    const artist = id3Meta.artist || inferred.artist;
    const album = id3Meta.album || folderPath.split('/').pop() || 'Folder Lokal';

    const folderKey = `${folderPath.toLowerCase()}::${baseName.toLowerCase()}`;
    const matchedLrc = lrcMap.get(folderKey) || lrcMap.get(baseName.toLowerCase());
    const dbLrc = await getLyricFromDb(baseName);

    let lrcContent = '';
    let lrcFileName: string | undefined;
    let lrcSource: Track['lrcSource'];

    if (matchedLrc) {
      lrcContent = matchedLrc.text;
      lrcFileName = matchedLrc.fileName;
      lrcSource = 'folder';
    } else if (dbLrc) {
      lrcContent = dbLrc;
      lrcFileName = `${baseName}.lrc`;
      lrcSource = 'edited';
    } else if (id3Meta.embeddedLyrics) {
      lrcContent = id3Meta.embeddedLyrics;
      lrcSource = 'embedded';
    }

    tracks.push({
      id: `local-${folderPath}-${file.name}-${file.size}`,
      title,
      artist,
      album,
      duration,
      fileName: file.name,
      baseName,
      folderPath,
      audioUrl,
      coverUrl: id3Meta.coverUrl,
      format: ext,
      fileSize: file.size,
      lrcContent,
      lrcFileName,
      lrcSource,
      isFavorite: false,
      addedAt: Date.now(),
      fileHandle,
      dirHandle,
    });
  }

  return tracks.sort((a, b) => a.title.localeCompare(b.title));
}

export async function scanDirectoryWithPicker(): Promise<{
  tracks: Track[];
  rootHandle?: FileSystemDirectoryHandle;
  unsupported?: boolean;
}> {
  const picker = (window as unknown as {
    showDirectoryPicker?: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
  }).showDirectoryPicker;

  if (!picker) {
    return { tracks: [], unsupported: true };
  }

  try {
    let dirHandle: FileSystemDirectoryHandle;
    try {
      dirHandle = await picker({ mode: 'readwrite' });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return { tracks: [] };
      }
      // Retry read-only if readwrite was restricted
      dirHandle = await picker({ mode: 'read' });
    }

    const entries: ScannedEntry[] = [];
    await collectDirectoryEntries(dirHandle, dirHandle.name, entries);
    const tracks = await buildTracksFromEntries(entries);
    return { tracks, rootHandle: dirHandle };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { tracks: [] };
    }
    // Cross-origin iframe or SecurityError falls back gracefully to <input webkitdirectory>
    return { tracks: [], unsupported: true };
  }
}

export async function scanFileList(files: FileList | File[]): Promise<Track[]> {
  const entries: ScannedEntry[] = Array.from(files).map((file) => {
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || '';
    const parts = rel.split('/').filter(Boolean);
    const folderPath = parts.length > 1 ? parts.slice(0, -1).join('/') : 'File Lokal';
    return { file, folderPath };
  });
  return buildTracksFromEntries(entries);
}

export function downloadLrcFile(fileName: string, content: string): void {
  const normalizedName = fileName.toLowerCase().endsWith('.lrc') ? fileName : `${fileName}.lrc`;
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = normalizedName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function saveLrcToDeviceFolder(
  track: Track,
  lrcText: string,
  fallbackRootHandle?: FileSystemDirectoryHandle
): Promise<{ method: 'folder' | 'download'; fileName: string; folderName?: string }> {
  const targetFileName = `${track.baseName || track.title}.lrc`.replace(/[\\/:*?"<>|]/g, '_');

  // Always save a copy in IndexedDB
  await saveLyricToDb(track.baseName || track.id, lrcText);

  // Try writing directly to the track's directory handle or fallback root handle
  let targetDir = track.dirHandle || fallbackRootHandle;

  if (!targetDir) {
    const picker = (window as unknown as {
      showDirectoryPicker?: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
    }).showDirectoryPicker;

    if (picker) {
      try {
        targetDir = await picker({ mode: 'readwrite' });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw new Error('Penyimpanan ke folder dibatalkan.');
        }
        // Fallback to browser download if directory picker is blocked in embedded iframe
        downloadLrcFile(targetFileName, lrcText);
        return { method: 'download', fileName: targetFileName };
      }
    }
  }

  if (targetDir) {
    try {
      const writableDir = targetDir as FileSystemDirectoryHandle & {
        queryPermission?: (desc: { mode: string }) => Promise<string>;
        requestPermission?: (desc: { mode: string }) => Promise<string>;
      };
      if (writableDir.queryPermission && writableDir.requestPermission) {
        const perm = await writableDir.queryPermission({ mode: 'readwrite' });
        if (perm !== 'granted') {
          const req = await writableDir.requestPermission({ mode: 'readwrite' });
          if (req !== 'granted') {
            downloadLrcFile(targetFileName, lrcText);
            return { method: 'download', fileName: targetFileName };
          }
        }
      }

      const fileHandle = await targetDir.getFileHandle(targetFileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(lrcText);
      await writable.close();
      return {
        method: 'folder',
        fileName: targetFileName,
        folderName: targetDir.name,
      };
    } catch {
      downloadLrcFile(targetFileName, lrcText);
      return { method: 'download', fileName: targetFileName };
    }
  }

  downloadLrcFile(targetFileName, lrcText);
  return { method: 'download', fileName: targetFileName };
}
