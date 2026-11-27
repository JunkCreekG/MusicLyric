import {
  ListMusic,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { RepeatMode, Track } from '../types/music';
import { formatDuration } from '../utils/lrc';
import { AlbumArt } from './AlbumArt';

interface PlayerBarProps {
  track: Track | null;
  isPlaying: boolean;
  currentTimeMs: number;
  durationSec: number;
  volume: number;
  isMuted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  activeLyricText: string | null;
  eqEnabled: boolean;
  sleepMinutesLeft: number | null;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeekMs: (ms: number) => void;
  onVolumeChange: (val: number) => void;
  onToggleMute: () => void;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
  onOpenPlayer: () => void;
  onOpenEditor: () => void;
  onOpenEqualizer: () => void;
}

export function PlayerBar({
  track,
  isPlaying,
  currentTimeMs,
  durationSec,
  volume,
  isMuted,
  shuffle,
  repeat,
  activeLyricText,
  eqEnabled,
  sleepMinutesLeft,
  onTogglePlay,
  onPrev,
  onNext,
  onSeekMs,
  onVolumeChange,
  onToggleMute,
  onToggleShuffle,
  onCycleRepeat,
  onOpenPlayer,
  onOpenEditor,
  onOpenEqualizer,
}: PlayerBarProps) {
  const durationMs = Math.max(1000, durationSec * 1000);
  const progressPct = Math.min(100, Math.max(0, (currentTimeMs / durationMs) * 100));

  return (
    <footer className="border-t border-white/[0.08] bg-[#10131B]/95 backdrop-blur-md px-4 sm:px-6 py-2.5 shrink-0">
      {/* Slim progress scrubber */}
      <div className="flex items-center gap-3 mb-2">
        <span className="font-mono text-[11px] tabular-nums text-zinc-400 w-10 text-right shrink-0">
          {formatDuration(currentTimeMs / 1000)}
        </span>
        <div className="relative flex-1 flex items-center group">
          <input
            type="range"
            min={0}
            max={durationMs}
            step={50}
            value={Math.min(currentTimeMs, durationMs)}
            onChange={(e) => onSeekMs(Number(e.target.value))}
            disabled={!track}
            aria-label="Posisi pemutaran lagu"
            className="studio-range w-full"
            style={{
              background: `linear-gradient(to right, #f59e0b ${progressPct}%, rgba(255,255,255,0.14) ${progressPct}%)`,
              height: '4px',
              borderRadius: '2px',
            }}
          />
        </div>
        <span className="font-mono text-[11px] tabular-nums text-zinc-400 w-10 shrink-0">
          {formatDuration(durationSec)}
        </span>
      </div>

      {/* Main controls row */}
      <div className="flex items-center justify-between gap-4">
        {/* Track summary */}
        <button
          type="button"
          onClick={onOpenPlayer}
          className="flex items-center gap-3 min-w-0 flex-1 max-w-xs sm:max-w-sm text-left group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded-md"
        >
          <AlbumArt
            src={track?.coverUrl}
            alt={track ? `Sampul ${track.title}` : 'Tidak ada lagu'}
            size="sm"
            className="w-11 h-11 rounded-md shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-white truncate group-hover:text-amber-400 transition-colors">
              {track ? track.title : 'Belum ada lagu diputar'}
            </div>
            <div className="text-xs text-zinc-400 truncate">
              {activeLyricText ? (
                <span className="text-amber-300/90">{activeLyricText}</span>
              ) : track ? (
                `${track.artist} · ${track.format}`
              ) : (
                'Pilih lagu dari pustaka atau buka folder musik'
              )}
            </div>
          </div>
        </button>

        {/* Transport controls */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={onToggleShuffle}
            title="Acak Lagu"
            aria-label="Acak lagu"
            className={`hidden sm:inline-flex items-center justify-center w-9 h-9 rounded-lg transition-colors cursor-pointer ${
              shuffle ? 'text-amber-400 bg-amber-500/10' : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
            }`}
          >
            <Shuffle className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onPrev}
            disabled={!track}
            title="Lagu Sebelumnya"
            aria-label="Lagu sebelumnya"
            className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-zinc-300 hover:text-white hover:bg-white/[0.06] disabled:opacity-40 transition-colors cursor-pointer"
          >
            <SkipBack className="w-4 h-4 fill-current" />
          </button>

          <button
            type="button"
            onClick={onTogglePlay}
            disabled={!track}
            title={isPlaying ? 'Jeda' : 'Putar'}
            aria-label={isPlaying ? 'Jeda lagu' : 'Putar lagu'}
            className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-amber-500 hover:bg-amber-400 active:scale-95 disabled:opacity-40 text-[#0B0D12] transition-all cursor-pointer"
          >
            {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
          </button>

          <button
            type="button"
            onClick={onNext}
            disabled={!track}
            title="Lagu Berikutnya"
            aria-label="Lagu berikutnya"
            className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-zinc-300 hover:text-white hover:bg-white/[0.06] disabled:opacity-40 transition-colors cursor-pointer"
          >
            <SkipForward className="w-4 h-4 fill-current" />
          </button>

          <button
            type="button"
            onClick={onCycleRepeat}
            title={`Mode Ulang: ${repeat === 'one' ? 'Satu Lagu' : repeat === 'all' ? 'Semua' : 'Mati'}`}
            aria-label="Mode ulang"
            className={`hidden sm:inline-flex items-center justify-center w-9 h-9 rounded-lg transition-colors cursor-pointer ${
              repeat !== 'off'
                ? 'text-amber-400 bg-amber-500/10'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
            }`}
          >
            {repeat === 'one' ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
          </button>
        </div>

        {/* Utility controls */}
        <div className="hidden md:flex items-center justify-end gap-2 flex-1 max-w-xs">
          {sleepMinutesLeft !== null && (
            <span className="font-mono text-[11px] tabular-nums text-amber-400 mr-1 whitespace-nowrap">
              Timer {sleepMinutesLeft}m
            </span>
          )}

          <button
            type="button"
            onClick={onOpenEditor}
            disabled={!track}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-300 hover:text-white hover:bg-white/[0.06] disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ListMusic className="w-3.5 h-3.5" />
            <span>Edit LRC</span>
          </button>

          <button
            type="button"
            onClick={onOpenEqualizer}
            title="Equalizer & Efek Audio"
            aria-label="Buka Equalizer"
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              eqEnabled
                ? 'text-amber-400 bg-amber-500/10 hover:bg-amber-500/15'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>EQ</span>
          </button>

          <div className="flex items-center gap-1.5 ml-1">
            <button
              type="button"
              onClick={onToggleMute}
              aria-label={isMuted ? 'Bunyikan audio' : 'Bisukan audio'}
              className="p-1.5 rounded-md text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={isMuted ? 0 : volume}
              onChange={(e) => onVolumeChange(Number(e.target.value))}
              aria-label="Volume audio"
              className="studio-range w-20"
            />
          </div>
        </div>
      </div>
    </footer>
  );
}
