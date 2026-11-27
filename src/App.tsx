import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Disc3, Edit3, FolderOpen, Globe, Library } from 'lucide-react';
import { EqualizerModal } from './components/EqualizerModal';
import { Header } from './components/Header';
import { LibraryView } from './components/LibraryView';
import { LrcEditor } from './components/LrcEditor';
import { OnlineLyricsView } from './components/OnlineLyricsView';
import { PlayerBar } from './components/PlayerBar';
import { PlayerStage } from './components/PlayerStage';
import { useAudioEngine } from './hooks/useAudioEngine';
import type { AppView, EqualizerSettings, LibraryTab, Playlist, Track } from './types/music';
import { findActiveLineIndex, parseLrc } from './utils/lrc';
import { createSampleTracks } from './utils/sampleTracks';
import {
  DEFAULT_EQUALIZER,
  DEFAULT_PLAYLISTS,
  downloadLrcFile,
  getPrefFromDb,
  saveLrcToDeviceFolder,
  saveLyricToDb,
  savePrefToDb,
  scanDirectoryWithPicker,
  scanFileList,
} from './utils/storage';

export default function App() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<AppView>('player');
  const [libraryTab, setLibraryTab] = useState<LibraryTab>('songs');
  const [playlists, setPlaylists] = useState<Playlist[]>(DEFAULT_PLAYLISTS);
  const [eq, setEq] = useState<EqualizerSettings>(DEFAULT_EQUALIZER);
  const [isEqOpen, setIsEqOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const rootDirHandleRef = useRef<FileSystemDirectoryHandle | undefined>(undefined);
  const dirInputRef = useRef<HTMLInputElement | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => setToast(null), 4000);
  }, []);

  // Load initial sample tracks + saved preferences
  useEffect(() => {
    let mounted = true;
    async function init() {
      const [samples, savedPlaylists, savedEq, savedFavorites] = await Promise.all([
        createSampleTracks(),
        getPrefFromDb<Playlist[]>('playlists'),
        getPrefFromDb<EqualizerSettings>('equalizer'),
        getPrefFromDb<string[]>('favorites'),
      ]);
      if (!mounted) return;

      const favSet = new Set(savedFavorites || []);
      const hydrated = samples.map((t) => ({
        ...t,
        isFavorite: favSet.has(t.id) || t.isFavorite,
      }));
      setTracks(hydrated);
      if (hydrated.length > 0) {
        setCurrentTrackId(hydrated[0].id);
      }
      if (savedPlaylists) setPlaylists(savedPlaylists);
      if (savedEq) setEq(savedEq);
    }
    void init();
    return () => {
      mounted = false;
    };
  }, []);

  const engine = useAudioEngine({
    tracks,
    currentTrackId,
    onSelectTrack: setCurrentTrackId,
    eq,
  });

  const activeLyricText = useMemo(() => {
    const track = engine.currentTrack;
    if (!track || !track.lrcContent.trim()) return null;
    const parsed = parseLrc(track.lrcContent);
    if (!parsed.hasTimestamps) return null;
    const idx = findActiveLineIndex(
      parsed.lines,
      engine.currentTimeMs,
      parsed.metadata.offset ?? 0
    );
    return idx >= 0 ? parsed.lines[idx].text : null;
  }, [engine.currentTrack, engine.currentTimeMs]);

  const mergeLocalTracks = useCallback(
    (incoming: Track[]) => {
      if (incoming.length === 0) {
        showToast('Tidak ada file audio yang ditemukan di folder tersebut.');
        return;
      }
      setTracks((prev) => {
        // Keep user non-sample tracks deduplicated by id, replace samples if user prefers or keep accessible
        const existingMap = new Map(prev.map((t) => [t.id, t]));
        for (const t of incoming) {
          existingMap.set(t.id, t);
        }
        return Array.from(existingMap.values());
      });
      setCurrentTrackId((prevId) => {
        const current = tracks.find((t) => t.id === prevId);
        if (!current || current.isSample) {
          return incoming[0].id;
        }
        return prevId;
      });
      const syncedCount = incoming.filter((t) => Boolean(t.lrcContent.trim())).length;
      showToast(
        `Berhasil memuat ${incoming.length} lagu (${syncedCount} otomatis tersinkron dengan file .lrc).`
      );
      setActiveView('library');
    },
    [showToast, tracks]
  );

  const handleOpenFolder = useCallback(async () => {
    setIsScanning(true);
    try {
      const result = await scanDirectoryWithPicker();
      if (result.unsupported) {
        // Trigger classic <input webkitdirectory> fallback
        dirInputRef.current?.click();
        return;
      }
      if (result.rootHandle) {
        rootDirHandleRef.current = result.rootHandle;
      }
      if (result.tracks.length > 0) {
        mergeLocalTracks(result.tracks);
      }
    } finally {
      setIsScanning(false);
    }
  }, [mergeLocalTracks]);

  const handleImportFiles = useCallback(
    async (files: FileList | File[]) => {
      setIsScanning(true);
      try {
        const scanned = await scanFileList(files);
        mergeLocalTracks(scanned);
      } finally {
        setIsScanning(false);
      }
    },
    [mergeLocalTracks]
  );

  const handleImportLrcForTrack = useCallback(
    async (trackId: string, file: File) => {
      const content = await file.text();
      setTracks((prev) =>
        prev.map((t) =>
          t.id === trackId
            ? { ...t, lrcContent: content, lrcFileName: file.name, lrcSource: 'folder' }
            : t
        )
      );
      const target = tracks.find((t) => t.id === trackId);
      if (target) {
        await saveLyricToDb(target.baseName || target.id, content);
      }
      showToast(`File ${file.name} berhasil dimuat & disinkronkan.`);
    },
    [showToast, tracks]
  );

  const handleUpdateTrackLrc = useCallback(
    (trackId: string, newLrc: string, source: Track['lrcSource'] = 'edited') => {
      setTracks((prev) =>
        prev.map((t) =>
          t.id === trackId ? { ...t, lrcContent: newLrc, lrcSource: source } : t
        )
      );
    },
    []
  );

  const handlePersistToDb = useCallback(
    async (track: Track, lrcText: string) => {
      await saveLyricToDb(track.baseName || track.id, lrcText);
      handleUpdateTrackLrc(track.id, lrcText, 'edited');
      showToast(`Lirik "${track.title}" tersimpan di memori aplikasi.`);
    },
    [handleUpdateTrackLrc, showToast]
  );

  const handleSaveToFolder = useCallback(
    async (track: Track, overrideLrc?: string) => {
      const content = overrideLrc ?? track.lrcContent;
      if (!content.trim()) {
        showToast('Tidak ada konten .lrc untuk disimpan.');
        return;
      }
      try {
        const res = await saveLrcToDeviceFolder(track, content, rootDirHandleRef.current);
        handleUpdateTrackLrc(track.id, content, 'folder');
        if (res.method === 'folder') {
          showToast(
            `Berhasil menyimpan ${res.fileName} ke folder "${res.folderName || 'perangkat'}".`
          );
        } else {
          showToast(`File ${res.fileName} diunduh ke folder Unduhan perangkat Anda.`);
        }
      } catch (err) {
        if (err instanceof Error) {
          showToast(err.message);
        }
      }
    },
    [handleUpdateTrackLrc, showToast]
  );

  const handleDownloadLrc = useCallback(
    (track: Track, overrideLrc?: string) => {
      const content = overrideLrc ?? track.lrcContent;
      if (!content.trim()) return;
      const fileName = `${track.baseName || track.title}.lrc`;
      downloadLrcFile(fileName, content);
      showToast(`Mengunduh ${fileName}`);
    },
    [showToast]
  );

  const handleApplyOnlineLrc = useCallback(
    async (
      trackId: string,
      lrcText: string,
      saveToFolderToo: boolean,
      openEditorAfter: boolean
    ) => {
      const track = tracks.find((t) => t.id === trackId);
      if (!track) return;

      handleUpdateTrackLrc(trackId, lrcText, 'online');
      await saveLyricToDb(track.baseName || track.id, lrcText);

      if (saveToFolderToo) {
        await handleSaveToFolder(track, lrcText);
      } else {
        showToast(`Lirik .lrc berhasil diterapkan ke "${track.title}".`);
      }

      if (openEditorAfter) {
        setActiveView('editor');
      } else {
        setActiveView('player');
      }
    },
    [handleSaveToFolder, handleUpdateTrackLrc, showToast, tracks]
  );

  const handleToggleFavorite = useCallback(
    (trackId: string) => {
      setTracks((prev) => {
        const next = prev.map((t) =>
          t.id === trackId ? { ...t, isFavorite: !t.isFavorite } : t
        );
        const favIds = next.filter((t) => t.isFavorite).map((t) => t.id);
        void savePrefToDb('favorites', favIds);
        return next;
      });
    },
    []
  );

  const handleChangeEq = useCallback((nextEq: EqualizerSettings) => {
    setEq(nextEq);
    void savePrefToDb('equalizer', nextEq);
  }, []);

  const handleCreatePlaylist = useCallback(
    (name: string) => {
      const nextPl: Playlist = {
        id: `pl-${Date.now()}`,
        name,
        trackIds: [],
        createdAt: Date.now(),
      };
      setPlaylists((prev) => {
        const next = [...prev, nextPl];
        void savePrefToDb('playlists', next);
        return next;
      });
      showToast(`Playlist "${name}" dibuat.`);
    },
    [showToast]
  );

  const handleAddTrackToPlaylist = useCallback(
    (playlistId: string, trackId: string) => {
      setPlaylists((prev) => {
        const next = prev.map((pl) =>
          pl.id === playlistId && !pl.trackIds.includes(trackId)
            ? { ...pl, trackIds: [...pl.trackIds, trackId] }
            : pl
        );
        void savePrefToDb('playlists', next);
        return next;
      });
      showToast('Lagu ditambahkan ke playlist.');
    },
    [showToast]
  );

  const handleRemoveTrackFromPlaylist = useCallback((playlistId: string, trackId: string) => {
    setPlaylists((prev) => {
      const next = prev.map((pl) =>
        pl.id === playlistId
          ? { ...pl, trackIds: pl.trackIds.filter((id) => id !== trackId) }
          : pl
      );
      void savePrefToDb('playlists', next);
      return next;
    });
  }, []);

  const handleDeletePlaylist = useCallback((playlistId: string) => {
    setPlaylists((prev) => {
      const next = prev.filter((pl) => pl.id !== playlistId);
      void savePrefToDb('playlists', next);
      return next;
    });
  }, []);

  return (
    <div className="h-screen w-full flex flex-col bg-[#0B0D12] text-[#F4F4F6] overflow-hidden">
      {/* Hidden webkitdirectory input fallback for browsers/contexts without File System Access API */}
      <input
        ref={dirInputRef}
        type="file"
        multiple
        webkitdirectory=""
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            void handleImportFiles(e.target.files);
            e.target.value = '';
          }
        }}
      />

      <Header
        activeView={activeView}
        onChangeView={setActiveView}
        onOpenFolder={() => void handleOpenFolder()}
        isScanning={isScanning}
      />

      {/* Mobile navigation strip (keeps total fixed height compact) */}
      <nav
        className="md:hidden flex items-center justify-around border-b border-white/[0.08] bg-[#0E1118] px-2 py-1 shrink-0"
        aria-label="Navigasi seluler"
      >
        {[
          { id: 'library' as const, label: 'Pustaka', Icon: Library },
          { id: 'player' as const, label: 'Pemutar', Icon: Disc3 },
          { id: 'editor' as const, label: 'Editor', Icon: Edit3 },
          { id: 'search' as const, label: 'Cari LRC', Icon: Globe },
        ].map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveView(id)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap ${
              activeView === id ? 'text-amber-400 bg-amber-500/10' : 'text-zinc-400'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {/* Main Viewport */}
      <main className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
        {activeView === 'library' && (
          <LibraryView
            tracks={tracks}
            currentTrackId={currentTrackId}
            isPlaying={engine.isPlaying}
            playlists={playlists}
            activeTab={libraryTab}
            onChangeTab={setLibraryTab}
            onPlayTrack={(id) => {
              engine.playTrackNow(id);
            }}
            onToggleFavorite={handleToggleFavorite}
            onOpenFolder={() => void handleOpenFolder()}
            onImportFiles={(files) => void handleImportFiles(files)}
            onImportLrcForTrack={(id, file) => void handleImportLrcForTrack(id, file)}
            onCreatePlaylist={handleCreatePlaylist}
            onAddTrackToPlaylist={handleAddTrackToPlaylist}
            onRemoveTrackFromPlaylist={handleRemoveTrackFromPlaylist}
            onDeletePlaylist={handleDeletePlaylist}
            onOpenSearchLyrics={(track) => {
              setCurrentTrackId(track.id);
              setActiveView('search');
            }}
            onOpenEditor={(track) => {
              setCurrentTrackId(track.id);
              setActiveView('editor');
            }}
          />
        )}

        {activeView === 'player' && (
          <PlayerStage
            track={engine.currentTrack}
            isPlaying={engine.isPlaying}
            currentTimeMs={engine.currentTimeMs}
            durationSec={engine.durationSec}
            analyserNode={engine.analyserNode}
            onSeekMs={engine.seekToMs}
            onToggleFavorite={handleToggleFavorite}
            onUpdateTrackLrc={handleUpdateTrackLrc}
            onSaveToFolder={(track) => void handleSaveToFolder(track)}
            onOpenEditor={() => setActiveView('editor')}
            onOpenOnlineSearch={() => setActiveView('search')}
            onOpenEqualizer={() => setIsEqOpen(true)}
          />
        )}

        {activeView === 'editor' && (
          <LrcEditor
            track={engine.currentTrack}
            isPlaying={engine.isPlaying}
            currentTimeMs={engine.currentTimeMs}
            onTogglePlay={() => void engine.togglePlay()}
            onSeekMs={engine.seekToMs}
            onUpdateTrackLrc={handleUpdateTrackLrc}
            onSaveToFolder={(track, override) => void handleSaveToFolder(track, override)}
            onDownloadLrc={handleDownloadLrc}
            onPersistToDb={(track, lrcText) => void handlePersistToDb(track, lrcText)}
          />
        )}

        {activeView === 'search' && (
          <OnlineLyricsView
            currentTrack={engine.currentTrack}
            onApplyLrc={(trackId, lrcText, saveFolder, openEditor) =>
              void handleApplyOnlineLrc(trackId, lrcText, saveFolder, openEditor)
            }
          />
        )}

        {/* Toast notification */}
        {toast && (
          <div
            role="status"
            aria-live="polite"
            className="fixed bottom-24 right-4 sm:right-6 z-40 max-w-sm px-4 py-2.5 rounded-lg bg-[#181C28] border border-amber-500/40 text-xs font-medium text-white shadow-xl flex items-center gap-2"
          >
            <FolderOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>{toast}</span>
          </div>
        )}
      </main>

      <PlayerBar
        track={engine.currentTrack}
        isPlaying={engine.isPlaying}
        currentTimeMs={engine.currentTimeMs}
        durationSec={engine.durationSec}
        volume={engine.volume}
        isMuted={engine.isMuted}
        shuffle={engine.shuffle}
        repeat={engine.repeat}
        activeLyricText={activeLyricText}
        eqEnabled={eq.enabled}
        sleepMinutesLeft={engine.sleepMinutesLeft}
        onTogglePlay={() => void engine.togglePlay()}
        onPrev={engine.prevTrack}
        onNext={engine.nextTrack}
        onSeekMs={engine.seekToMs}
        onVolumeChange={(v) => {
          engine.setIsMuted(false);
          engine.setVolume(v);
        }}
        onToggleMute={() => engine.setIsMuted(!engine.isMuted)}
        onToggleShuffle={() => engine.setShuffle(!engine.shuffle)}
        onCycleRepeat={engine.cycleRepeat}
        onOpenPlayer={() => setActiveView('player')}
        onOpenEditor={() => setActiveView('editor')}
        onOpenEqualizer={() => setIsEqOpen(true)}
      />

      <EqualizerModal
        isOpen={isEqOpen}
        onClose={() => setIsEqOpen(false)}
        eq={eq}
        onChangeEq={handleChangeEq}
        currentTimeMs={engine.currentTimeMs}
        abLoop={engine.abLoop}
        onChangeAbLoop={engine.setAbLoop}
        sleepMinutesLeft={engine.sleepMinutesLeft}
        onChangeSleepMinutes={engine.setSleepMinutesLeft}
      />
    </div>
  );
}
