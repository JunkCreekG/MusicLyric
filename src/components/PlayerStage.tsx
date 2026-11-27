import { useEffect, useMemo, useRef } from 'react';
import {
  Edit3,
  FolderDown,
  Heart,
  Minus,
  Plus,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import type { Track } from '../types/music';
import {
  findActiveLineIndex,
  formatDuration,
  formatLrcTag,
  parseLrc,
  serializeLrc,
} from '../utils/lrc';
import { AlbumArt } from './AlbumArt';
import { SpectrumBars } from './SpectrumBars';

interface PlayerStageProps {
  track: Track | null;
  isPlaying: boolean;
  currentTimeMs: number;
  durationSec: number;
  analyserNode: AnalyserNode | null;
  onSeekMs: (ms: number) => void;
  onToggleFavorite: (trackId: string) => void;
  onUpdateTrackLrc: (trackId: string, newLrc: string, source?: Track['lrcSource']) => void;
  onSaveToFolder: (track: Track) => void;
  onOpenEditor: () => void;
  onOpenOnlineSearch: () => void;
  onOpenEqualizer: () => void;
}

export function PlayerStage({
  track,
  isPlaying,
  currentTimeMs,
  durationSec,
  analyserNode,
  onSeekMs,
  onToggleFavorite,
  onUpdateTrackLrc,
  onSaveToFolder,
  onOpenEditor,
  onOpenOnlineSearch,
  onOpenEqualizer,
}: PlayerStageProps) {
  const activeLineRef = useRef<HTMLButtonElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const parsed = useMemo(() => {
    if (!track) return { metadata: {}, lines: [], hasTimestamps: false };
    return parseLrc(track.lrcContent);
  }, [track]);

  const offsetMs = parsed.metadata.offset ?? 0;

  const activeIndex = useMemo(() => {
    if (!parsed.hasTimestamps) return -1;
    return findActiveLineIndex(parsed.lines, currentTimeMs, offsetMs);
  }, [parsed.hasTimestamps, parsed.lines, currentTimeMs, offsetMs]);

  useEffect(() => {
    if (activeLineRef.current && containerRef.current) {
      activeLineRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [activeIndex]);

  const handleAdjustOffset = (deltaMs: number) => {
    if (!track) return;
    const nextOffset = offsetMs + deltaMs;
    const updated = serializeLrc(parsed.lines, {
      ...parsed.metadata,
      offset: nextOffset,
    });
    onUpdateTrackLrc(track.id, updated, 'edited');
  };

  if (!track) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <h2 className="font-display text-xl font-bold text-white">Pilih Lagu Terlebih Dahulu</h2>
          <p className="text-sm text-zinc-400 mt-2">
            Buka pustaka atau muat folder musik perangkat untuk memulai pemutaran dan sinkronisasi lirik .lrc.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 px-4 sm:px-6 py-5 max-w-6xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
      {/* Left column: Artwork, metadata, spectrum, and quick actions */}
      <div className="lg:col-span-5 flex flex-col justify-between bg-[#10131B] border border-white/[0.07] rounded-xl p-5">
        <div>
          <div className="aspect-square w-full max-w-[320px] mx-auto rounded-lg overflow-hidden">
            <AlbumArt
              src={track.coverUrl}
              alt={`Sampul album ${track.title}`}
              size="lg"
              className="w-full h-full"
            />
          </div>

          <div className="mt-5 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-display text-xl font-bold text-white truncate">
                {track.title}
              </h1>
              <p className="text-sm text-zinc-300 truncate mt-0.5">
                {track.artist} · {track.album}
              </p>
              <p className="font-mono text-xs tabular-nums text-zinc-500 mt-1">
                {track.format} · {formatDuration(durationSec)} ·{' '}
                {track.lrcSource === 'folder'
                  ? 'LRC Folder'
                  : track.lrcSource === 'online'
                    ? 'LRC Online'
                    : track.lrcSource === 'edited'
                      ? 'LRC Diedit'
                      : track.lrcSource === 'sample'
                        ? 'LRC Sampel'
                        : 'Tanpa LRC'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onToggleFavorite(track.id)}
              aria-label="Favoritkan lagu"
              className={`p-2 rounded-lg border border-white/[0.08] transition-colors shrink-0 cursor-pointer ${
                track.isFavorite
                  ? 'text-amber-400 bg-amber-500/10'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Heart className={`w-4 h-4 ${track.isFavorite ? 'fill-current' : ''}`} />
            </button>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <div className="pt-3 border-t border-white/[0.06]">
            <SpectrumBars analyserNode={analyserNode} isPlaying={isPlaying} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onOpenOnlineSearch}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#171B26] hover:bg-[#1E2433] border border-white/[0.08] text-xs font-medium text-zinc-200 transition-colors cursor-pointer"
            >
              <Search className="w-3.5 h-3.5 text-amber-400" />
              <span>Cari Lirik Online</span>
            </button>

            <button
              type="button"
              onClick={onOpenEditor}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#171B26] hover:bg-[#1E2433] border border-white/[0.08] text-xs font-medium text-zinc-200 transition-colors cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5 text-amber-400" />
              <span>Edit Real-Time</span>
            </button>

            <button
              type="button"
              onClick={() => onSaveToFolder(track)}
              disabled={!track.lrcContent.trim()}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-[#0B0D12] text-xs font-semibold transition-colors cursor-pointer"
            >
              <FolderDown className="w-3.5 h-3.5" />
              <span>Simpan .lrc ke Folder</span>
            </button>

            <button
              type="button"
              onClick={onOpenEqualizer}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#171B26] hover:bg-[#1E2433] border border-white/[0.08] text-xs font-medium text-zinc-200 transition-colors cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-300" />
              <span>Equalizer &amp; Efek</span>
            </button>
          </div>
        </div>
      </div>

      {/* Right column: Real-time Auto-Synced LRC Lyrics Stage */}
      <div className="lg:col-span-7 flex flex-col min-h-[380px] bg-[#10131B] border border-white/[0.07] rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-white/[0.07] flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-sm font-semibold text-white">
              Lirik Tersinkronisasi Otomatis
            </h2>
            <p className="text-xs text-zinc-400">
              {parsed.hasTimestamps
                ? 'Ketuk baris lirik mana saja untuk melompat ke waktu tersebut'
                : 'Belum ada timestamp .lrc · gunakan Editor Real-Time untuk sinkronisasi'}
            </p>
          </div>

          {parsed.hasTimestamps && (
            <div className="flex items-center gap-1.5 bg-[#161A24] border border-white/[0.08] rounded-lg px-2 py-1">
              <button
                type="button"
                onClick={() => handleAdjustOffset(-500)}
                title="Lirik lebih cepat 0.5 detik"
                className="px-1.5 py-0.5 text-[11px] font-mono text-zinc-300 hover:text-amber-400 cursor-pointer"
              >
                -0.5s
              </button>
              <button
                type="button"
                onClick={() => handleAdjustOffset(-100)}
                aria-label="Kurangi offset 100ms"
                className="p-1 text-zinc-400 hover:text-white cursor-pointer"
              >
                <Minus className="w-3 h-3" />
              </button>
              <span className="font-mono text-[11px] tabular-nums text-zinc-300 px-1">
                {offsetMs >= 0 ? `+${offsetMs}` : offsetMs}ms
              </span>
              <button
                type="button"
                onClick={() => handleAdjustOffset(100)}
                aria-label="Tambah offset 100ms"
                className="p-1 text-zinc-400 hover:text-white cursor-pointer"
              >
                <Plus className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => handleAdjustOffset(500)}
                title="Lirik lebih lambat 0.5 detik"
                className="px-1.5 py-0.5 text-[11px] font-mono text-zinc-300 hover:text-amber-400 cursor-pointer"
              >
                +0.5s
              </button>
            </div>
          )}
        </div>

        <div
          ref={containerRef}
          className="flex-1 min-h-0 overflow-y-auto px-6 py-8 space-y-3"
        >
          {parsed.lines.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-12">
              <p className="text-sm font-medium text-zinc-300">
                Lirik untuk &ldquo;{track.title}&rdquo; belum tersedia.
              </p>
              <p className="text-xs text-zinc-500 mt-1 max-w-sm">
                Cari file .lrc secara online di Lyricsify.com atau LRCLIB, atau ketik &amp; sinkronkan sendiri secara real time.
              </p>
              <div className="flex items-center gap-2.5 mt-4">
                <button
                  type="button"
                  onClick={onOpenOnlineSearch}
                  className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#0B0D12] text-xs font-semibold cursor-pointer"
                >
                  Cari Lirik Online
                </button>
                <button
                  type="button"
                  onClick={onOpenEditor}
                  className="px-4 py-2 rounded-lg bg-[#171B26] hover:bg-[#1E2433] border border-white/[0.08] text-xs font-medium text-white cursor-pointer"
                >
                  Buka Editor LRC
                </button>
              </div>
            </div>
          ) : (
            parsed.lines.map((line, idx) => {
              const isActive = idx === activeIndex;
              const isPast = activeIndex !== -1 && idx < activeIndex;
              return (
                <button
                  key={line.id}
                  ref={isActive ? activeLineRef : undefined}
                  type="button"
                  onClick={() => {
                    if (line.timeMs !== null) {
                      onSeekMs(Math.max(0, line.timeMs + offsetMs));
                    }
                  }}
                  className={`w-full text-left flex items-baseline gap-3 px-3 py-2 rounded-lg transition-all duration-150 ${
                    line.timeMs !== null ? 'cursor-pointer hover:bg-white/[0.04]' : 'cursor-default'
                  } ${isActive ? 'bg-amber-500/[0.1]' : ''}`}
                >
                  <span className="font-mono text-[11px] tabular-nums text-zinc-500 shrink-0 w-20">
                    {formatLrcTag(line.timeMs)}
                  </span>
                  <span
                    className={`text-base sm:text-lg leading-relaxed transition-colors ${
                      isActive
                        ? 'text-amber-300 font-semibold'
                        : isPast
                          ? 'text-zinc-500 font-normal'
                          : 'text-zinc-200 font-medium'
                    }`}
                  >
                    {line.text}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
