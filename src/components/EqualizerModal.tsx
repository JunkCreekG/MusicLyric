import { X } from 'lucide-react';
import { EQ_PRESETS } from '../hooks/useAudioEngine';
import type { EqualizerSettings } from '../types/music';
import { formatDuration } from '../utils/lrc';

interface EqualizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  eq: EqualizerSettings;
  onChangeEq: (next: EqualizerSettings) => void;
  currentTimeMs: number;
  abLoop: { a: number | null; b: number | null };
  onChangeAbLoop: (next: { a: number | null; b: number | null }) => void;
  sleepMinutesLeft: number | null;
  onChangeSleepMinutes: (minutes: number | null) => void;
}

const BAND_LABELS = ['60Hz', '230Hz', '910Hz', '3.6kHz', '14kHz'];

export function EqualizerModal({
  isOpen,
  onClose,
  eq,
  onChangeEq,
  currentTimeMs,
  abLoop,
  onChangeAbLoop,
  sleepMinutesLeft,
  onChangeSleepMinutes,
}: EqualizerModalProps) {
  if (!isOpen) return null;

  const handlePreset = (name: string) => {
    const presetBands = EQ_PRESETS[name] || [0, 0, 0, 0, 0];
    onChangeEq({
      ...eq,
      enabled: true,
      preset: name,
      bands: [...presetBands] as [number, number, number, number, number],
    });
  };

  const handleBandChange = (idx: number, val: number) => {
    const nextBands = [...eq.bands] as [number, number, number, number, number];
    nextBands[idx] = val;
    onChangeEq({
      ...eq,
      enabled: true,
      preset: 'Custom',
      bands: nextBands,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="eq-modal-title"
    >
      <div className="w-full max-w-xl bg-[#10131B] border border-white/[0.1] rounded-xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between">
          <div>
            <h2 id="eq-modal-title" className="font-display text-base font-bold text-white">
              Equalizer &amp; Efek Audio Pro
            </h2>
            <p className="text-xs text-zinc-400">
              5-Band Equalizer, Bass Boost, Kecepatan Putar, dan A-B Repeat
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onChangeEq({ ...eq, enabled: !eq.enabled })}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                eq.enabled
                  ? 'bg-amber-500 text-[#0B0D12]'
                  : 'bg-white/[0.08] text-zinc-400'
              }`}
            >
              {eq.enabled ? 'EQ Aktif' : 'EQ Nonaktif'}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup Equalizer"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Presets */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <label className="text-xs font-medium text-zinc-300">Preset Suara</label>
            <select
              value={eq.preset}
              onChange={(e) => handlePreset(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-[#161A24] border border-white/[0.08] text-xs font-medium text-white focus:outline-none focus:border-amber-500"
            >
              {Object.keys(EQ_PRESETS).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
              {eq.preset === 'Custom' && <option value="Custom">Custom</option>}
            </select>
          </div>

          {/* 5-Band Vertical Sliders */}
          <div className="grid grid-cols-5 gap-3 py-3 px-4 rounded-xl bg-[#0B0D12] border border-white/[0.06]">
            {BAND_LABELS.map((label, idx) => (
              <div key={label} className="flex flex-col items-center gap-2">
                <span className="font-mono text-[11px] tabular-nums text-amber-400">
                  {eq.bands[idx] > 0 ? `+${eq.bands[idx]}` : eq.bands[idx]}dB
                </span>
                <input
                  type="range"
                  min={-12}
                  max={12}
                  step={1}
                  value={eq.bands[idx]}
                  onChange={(e) => handleBandChange(idx, Number(e.target.value))}
                  aria-label={`Band ${label}`}
                  className="studio-range h-24 w-6"
                  style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                />
                <span className="font-mono text-[11px] text-zinc-400">{label}</span>
              </div>
            ))}
          </div>

          {/* Bass Boost & Playback Speed */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-3.5 rounded-xl bg-[#141822] border border-white/[0.06] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-300 font-medium">Bass Boost</span>
                <span className="font-mono tabular-nums text-amber-400">+{eq.bassBoost} dB</span>
              </div>
              <input
                type="range"
                min={0}
                max={12}
                step={1}
                value={eq.bassBoost}
                onChange={(e) => onChangeEq({ ...eq, bassBoost: Number(e.target.value) })}
                className="studio-range w-full"
              />
            </div>

            <div className="p-3.5 rounded-xl bg-[#141822] border border-white/[0.06] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-300 font-medium">Kecepatan Putar</span>
                <span className="font-mono tabular-nums text-amber-400">{eq.playbackRate.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min={0.75}
                max={1.5}
                step={0.05}
                value={eq.playbackRate}
                onChange={(e) => onChangeEq({ ...eq, playbackRate: Number(e.target.value) })}
                className="studio-range w-full"
              />
            </div>
          </div>

          {/* A-B Repeat & Sleep Timer */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-3.5 rounded-xl bg-[#141822] border border-white/[0.06] space-y-2">
              <div className="text-xs font-medium text-zinc-300">Ulang Segmen (A-B Repeat)</div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onChangeAbLoop({ ...abLoop, a: Math.round(currentTimeMs) })}
                  className={`flex-1 py-1.5 rounded text-xs font-mono cursor-pointer ${
                    abLoop.a !== null
                      ? 'bg-amber-500 text-[#0B0D12] font-semibold'
                      : 'bg-white/[0.06] text-zinc-300 hover:bg-white/[0.1]'
                  }`}
                >
                  A: {abLoop.a !== null ? formatDuration(abLoop.a / 1000) : '--:--'}
                </button>
                <button
                  type="button"
                  onClick={() => onChangeAbLoop({ ...abLoop, b: Math.round(currentTimeMs) })}
                  className={`flex-1 py-1.5 rounded text-xs font-mono cursor-pointer ${
                    abLoop.b !== null
                      ? 'bg-amber-500 text-[#0B0D12] font-semibold'
                      : 'bg-white/[0.06] text-zinc-300 hover:bg-white/[0.1]'
                  }`}
                >
                  B: {abLoop.b !== null ? formatDuration(abLoop.b / 1000) : '--:--'}
                </button>
                <button
                  type="button"
                  onClick={() => onChangeAbLoop({ a: null, b: null })}
                  className="px-2.5 py-1.5 rounded bg-white/[0.06] hover:bg-white/[0.1] text-xs text-zinc-300 cursor-pointer"
                >
                  Reset
                </button>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#141822] border border-white/[0.06] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-zinc-300">Sleep Timer</span>
                <span className="font-mono text-amber-400">
                  {sleepMinutesLeft !== null ? `${sleepMinutesLeft} menit` : 'Mati'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {[null, 15, 30, 60].map((mins) => (
                  <button
                    key={String(mins)}
                    type="button"
                    onClick={() => onChangeSleepMinutes(mins)}
                    className={`flex-1 py-1.5 rounded text-xs font-medium cursor-pointer ${
                      sleepMinutesLeft === mins
                        ? 'bg-amber-500 text-[#0B0D12] font-semibold'
                        : 'bg-white/[0.06] text-zinc-300 hover:bg-white/[0.1]'
                    }`}
                  >
                    {mins === null ? 'Off' : `${mins}m`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
