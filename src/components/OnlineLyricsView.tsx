import { useEffect, useState } from 'react';
import {
  Check,
  Edit3,
  ExternalLink,
  FolderDown,
  Globe,
  Loader2,
  Search,
} from 'lucide-react';
import type { OnlineLyricResult, Track } from '../types/music';
import { formatDuration } from '../utils/lrc';

interface OnlineLyricsViewProps {
  currentTrack: Track | null;
  onApplyLrc: (trackId: string, lrcText: string, saveToFolderToo: boolean, openEditorAfter: boolean) => void;
}

export function OnlineLyricsView({ currentTrack, onApplyLrc }: OnlineLyricsViewProps) {
  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'lyricsify' | 'lrclib'>('all');
  const [directUrl, setDirectUrl] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isFetchingDetail, setIsFetchingDetail] = useState(false);
  const [results, setResults] = useState<OnlineLyricResult[]>([]);
  const [lyricsifyStatus, setLyricsifyStatus] = useState<'ok' | 'blocked' | 'empty' | null>(null);
  const [selectedResult, setSelectedResult] = useState<OnlineLyricResult | null>(null);
  const [previewLrc, setPreviewLrc] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (currentTrack) {
      const suggestion =
        currentTrack.artist && currentTrack.artist !== 'Artis Lokal'
          ? `${currentTrack.artist} ${currentTrack.title}`
          : currentTrack.title;
      setQuery(suggestion);
    }
  }, [currentTrack?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    setIsSearching(true);
    setErrorMsg(null);
    setSelectedResult(null);
    setPreviewLrc('');

    try {
      const resp = await fetch(
        `/api/lyrics/search?q=${encodeURIComponent(trimmed)}&source=${encodeURIComponent(sourceFilter)}`
      );
      const data = await resp.json();
      if (!resp.ok) {
        setErrorMsg(data.error || 'Gagal mencari lirik online.');
        setResults([]);
        return;
      }
      setResults(data.results || []);
      setLyricsifyStatus(data.lyricsifyStatus || null);
      if ((data.results || []).length === 0) {
        setErrorMsg('Tidak ditemukan hasil untuk kata kunci tersebut. Coba judul lagu atau artis yang lebih spesifik.');
      }
    } catch {
      setErrorMsg('Tidak dapat terhubung ke layanan pencarian lirik.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectResult = async (item: OnlineLyricResult) => {
    setSelectedResult(item);
    setErrorMsg(null);

    if (item.source === 'lrclib' && (item.syncedLyrics || item.plainLyrics)) {
      const header = `[ti:${item.title}]\n[ar:${item.artist}]${
        item.album ? `\n[al:${item.album}]` : ''
      }\n\n`;
      setPreviewLrc(header + (item.syncedLyrics || item.plainLyrics || ''));
      return;
    }

    setIsFetchingDetail(true);
    try {
      const params =
        item.source === 'lyricsify' && item.url
          ? `source=lyricsify&url=${encodeURIComponent(item.url)}`
          : `source=lrclib&id=${encodeURIComponent(item.id)}`;
      const resp = await fetch(`/api/lyrics/fetch?${params}`);
      const data = await resp.json();
      if (!resp.ok) {
        setErrorMsg(data.error || 'Gagal memuat detail lirik .lrc.');
        setPreviewLrc('');
        return;
      }
      setPreviewLrc(data.lrcText || '');
    } catch {
      setErrorMsg('Gagal mengambil file .lrc dari server.');
    } finally {
      setIsFetchingDetail(false);
    }
  };

  const handleFetchDirectUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = directUrl.trim();
    if (!trimmed) return;

    setIsFetchingDetail(true);
    setErrorMsg(null);
    setSelectedResult(null);

    try {
      const resp = await fetch(
        `/api/lyrics/fetch?source=lyricsify&url=${encodeURIComponent(trimmed)}`
      );
      const data = await resp.json();
      if (!resp.ok) {
        setErrorMsg(data.error || 'Gagal mengambil lirik dari URL Lyricsify.');
        return;
      }
      setPreviewLrc(data.lrcText || '');
      setSelectedResult({
        id: 'direct-lyricsify',
        source: 'lyricsify',
        title: data.title || currentTrack?.title || 'Lirik Lyricsify',
        artist: data.artist || currentTrack?.artist || '',
        url: trimmed,
        hasSynced: Boolean(data.hasSynced),
      });
    } catch {
      setErrorMsg('Gagal terhubung ke URL Lyricsify.com.');
    } finally {
      setIsFetchingDetail(false);
    }
  };

  const externalLyricsifyUrl = `https://www.lyricsify.com/search?q=${encodeURIComponent(
    query.trim() || currentTrack?.title || ''
  )}`;

  return (
    <div className="flex-1 min-h-0 flex flex-col px-4 sm:px-6 py-5 max-w-6xl w-full mx-auto gap-4">
      {/* Header & Search Controls */}
      <div className="space-y-3 pb-4 border-b border-white/[0.08]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h1 className="font-display text-xl font-bold text-white">
              Cari Lirik .LRC Online
            </h1>
            <p className="text-xs text-zinc-400 mt-0.5">
              Pencarian terintegrasi dari Lyricsify.com &amp; LRCLIB · Terapkan ke lagu:{' '}
              <span className="text-amber-400 font-medium">
                {currentTrack ? `${currentTrack.artist} — ${currentTrack.title}` : 'Belum ada lagu dipilih'}
              </span>
            </p>
          </div>

          <a
            href={externalLyricsifyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-300 hover:text-amber-400 transition-colors whitespace-nowrap shrink-0"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Buka Lyricsify.com di Tab Baru</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5">
          {/* Main Search Form */}
          <form onSubmit={handleSearch} className="lg:col-span-7 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Judul lagu dan nama artis (mis. Coldplay Yellow)..."
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-[#13161F] border border-white/[0.08] text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as 'all' | 'lyricsify' | 'lrclib')}
              aria-label="Sumber lirik"
              className="px-3 py-2 rounded-lg bg-[#13161F] border border-white/[0.08] text-xs font-medium text-zinc-200 focus:outline-none focus:border-amber-500"
            >
              <option value="all">Semua Sumber</option>
              <option value="lyricsify">Lyricsify.com</option>
              <option value="lrclib">LRCLIB</option>
            </select>

            <button
              type="submit"
              disabled={isSearching}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-[#0B0D12] text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              <span>Cari .LRC</span>
            </button>
          </form>

          {/* Direct Lyricsify URL Importer */}
          <form onSubmit={handleFetchDirectUrl} className="lg:col-span-5 flex items-center gap-2">
            <input
              type="url"
              value={directUrl}
              onChange={(e) => setDirectUrl(e.target.value)}
              placeholder="Atau tempel URL https://www.lyricsify.com/lyrics/..."
              className="flex-1 px-3 py-2 rounded-lg bg-[#13161F] border border-white/[0.08] text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-500"
            />
            <button
              type="submit"
              disabled={isFetchingDetail || !directUrl.trim()}
              className="px-3 py-2 rounded-lg bg-[#171B26] hover:bg-[#1E2433] border border-white/[0.08] disabled:opacity-40 text-xs font-medium text-zinc-200 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Ambil URL
            </button>
          </form>
        </div>

        {lyricsifyStatus === 'blocked' && (
          <div className="px-3.5 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200">
            Lyricsify.com membatasi scraping otomatis dari server cloud saat ini — hasil tersinkronisasi dari LRCLIB tetap ditampilkan di bawah, atau Anda dapat membuka{' '}
            <a
              href={externalLyricsifyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-medium text-amber-300"
            >
              Lyricsify.com
            </a>{' '}
            dan menempelkan isi .lrc ke Editor Real-Time.
          </div>
        )}

        {errorMsg && (
          <div className="px-3.5 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-300">
            {errorMsg}
          </div>
        )}
      </div>

      {/* Results & Preview Split */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Results list */}
        <div className="lg:col-span-5 flex flex-col min-h-[280px] bg-[#10131B] border border-white/[0.07] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/[0.07] flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-white">
              Hasil Pencarian
            </h2>
            <span className="font-mono text-xs tabular-nums text-zinc-400">
              {results.length} hasil
            </span>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-white/[0.06]">
            {isSearching ? (
              <div className="py-12 flex flex-col items-center justify-center text-zinc-400 text-xs gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
                <span>Mencari file .lrc di Lyricsify.com &amp; LRCLIB...</span>
              </div>
            ) : results.length === 0 ? (
              <div className="py-12 px-6 text-center text-xs text-zinc-500">
                Masukkan judul lagu lalu klik &ldquo;Cari .LRC&rdquo; untuk menemukan lirik tersinkronisasi.
              </div>
            ) : (
              results.map((item) => {
                const isSelected = selectedResult?.id === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => void handleSelectResult(item)}
                    className={`w-full text-left px-4 py-3 transition-colors cursor-pointer ${
                      isSelected ? 'bg-amber-500/10' : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    <div className="text-sm font-semibold text-white truncate">
                      {item.title}
                    </div>
                    <div className="text-xs text-zinc-400 truncate mt-0.5">
                      <span>{item.artist}</span>
                      {item.album && (
                        <>
                          <span aria-hidden="true"> · </span>
                          <span>{item.album}</span>
                        </>
                      )}
                      {item.duration && (
                        <>
                          <span aria-hidden="true"> · </span>
                          <span className="font-mono tabular-nums">
                            {formatDuration(item.duration)}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="text-[11px] mt-1 font-medium">
                      <span className="text-amber-400">
                        {item.source === 'lyricsify' ? 'Lyricsify.com' : 'LRCLIB'}
                      </span>
                      <span className="text-zinc-500" aria-hidden="true"> · </span>
                      <span className={item.hasSynced ? 'text-emerald-400' : 'text-zinc-400'}>
                        {item.hasSynced ? 'Tersinkronisasi (.lrc)' : 'Teks Polos'}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Preview & Apply */}
        <div className="lg:col-span-7 flex flex-col min-h-[280px] bg-[#10131B] border border-white/[0.07] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/[0.07] flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <h2 className="font-display text-sm font-semibold text-white truncate">
                {selectedResult ? `${selectedResult.artist} — ${selectedResult.title}` : 'Pratinjau Lirik .LRC'}
              </h2>
              <p className="text-xs text-zinc-400">
                Periksa timestamp sebelum menerapkan atau menyimpan ke folder
              </p>
            </div>

            {previewLrc && currentTrack && (
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => onApplyLrc(currentTrack.id, previewLrc, false, true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#171B26] hover:bg-[#1E2433] border border-white/[0.08] text-xs font-medium text-zinc-200 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                  <span>Edit Real-Time</span>
                </button>

                <button
                  type="button"
                  onClick={() => onApplyLrc(currentTrack.id, previewLrc, true, false)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#171B26] hover:bg-[#1E2433] border border-white/[0.08] text-xs font-medium text-zinc-200 cursor-pointer"
                >
                  <FolderDown className="w-3.5 h-3.5 text-amber-400" />
                  <span>Simpan ke Folder</span>
                </button>

                <button
                  type="button"
                  onClick={() => onApplyLrc(currentTrack.id, previewLrc, false, false)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#0B0D12] text-xs font-semibold cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Terapkan &amp; Sinkronkan</span>
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-4 bg-[#0B0D12]/60">
            {isFetchingDetail ? (
              <div className="h-full flex items-center justify-center text-xs text-zinc-400 gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                <span>Mengambil konten .lrc...</span>
              </div>
            ) : previewLrc ? (
              <pre className="font-mono text-xs sm:text-sm leading-relaxed text-zinc-200 whitespace-pre-wrap break-words">
                {previewLrc}
              </pre>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-zinc-500 text-center">
                Pilih salah satu hasil pencarian di sebelah kiri untuk melihat isi file .lrc.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
