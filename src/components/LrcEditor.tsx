import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowUpDown,
  ClipboardPaste,
  Clock,
  Download,
  FolderDown,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  RotateCw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import type { LrcLine, LrcMetadata, Track } from '../types/music';
import {
  findActiveLineIndex,
  formatLrcTag,
  nextLineId,
  parseLrc,
  serializeLrc,
} from '../utils/lrc';

interface LrcEditorProps {
  track: Track | null;
  isPlaying: boolean;
  currentTimeMs: number;
  onTogglePlay: () => void;
  onSeekMs: (ms: number) => void;
  onUpdateTrackLrc: (trackId: string, newLrc: string, source?: Track['lrcSource']) => void;
  onSaveToFolder: (track: Track, overrideLrc?: string) => void;
  onDownloadLrc: (track: Track, overrideLrc?: string) => void;
  onPersistToDb: (track: Track, lrcText: string) => void;
}

type EditorTab = 'tap' | 'raw';

export function LrcEditor({
  track,
  isPlaying,
  currentTimeMs,
  onTogglePlay,
  onSeekMs,
  onUpdateTrackLrc,
  onSaveToFolder,
  onDownloadLrc,
  onPersistToDb,
}: LrcEditorProps) {
  const [editorTab, setEditorTab] = useState<EditorTab>('tap');
  const [lines, setLines] = useState<LrcLine[]>([]);
  const [metadata, setMetadata] = useState<LrcMetadata>({});
  const [rawText, setRawText] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteBuffer, setPasteBuffer] = useState('');

  // Sync editor state when switching tracks
  useEffect(() => {
    if (!track) {
      setLines([]);
      setMetadata({});
      setRawText('');
      return;
    }
    const parsed = parseLrc(track.lrcContent);
    const meta: LrcMetadata = {
      ti: parsed.metadata.ti || track.title,
      ar: parsed.metadata.ar || track.artist,
      al: parsed.metadata.al || track.album,
      offset: parsed.metadata.offset ?? 0,
    };
    setLines(
      parsed.lines.length > 0
        ? parsed.lines
        : [{ id: nextLineId(), timeMs: null, text: '' }]
    );
    setMetadata(meta);
    setRawText(
      track.lrcContent.trim()
        ? track.lrcContent
        : serializeLrc([], meta)
    );
    setSelectedIndex(0);
  }, [track?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const commitLinesRealTime = useCallback(
    (nextLines: LrcLine[], nextMeta: LrcMetadata) => {
      setLines(nextLines);
      setMetadata(nextMeta);
      const serialized = serializeLrc(nextLines, nextMeta);
      setRawText(serialized);
      if (track) {
        onUpdateTrackLrc(track.id, serialized, 'edited');
      }
    },
    [track, onUpdateTrackLrc]
  );

  const handleRawChange = (value: string) => {
    setRawText(value);
    const parsed = parseLrc(value);
    setLines(parsed.lines);
    setMetadata(parsed.metadata);
    if (track) {
      onUpdateTrackLrc(track.id, value, 'edited');
    }
  };

  const stampSelectedLine = useCallback(() => {
    if (!track || lines.length === 0) return;
    const idx = Math.min(Math.max(0, selectedIndex), lines.length - 1);
    const stampedTime = Math.max(0, Math.round(currentTimeMs));
    const nextLines = lines.map((line, i) =>
      i === idx ? { ...line, timeMs: stampedTime } : line
    );
    commitLinesRealTime(nextLines, metadata);
    if (idx < nextLines.length - 1) {
      setSelectedIndex(idx + 1);
    }
  }, [track, lines, selectedIndex, currentTimeMs, metadata, commitLinesRealTime]);

  // Keyboard shortcut: Space stamps timestamp in Tap-to-Sync mode when not typing in an input/textarea
  useEffect(() => {
    if (editorTab !== 'tap') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.code === 'Space') {
        e.preventDefault();
        stampSelectedLine();
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(lines.length - 1, prev + 1));
      } else if (e.code === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(0, prev - 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editorTab, stampSelectedLine, lines.length]);

  const activePreviewIndex = useMemo(() => {
    return findActiveLineIndex(lines, currentTimeMs, metadata.offset ?? 0);
  }, [lines, currentTimeMs, metadata.offset]);

  const nudgeLineTime = (index: number, deltaMs: number) => {
    const nextLines = lines.map((line, i) => {
      if (i !== index) return line;
      const base = line.timeMs ?? Math.round(currentTimeMs);
      return { ...line, timeMs: Math.max(0, base + deltaMs) };
    });
    commitLinesRealTime(nextLines, metadata);
  };

  const shiftAllTimestamps = (deltaMs: number) => {
    const nextLines = lines.map((line) =>
      line.timeMs !== null ? { ...line, timeMs: Math.max(0, line.timeMs + deltaMs) } : line
    );
    commitLinesRealTime(nextLines, metadata);
  };

  const sortLinesByTime = () => {
    const timed = lines.filter((l) => l.timeMs !== null).sort((a, b) => (a.timeMs ?? 0) - (b.timeMs ?? 0));
    const untimed = lines.filter((l) => l.timeMs === null);
    commitLinesRealTime([...timed, ...untimed], metadata);
  };

  const updateLineText = (index: number, text: string) => {
    const nextLines = lines.map((line, i) => (i === index ? { ...line, text } : line));
    commitLinesRealTime(nextLines, metadata);
  };

  const insertLineAfter = (index: number) => {
    const nextLines = [
      ...lines.slice(0, index + 1),
      { id: nextLineId(), timeMs: null, text: '' },
      ...lines.slice(index + 1),
    ];
    commitLinesRealTime(nextLines, metadata);
    setSelectedIndex(index + 1);
  };

  const removeLine = (index: number) => {
    const nextLines = lines.filter((_, i) => i !== index);
    commitLinesRealTime(
      nextLines.length > 0 ? nextLines : [{ id: nextLineId(), timeMs: null, text: '' }],
      metadata
    );
    setSelectedIndex((prev) => Math.max(0, Math.min(prev, nextLines.length - 1)));
  };

  const applyPlainLyrics = () => {
    const split = pasteBuffer
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (split.length === 0) return;

    // Parse in case user pasted already-timed LRC text
    const parsed = parseLrc(pasteBuffer);
    if (parsed.hasTimestamps && parsed.lines.length > 0) {
      commitLinesRealTime(parsed.lines, {
        ...metadata,
        ...parsed.metadata,
      });
    } else {
      const nextLines: LrcLine[] = split.map((text) => ({
        id: nextLineId(),
        timeMs: null,
        text,
      }));
      commitLinesRealTime(nextLines, metadata);
    }
    setSelectedIndex(0);
    setPasteBuffer('');
    setShowPasteModal(false);
  };

  if (!track) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <h2 className="font-display text-xl font-bold text-white">Editor LRC Real-Time</h2>
          <p className="text-sm text-zinc-400 mt-2">
            Pilih lagu dari pustaka untuk membuat, menyunting, atau menyinkronkan file .lrc secara langsung.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col px-4 sm:px-6 py-4 max-w-6xl w-full mx-auto gap-4">
      {/* Top toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-white/[0.08]">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-bold text-white truncate">
            Editor LRC Real-Time · {track.title}
          </h1>
          <p className="text-xs text-zinc-400 truncate mt-0.5">
            {track.artist} · Setiap perubahan langsung tersinkron ke pemutar audio
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Mode switch */}
          <div className="flex items-center gap-1 p-1 bg-[#12151E] border border-white/[0.08] rounded-lg">
            <button
              type="button"
              onClick={() => setEditorTab('tap')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                editorTab === 'tap'
                  ? 'bg-amber-500 text-[#0B0D12] font-semibold'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Sinkronisasi Ketuk
            </button>
            <button
              type="button"
              onClick={() => setEditorTab('raw')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                editorTab === 'raw'
                  ? 'bg-amber-500 text-[#0B0D12] font-semibold'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Teks .LRC Langsung
            </button>
          </div>

          <button
            type="button"
            onClick={() => onPersistToDb(track, rawText)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#161A24] hover:bg-[#1E2433] border border-white/[0.08] text-xs font-medium text-zinc-200 whitespace-nowrap cursor-pointer"
          >
            <Save className="w-3.5 h-3.5 text-zinc-300" />
            <span>Simpan Memori</span>
          </button>

          <button
            type="button"
            onClick={() => onDownloadLrc(track, rawText)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#161A24] hover:bg-[#1E2433] border border-white/[0.08] text-xs font-medium text-zinc-200 whitespace-nowrap cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-zinc-300" />
            <span>Unduh .lrc</span>
          </button>

          <button
            type="button"
            onClick={() => onSaveToFolder(track, rawText)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#0B0D12] text-xs font-semibold whitespace-nowrap cursor-pointer"
          >
            <FolderDown className="w-3.5 h-3.5" />
            <span>Simpan ke Folder</span>
          </button>
        </div>
      </div>

      {/* Paste plain lyrics drawer */}
      {showPasteModal && (
        <div className="bg-[#121620] border border-amber-500/30 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">
              Tempel Lirik Polos atau Teks .LRC
            </h2>
            <button
              type="button"
              onClick={() => setShowPasteModal(false)}
              className="p-1 text-zinc-400 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <textarea
            rows={5}
            value={pasteBuffer}
            onChange={(e) => setPasteBuffer(e.target.value)}
            placeholder="Tempel lirik baris per baris di sini (dari Lyricsify, catatan, atau web)..."
            className="w-full rounded-lg bg-[#0B0D12] border border-white/[0.08] p-3 text-xs font-mono text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-500"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowPasteModal(false)}
              className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-white cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={applyPlainLyrics}
              className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#0B0D12] text-xs font-semibold cursor-pointer"
            >
              Muat ke Baris Editor
            </button>
          </div>
        </div>
      )}

      {/* Main split workspace: Editor (left 7 cols) + Live Sync Preview (right 5 cols) */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Editor Panel */}
        <div className="lg:col-span-7 flex flex-col min-h-[340px] bg-[#10131B] border border-white/[0.07] rounded-xl overflow-hidden">
          {editorTab === 'tap' ? (
            <>
              {/* Musicolet-style Tap-to-Sync Transport & Stamp Header */}
              <div className="p-3.5 border-b border-white/[0.07] bg-[#131722] flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onTogglePlay}
                    className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#0B0D12] cursor-pointer"
                    aria-label={isPlaying ? 'Jeda' : 'Putar'}
                  >
                    {isPlaying ? (
                      <Pause className="w-4 h-4 fill-current" />
                    ) : (
                      <Play className="w-4 h-4 fill-current ml-0.5" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => onSeekMs(currentTimeMs - 2000)}
                    title="Mundur 2 detik"
                    className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md bg-white/[0.05] hover:bg-white/[0.1] text-xs font-mono text-zinc-300 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>2s</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onSeekMs(currentTimeMs + 2000)}
                    title="Maju 2 detik"
                    className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md bg-white/[0.05] hover:bg-white/[0.1] text-xs font-mono text-zinc-300 cursor-pointer"
                  >
                    <span>2s</span>
                    <RotateCw className="w-3.5 h-3.5" />
                  </button>

                  <span className="font-mono text-sm font-semibold tabular-nums text-amber-400 px-2">
                    {formatLrcTag(currentTimeMs)}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={stampSelectedLine}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-[#0B0D12] text-xs font-bold transition-all whitespace-nowrap cursor-pointer"
                >
                  <Clock className="w-4 h-4" />
                  <span>Tetapkan Waktu Baris #{selectedIndex + 1} (Space)</span>
                </button>
              </div>

              {/* Bulk utility toolbar */}
              <div className="px-3.5 py-2 border-b border-white/[0.06] flex items-center justify-between gap-2 flex-wrap text-xs">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setShowPasteModal((v) => !v)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-white/[0.05] hover:bg-white/[0.09] text-zinc-200 cursor-pointer"
                  >
                    <ClipboardPaste className="w-3.5 h-3.5 text-amber-400" />
                    <span>Tempel Lirik</span>
                  </button>

                  <button
                    type="button"
                    onClick={sortLinesByTime}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-white/[0.05] hover:bg-white/[0.09] text-zinc-200 cursor-pointer"
                  >
                    <ArrowUpDown className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Urutkan Waktu</span>
                  </button>
                </div>

                <div className="flex items-center gap-1 text-zinc-400 font-mono text-[11px]">
                  <span>Geser semua:</span>
                  <button
                    type="button"
                    onClick={() => shiftAllTimestamps(-500)}
                    className="px-1.5 py-0.5 rounded hover:bg-white/[0.08] text-zinc-300 cursor-pointer"
                  >
                    -0.5s
                  </button>
                  <button
                    type="button"
                    onClick={() => shiftAllTimestamps(-100)}
                    className="px-1.5 py-0.5 rounded hover:bg-white/[0.08] text-zinc-300 cursor-pointer"
                  >
                    -0.1s
                  </button>
                  <button
                    type="button"
                    onClick={() => shiftAllTimestamps(100)}
                    className="px-1.5 py-0.5 rounded hover:bg-white/[0.08] text-zinc-300 cursor-pointer"
                  >
                    +0.1s
                  </button>
                  <button
                    type="button"
                    onClick={() => shiftAllTimestamps(500)}
                    className="px-1.5 py-0.5 rounded hover:bg-white/[0.08] text-zinc-300 cursor-pointer"
                  >
                    +0.5s
                  </button>
                </div>
              </div>

              {/* Lines list */}
              <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-white/[0.05]">
                {lines.map((line, idx) => {
                  const isSelected = idx === selectedIndex;
                  const isCurrentlyPlaying = idx === activePreviewIndex;
                  return (
                    <div
                      key={line.id}
                      onClick={() => setSelectedIndex(idx)}
                      className={`flex items-center gap-2 px-3 py-2 transition-colors ${
                        isSelected
                          ? 'bg-amber-500/[0.1]'
                          : isCurrentlyPlaying
                            ? 'bg-emerald-500/[0.07]'
                            : 'hover:bg-white/[0.03]'
                      }`}
                    >
                      <span className="font-mono text-[11px] tabular-nums text-zinc-500 w-6 text-right shrink-0">
                        {idx + 1}
                      </span>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (line.timeMs !== null) {
                            onSeekMs(line.timeMs);
                          } else {
                            const stamped = Math.max(0, Math.round(currentTimeMs));
                            const nextLines = lines.map((l, i) =>
                              i === idx ? { ...l, timeMs: stamped } : l
                            );
                            commitLinesRealTime(nextLines, metadata);
                          }
                        }}
                        title={
                          line.timeMs !== null
                            ? 'Klik untuk putar dari timestamp ini'
                            : 'Klik untuk tetapkan waktu saat ini'
                        }
                        className={`font-mono text-xs tabular-nums px-2 py-1 rounded border shrink-0 cursor-pointer ${
                          line.timeMs !== null
                            ? 'bg-[#171B26] border-white/[0.08] text-amber-300 hover:border-amber-400'
                            : 'bg-[#12151E] border-dashed border-white/[0.12] text-zinc-500 hover:text-amber-300'
                        }`}
                      >
                        {formatLrcTag(line.timeMs)}
                      </button>

                      <div className="hidden sm:flex items-center shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            nudgeLineTime(idx, -100);
                          }}
                          title="Kurangi 0.1 detik"
                          className="p-1 text-zinc-500 hover:text-white cursor-pointer"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            nudgeLineTime(idx, 100);
                          }}
                          title="Tambah 0.1 detik"
                          className="p-1 text-zinc-500 hover:text-white cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <input
                        type="text"
                        value={line.text}
                        onFocus={() => setSelectedIndex(idx)}
                        onChange={(e) => updateLineText(idx, e.target.value)}
                        placeholder="Ketik baris lirik..."
                        className="flex-1 min-w-0 bg-transparent text-sm text-white placeholder:text-zinc-600 focus:outline-none px-1.5 py-1 rounded focus:bg-white/[0.04]"
                      />

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          insertLineAfter(idx);
                        }}
                        title="Tambah baris di bawah"
                        className="p-1.5 text-zinc-500 hover:text-amber-400 cursor-pointer shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeLine(idx);
                        }}
                        title="Hapus baris"
                        className="p-1.5 text-zinc-500 hover:text-red-400 cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            /* Raw real-time .lrc text editor */
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="p-3 border-b border-white/[0.07] grid grid-cols-2 sm:grid-cols-4 gap-2 bg-[#131722]">
                <label className="block">
                  <span className="text-[11px] text-zinc-400 block mb-1">Judul [ti]</span>
                  <input
                    type="text"
                    value={metadata.ti || ''}
                    onChange={(e) =>
                      commitLinesRealTime(lines, { ...metadata, ti: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 rounded bg-[#0B0D12] border border-white/[0.08] text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] text-zinc-400 block mb-1">Artis [ar]</span>
                  <input
                    type="text"
                    value={metadata.ar || ''}
                    onChange={(e) =>
                      commitLinesRealTime(lines, { ...metadata, ar: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 rounded bg-[#0B0D12] border border-white/[0.08] text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] text-zinc-400 block mb-1">Album [al]</span>
                  <input
                    type="text"
                    value={metadata.al || ''}
                    onChange={(e) =>
                      commitLinesRealTime(lines, { ...metadata, al: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 rounded bg-[#0B0D12] border border-white/[0.08] text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] text-zinc-400 block mb-1">Offset (ms)</span>
                  <input
                    type="number"
                    step={50}
                    value={metadata.offset ?? 0}
                    onChange={(e) =>
                      commitLinesRealTime(lines, {
                        ...metadata,
                        offset: parseInt(e.target.value || '0', 10) || 0,
                      })
                    }
                    className="w-full px-2.5 py-1.5 rounded bg-[#0B0D12] border border-white/[0.08] text-xs font-mono tabular-nums text-white focus:outline-none focus:border-amber-500"
                  />
                </label>
              </div>

              <textarea
                value={rawText}
                onChange={(e) => handleRawChange(e.target.value)}
                spellCheck={false}
                placeholder="[00:12.34] Ketik atau tempel format .lrc di sini..."
                className="flex-1 min-h-0 w-full p-4 bg-[#0B0D12] font-mono text-xs sm:text-sm leading-relaxed text-zinc-100 placeholder:text-zinc-600 focus:outline-none resize-none"
              />
            </div>
          )}
        </div>

        {/* Right: Real-Time Live Sync Preview */}
        <div className="lg:col-span-5 flex flex-col min-h-[260px] bg-[#10131B] border border-white/[0.07] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/[0.07] flex items-center justify-between">
            <div>
              <h2 className="font-display text-sm font-semibold text-white">
                Pratinjau Sinkronisasi Langsung
              </h2>
              <p className="text-xs text-zinc-400">
                Ketuk baris untuk menguji kesesuaian audio
              </p>
            </div>
            <span className="font-mono text-xs tabular-nums text-amber-400">
              {formatLrcTag(currentTimeMs)}
            </span>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2">
            {lines.length === 0 ? (
              <p className="text-xs text-zinc-500 text-center py-8">
                Belum ada baris lirik.
              </p>
            ) : (
              lines.map((line, idx) => {
                const isActive = idx === activePreviewIndex;
                return (
                  <button
                    key={line.id}
                    type="button"
                    onClick={() => {
                      if (line.timeMs !== null) {
                        onSeekMs(Math.max(0, line.timeMs + (metadata.offset ?? 0)));
                      }
                    }}
                    className={`w-full text-left flex items-baseline gap-2.5 px-3 py-2 rounded-lg transition-colors ${
                      line.timeMs !== null ? 'cursor-pointer hover:bg-white/[0.04]' : 'cursor-default'
                    } ${isActive ? 'bg-amber-500/15' : ''}`}
                  >
                    <span className="font-mono text-[11px] tabular-nums text-zinc-500 shrink-0">
                      {formatLrcTag(line.timeMs)}
                    </span>
                    <span
                      className={`text-sm leading-snug ${
                        isActive ? 'text-amber-300 font-semibold' : 'text-zinc-300'
                      }`}
                    >
                      {line.text || '—'}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
