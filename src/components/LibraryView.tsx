import { useMemo, useRef, useState } from 'react';
import {
  FileAudio,
  Folder,
  FolderOpen,
  Heart,
  ListPlus,
  Pause,
  Play,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import type { LibraryTab, Playlist, Track } from '../types/music';
import { formatDuration } from '../utils/lrc';
import { AlbumArt } from './AlbumArt';

interface LibraryViewProps {
  tracks: Track[];
  currentTrackId: string | null;
  isPlaying: boolean;
  playlists: Playlist[];
  activeTab: LibraryTab;
  onChangeTab: (tab: LibraryTab) => void;
  onPlayTrack: (trackId: string) => void;
  onToggleFavorite: (trackId: string) => void;
  onOpenFolder: () => void;
  onImportFiles: (files: FileList | File[]) => void;
  onImportLrcForTrack: (trackId: string, file: File) => void;
  onCreatePlaylist: (name: string) => void;
  onAddTrackToPlaylist: (playlistId: string, trackId: string) => void;
  onRemoveTrackFromPlaylist: (playlistId: string, trackId: string) => void;
  onDeletePlaylist: (playlistId: string) => void;
  onOpenSearchLyrics: (track: Track) => void;
  onOpenEditor: (track: Track) => void;
}

const TABS: Array<{ id: LibraryTab; label: string }> = [
  { id: 'songs', label: 'Lagu' },
  { id: 'folders', label: 'Folder' },
  { id: 'albums', label: 'Album' },
  { id: 'artists', label: 'Artis' },
  { id: 'playlists', label: 'Playlist' },
  { id: 'favorites', label: 'Favorit' },
];

export function LibraryView({
  tracks,
  currentTrackId,
  isPlaying,
  playlists,
  activeTab,
  onChangeTab,
  onPlayTrack,
  onToggleFavorite,
  onOpenFolder,
  onImportFiles,
  onImportLrcForTrack,
  onCreatePlaylist,
  onAddTrackToPlaylist,
  onRemoveTrackFromPlaylist,
  onDeletePlaylist,
  onOpenSearchLyrics,
  onOpenEditor,
}: LibraryViewProps) {
  const [query, setQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [playlistPickerTrackId, setPlaylistPickerTrackId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lrcInputRef = useRef<HTMLInputElement | null>(null);
  const lrcTargetTrackRef = useRef<string | null>(null);

  const filteredTracks = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tracks.filter((t) => {
      if (activeTab === 'favorites' && !t.isFavorite) return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.album.toLowerCase().includes(q) ||
        t.folderPath.toLowerCase().includes(q)
      );
    });
  }, [tracks, activeTab, query]);

  const groups = useMemo(() => {
    if (activeTab !== 'folders' && activeTab !== 'albums' && activeTab !== 'artists') return [];
    const map = new Map<string, Track[]>();
    for (const t of filteredTracks) {
      const key =
        activeTab === 'folders' ? t.folderPath : activeTab === 'albums' ? t.album : t.artist;
      const list = map.get(key) || [];
      list.push(t);
      map.set(key, list);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredTracks, activeTab]);

  const displayedTracks = useMemo(() => {
    if (activeTab === 'folders' || activeTab === 'albums' || activeTab === 'artists') {
      if (!selectedGroup) return [];
      const found = groups.find(([name]) => name === selectedGroup);
      return found ? found[1] : [];
    }
    if (activeTab === 'playlists') {
      if (!selectedGroup) return [];
      const pl = playlists.find((p) => p.id === selectedGroup);
      if (!pl) return [];
      return pl.trackIds
        .map((id) => tracks.find((t) => t.id === id))
        .filter((t): t is Track => Boolean(t));
    }
    return filteredTracks;
  }, [activeTab, selectedGroup, groups, playlists, tracks, filteredTracks]);

  const handleTabClick = (tab: LibraryTab) => {
    setSelectedGroup(null);
    onChangeTab(tab);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onImportFiles(e.dataTransfer.files);
    }
  };

  const triggerLrcPick = (trackId: string) => {
    lrcTargetTrackRef.current = trackId;
    lrcInputRef.current?.click();
  };

  return (
    <div
      className={`flex-1 min-h-0 flex flex-col px-4 sm:px-6 py-5 max-w-6xl w-full mx-auto transition-colors ${
        isDragging ? 'bg-amber-500/[0.04]' : ''
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      {/* Hidden inputs for file fallback & LRC attach */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="audio/*,.lrc,.mp3,.flac,.wav,.ogg,.m4a,.aac,.opus"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            onImportFiles(e.target.files);
            e.target.value = '';
          }
        }}
      />
      <input
        ref={lrcInputRef}
        type="file"
        accept=".lrc,text/plain"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && lrcTargetTrackRef.current) {
            onImportLrcForTrack(lrcTargetTrackRef.current, file);
          }
          e.target.value = '';
        }}
      />

      {/* Library header & search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.08]">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-white">
            Pustaka Musik Lokal
          </h1>
          <p className="text-sm text-zinc-400 mt-0.5">
            {tracks.length} lagu tersedia · seret file audio &amp; .lrc ke sini atau buka folder perangkat
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari lagu, artis, folder..."
              className="pl-9 pr-3 py-2 w-56 sm:w-64 rounded-lg bg-[#13161F] border border-white/[0.08] text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-500/70"
            />
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#161A24] hover:bg-[#1D2230] border border-white/[0.08] text-xs font-medium text-zinc-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-amber-400" />
            <span>Tambah File</span>
          </button>
        </div>
      </div>

      {/* Music Player Pro category tabs */}
      <div className="flex items-center justify-between gap-4 py-3 border-b border-white/[0.06] overflow-x-auto">
        <div className="flex items-center gap-1 p-1 bg-[#12151E] rounded-lg border border-white/[0.06] shrink-0">
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabClick(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-amber-500 text-[#0B0D12] font-semibold'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {selectedGroup && (
          <button
            type="button"
            onClick={() => setSelectedGroup(null)}
            className="text-xs font-medium text-amber-400 hover:text-amber-300 whitespace-nowrap shrink-0 cursor-pointer"
          >
            ← Kembali ke daftar {activeTab}
          </button>
        )}
      </div>

      {/* Content area */}
      <div className="flex-1 min-h-0 overflow-y-auto py-3">
        {/* Playlists overview */}
        {activeTab === 'playlists' && !selectedGroup && (
          <div className="space-y-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newPlaylistName.trim()) return;
                onCreatePlaylist(newPlaylistName.trim());
                setNewPlaylistName('');
              }}
              className="flex items-center gap-2 max-w-md"
            >
              <input
                type="text"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                placeholder="Nama playlist baru..."
                className="flex-1 px-3 py-2 rounded-lg bg-[#13161F] border border-white/[0.08] text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-500"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#0B0D12] text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Buat</span>
              </button>
            </form>

            {playlists.length === 0 ? (
              <div className="py-12 text-center border border-dashed border-white/[0.08] rounded-xl">
                <p className="text-sm text-zinc-400">Belum ada playlist yang dibuat.</p>
                <p className="text-xs text-zinc-500 mt-1">
                  Buat playlist di atas lalu tambahkan lagu dari daftar pustaka.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.06] border border-white/[0.06] rounded-xl bg-[#10131B]">
                {playlists.map((pl) => (
                  <div
                    key={pl.id}
                    className="flex items-center justify-between px-4 py-3 hover:bg-white/[0.03] transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedGroup(pl.id)}
                      className="flex-1 text-left cursor-pointer"
                    >
                      <div className="text-sm font-semibold text-white">{pl.name}</div>
                      <div className="text-xs text-zinc-400 tabular-nums">
                        {pl.trackIds.length} lagu
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeletePlaylist(pl.id)}
                      aria-label={`Hapus playlist ${pl.name}`}
                      className="p-2 text-zinc-500 hover:text-red-400 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Group view (Folder / Album / Artis) */}
        {(activeTab === 'folders' || activeTab === 'albums' || activeTab === 'artists') &&
          !selectedGroup && (
            <div className="divide-y divide-white/[0.06] border border-white/[0.06] rounded-xl bg-[#10131B]">
              {groups.length === 0 ? (
                <div className="py-12 text-center text-sm text-zinc-400">
                  Tidak ada item yang cocok dengan pencarian Anda.
                </div>
              ) : (
                groups.map(([groupName, groupTracks]) => (
                  <button
                    key={groupName}
                    type="button"
                    onClick={() => setSelectedGroup(groupName)}
                    className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-white/[0.03] transition-colors text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-[#171B26] border border-white/[0.06] flex items-center justify-center text-amber-400 shrink-0">
                        <Folder className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white truncate">{groupName}</div>
                        <div className="text-xs text-zinc-400 tabular-nums">
                          {groupTracks.length} lagu ·{' '}
                          {groupTracks.filter((t) => Boolean(t.lrcContent.trim())).length} bersinkron LRC
                        </div>
                      </div>
                    </div>
                    <span className="text-xs text-zinc-400 shrink-0">Buka →</span>
                  </button>
                ))
              )}
            </div>
          )}

        {/* Track list */}
        {(activeTab === 'songs' || activeTab === 'favorites' || selectedGroup) && (
          <>
            {displayedTracks.length === 0 ? (
              <div className="py-14 px-6 text-center border border-dashed border-white/[0.08] rounded-xl bg-[#10131B]/60">
                <FileAudio className="w-9 h-9 text-zinc-500 mx-auto mb-3" strokeWidth={1.5} />
                <p className="text-sm font-medium text-zinc-200">
                  {activeTab === 'favorites'
                    ? 'Belum ada lagu favorit.'
                    : 'Tidak ada lagu ditemukan.'}
                </p>
                <p className="text-xs text-zinc-400 mt-1 max-w-md mx-auto">
                  Buka folder musik di perangkat Anda untuk memindai file MP3, FLAC, WAV, atau M4A beserta file .lrc secara otomatis.
                </p>
                <button
                  type="button"
                  onClick={onOpenFolder}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#0B0D12] text-xs font-semibold cursor-pointer"
                >
                  <FolderOpen className="w-4 h-4" />
                  <span>Pilih Folder Musik</span>
                </button>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.06] border border-white/[0.06] rounded-xl bg-[#10131B]">
                {displayedTracks.map((track) => {
                  const isCurrent = track.id === currentTrackId;
                  const hasLrc = track.lrcContent.trim().length > 0;
                  const activePlaylist =
                    activeTab === 'playlists' && selectedGroup
                      ? playlists.find((p) => p.id === selectedGroup)
                      : null;

                  return (
                    <div
                      key={track.id}
                      className={`group flex items-center gap-3 px-3.5 py-2.5 transition-colors ${
                        isCurrent ? 'bg-amber-500/[0.08]' : 'hover:bg-white/[0.03]'
                      }`}
                    >
                      {/* Cover + Play trigger */}
                      <button
                        type="button"
                        onClick={() => onPlayTrack(track.id)}
                        className="relative w-11 h-11 rounded-md overflow-hidden shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                        aria-label={`Putar ${track.title}`}
                      >
                        <AlbumArt src={track.coverUrl} alt={track.title} size="sm" className="w-11 h-11" />
                        <div
                          className={`absolute inset-0 flex items-center justify-center bg-black/50 transition-opacity ${
                            isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                          }`}
                        >
                          {isCurrent && isPlaying ? (
                            <Pause className="w-4 h-4 text-amber-400 fill-current" />
                          ) : (
                            <Play className="w-4 h-4 text-white fill-current ml-0.5" />
                          )}
                        </div>
                      </button>

                      {/* Main metadata (Zero-pill clean inline typography) */}
                      <button
                        type="button"
                        onClick={() => onPlayTrack(track.id)}
                        className="flex-1 min-w-0 text-left cursor-pointer"
                      >
                        <div
                          className={`text-sm font-semibold truncate ${
                            isCurrent ? 'text-amber-400' : 'text-white'
                          }`}
                        >
                          {track.title}
                        </div>
                        <div className="text-xs text-zinc-400 truncate mt-0.5">
                          <span>{track.artist}</span>
                          <span aria-hidden="true"> · </span>
                          <span>{track.album}</span>
                          <span aria-hidden="true"> · </span>
                          <span className="font-mono">{track.format}</span>
                          <span aria-hidden="true"> · </span>
                          <span className={hasLrc ? 'text-emerald-400' : 'text-zinc-500'}>
                            {hasLrc ? 'LRC Tersinkron' : 'Belum ada LRC'}
                          </span>
                        </div>
                      </button>

                      {/* Inline quick actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => onOpenSearchLyrics(track)}
                          className="hidden sm:inline-flex px-2.5 py-1.5 rounded-md text-xs font-medium text-zinc-300 hover:text-amber-400 hover:bg-white/[0.05] transition-colors whitespace-nowrap cursor-pointer"
                        >
                          Cari LRC
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenEditor(track)}
                          className="hidden md:inline-flex px-2.5 py-1.5 rounded-md text-xs font-medium text-zinc-300 hover:text-white hover:bg-white/[0.05] transition-colors whitespace-nowrap cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => triggerLrcPick(track.id)}
                          title="Muat file .lrc dari perangkat untuk lagu ini"
                          className="hidden lg:inline-flex px-2.5 py-1.5 rounded-md text-xs font-medium text-zinc-400 hover:text-white hover:bg-white/[0.05] transition-colors whitespace-nowrap cursor-pointer"
                        >
                          Impor .lrc
                        </button>

                        <button
                          type="button"
                          onClick={() => onToggleFavorite(track.id)}
                          aria-label={track.isFavorite ? 'Hapus dari favorit' : 'Tambah ke favorit'}
                          className={`p-2 rounded-md transition-colors cursor-pointer ${
                            track.isFavorite
                              ? 'text-amber-400'
                              : 'text-zinc-500 hover:text-zinc-200'
                          }`}
                        >
                          <Heart className={`w-4 h-4 ${track.isFavorite ? 'fill-current' : ''}`} />
                        </button>

                        {activePlaylist ? (
                          <button
                            type="button"
                            onClick={() => onRemoveTrackFromPlaylist(activePlaylist.id, track.id)}
                            title="Hapus dari playlist"
                            className="p-2 rounded-md text-zinc-500 hover:text-red-400 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        ) : (
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() =>
                                setPlaylistPickerTrackId((prev) =>
                                  prev === track.id ? null : track.id
                                )
                              }
                              title="Tambahkan ke playlist"
                              aria-label="Tambahkan ke playlist"
                              className="p-2 rounded-md text-zinc-500 hover:text-white transition-colors cursor-pointer"
                            >
                              <ListPlus className="w-4 h-4" />
                            </button>

                            {playlistPickerTrackId === track.id && (
                              <div className="absolute right-0 top-full mt-1 w-48 rounded-lg bg-[#181C28] border border-white/[0.1] shadow-xl z-20 p-1.5">
                                <div className="px-2 py-1 text-[11px] font-medium text-zinc-400">
                                  Simpan ke Playlist
                                </div>
                                {playlists.length === 0 ? (
                                  <div className="px-2 py-2 text-xs text-zinc-500">
                                    Belum ada playlist. Buat di tab Playlist.
                                  </div>
                                ) : (
                                  playlists.map((pl) => (
                                    <button
                                      key={pl.id}
                                      type="button"
                                      onClick={() => {
                                        onAddTrackToPlaylist(pl.id, track.id);
                                        setPlaylistPickerTrackId(null);
                                      }}
                                      className="w-full text-left px-2.5 py-1.5 rounded text-xs text-zinc-200 hover:bg-amber-500 hover:text-[#0B0D12] transition-colors cursor-pointer"
                                    >
                                      {pl.name}
                                    </button>
                                  ))
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        <span className="font-mono text-xs tabular-nums text-zinc-400 w-11 text-right">
                          {formatDuration(track.duration)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
