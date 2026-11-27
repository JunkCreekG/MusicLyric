export type LrcSource = 'folder' | 'online' | 'edited' | 'embedded' | 'sample';

export type RepeatMode = 'off' | 'all' | 'one';

export type AppView = 'library' | 'player' | 'editor' | 'search';

export type LibraryTab = 'songs' | 'folders' | 'albums' | 'artists' | 'playlists' | 'favorites';

export interface LrcLine {
  id: string;
  timeMs: number | null;
  text: string;
}

export interface LrcMetadata {
  ti?: string;
  ar?: string;
  al?: string;
  by?: string;
  offset?: number;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  fileName: string;
  baseName: string;
  folderPath: string;
  audioUrl: string;
  coverUrl?: string;
  format: string;
  fileSize?: number;
  lrcContent: string;
  lrcFileName?: string;
  lrcSource?: LrcSource;
  isFavorite: boolean;
  addedAt: number;
  isSample?: boolean;
  fileHandle?: FileSystemFileHandle;
  dirHandle?: FileSystemDirectoryHandle;
}

export interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
  createdAt: number;
}

export interface EqualizerSettings {
  enabled: boolean;
  preset: string;
  bands: [number, number, number, number, number]; // 60Hz, 230Hz, 910Hz, 3.6kHz, 14kHz
  bassBoost: number; // 0..12 dB
  playbackRate: number; // 0.5..2.0
}

export interface OnlineLyricResult {
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
