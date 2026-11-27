import { useCallback, useEffect, useRef, useState } from 'react';
import type { EqualizerSettings, RepeatMode, Track } from '../types/music';

const EQ_FREQUENCIES = [60, 230, 910, 3600, 14000] as const;

export const EQ_PRESETS: Record<string, [number, number, number, number, number]> = {
  'Studio Flat': [0, 0, 0, 0, 0],
  Pop: [-1, 2, 4, 2, -1],
  Rock: [4, 2, -1, 3, 4],
  Jazz: [3, 1, -2, 2, 3],
  Classical: [3, 2, 0, 2, 4],
  'Bass Heavy': [7, 4, 0, 1, 2],
  'Vocal Clarity': [-2, -1, 4, 5, 2],
};

interface UseAudioEngineOptions {
  tracks: Track[];
  currentTrackId: string | null;
  onSelectTrack: (trackId: string) => void;
  eq: EqualizerSettings;
}

export function useAudioEngine({
  tracks,
  currentTrackId,
  onSelectTrack,
  eq,
}: UseAudioEngineOptions) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const filtersRef = useRef<BiquadFilterNode[]>([]);
  const bassBoostRef = useRef<BiquadFilterNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>('all');
  const [abLoop, setAbLoop] = useState<{ a: number | null; b: number | null }>({ a: null, b: null });
  const [sleepMinutesLeft, setSleepMinutesLeft] = useState<number | null>(null);

  const currentTrack = tracks.find((t) => t.id === currentTrackId) || null;
  const shouldAutoPlayRef = useRef(false);
  const repeatRef = useRef(repeat);
  repeatRef.current = repeat;
  const shuffleRef = useRef(shuffle);
  shuffleRef.current = shuffle;
  const abLoopRef = useRef(abLoop);
  abLoopRef.current = abLoop;

  // Initialize HTMLAudioElement once
  if (!audioRef.current && typeof window !== 'undefined') {
    const audio = new Audio();
    audio.preload = 'auto';
    audio.crossOrigin = 'anonymous';
    audioRef.current = audio;
  }

  const ensureAudioGraph = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!audioCtxRef.current) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;

      const source = ctx.createMediaElementSource(audio);
      sourceNodeRef.current = source;

      const bass = ctx.createBiquadFilter();
      bass.type = 'lowshelf';
      bass.frequency.value = 95;
      bass.gain.value = eq.enabled ? eq.bassBoost : 0;
      bassBoostRef.current = bass;

      const filters = EQ_FREQUENCIES.map((freq, idx) => {
        const filter = ctx.createBiquadFilter();
        filter.type = idx === 0 ? 'lowshelf' : idx === EQ_FREQUENCIES.length - 1 ? 'highshelf' : 'peaking';
        filter.frequency.value = freq;
        filter.Q.value = 1.1;
        filter.gain.value = eq.enabled ? eq.bands[idx] : 0;
        return filter;
      });
      filtersRef.current = filters;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.78;
      analyserRef.current = analyser;

      // Connect chain: source -> bass -> band0..band4 -> analyser -> destination
      let prev: AudioNode = source;
      prev.connect(bass);
      prev = bass;
      for (const f of filters) {
        prev.connect(f);
        prev = f;
      }
      prev.connect(analyser);
      analyser.connect(ctx.destination);
    }

    if (audioCtxRef.current.state === 'suspended') {
      void audioCtxRef.current.resume();
    }
  }, [eq.bands, eq.bassBoost, eq.enabled]);

  // Apply EQ changes dynamically
  useEffect(() => {
    if (filtersRef.current.length === 5) {
      filtersRef.current.forEach((f, idx) => {
        f.gain.value = eq.enabled ? eq.bands[idx] : 0;
      });
    }
    if (bassBoostRef.current) {
      bassBoostRef.current.gain.value = eq.enabled ? eq.bassBoost : 0;
    }
    if (audioRef.current) {
      audioRef.current.playbackRate = eq.playbackRate;
    }
  }, [eq]);

  // Apply volume & mute
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  const nextTrack = useCallback(() => {
    if (tracks.length === 0) return;
    if (shuffleRef.current && tracks.length > 1) {
      const candidates = tracks.filter((t) => t.id !== currentTrackId);
      const picked = candidates[Math.floor(Math.random() * candidates.length)];
      if (picked) {
        shouldAutoPlayRef.current = true;
        onSelectTrack(picked.id);
      }
      return;
    }
    const idx = tracks.findIndex((t) => t.id === currentTrackId);
    const nextIdx = idx === -1 ? 0 : (idx + 1) % tracks.length;
    if (idx === tracks.length - 1 && repeatRef.current === 'off') {
      setIsPlaying(false);
      return;
    }
    shouldAutoPlayRef.current = true;
    onSelectTrack(tracks[nextIdx].id);
  }, [tracks, currentTrackId, onSelectTrack]);

  const prevTrack = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      setCurrentTimeMs(0);
      return;
    }
    if (tracks.length === 0) return;
    const idx = tracks.findIndex((t) => t.id === currentTrackId);
    const prevIdx = idx <= 0 ? tracks.length - 1 : idx - 1;
    shouldAutoPlayRef.current = true;
    onSelectTrack(tracks[prevIdx].id);
  }, [tracks, currentTrackId, onSelectTrack]);

  // Load new track source when currentTrackId changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    const wasPlaying = shouldAutoPlayRef.current;
    shouldAutoPlayRef.current = false;

    audio.src = currentTrack.audioUrl;
    audio.playbackRate = eq.playbackRate;
    setCurrentTimeMs(0);
    setDurationSec(currentTrack.duration || 0);
    setAbLoop({ a: null, b: null });

    if (wasPlaying) {
      ensureAudioGraph();
      void audio
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    } else {
      setIsPlaying(false);
    }
  }, [currentTrack?.id, currentTrack?.audioUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Attach audio events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDurationSec(audio.duration);
      }
    };

    const handleEnded = () => {
      if (repeatRef.current === 'one') {
        audio.currentTime = 0;
        void audio.play();
        return;
      }
      nextTrack();
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
    };
  }, [nextTrack]);

  // High-precision rAF clock for silky-smooth LRC sync & A-B loop
  useEffect(() => {
    let rafId = 0;
    const tick = () => {
      const audio = audioRef.current;
      if (audio) {
        const ms = audio.currentTime * 1000;
        setCurrentTimeMs(ms);
        const loop = abLoopRef.current;
        if (loop.a !== null && loop.b !== null && loop.b > loop.a && ms >= loop.b) {
          audio.currentTime = loop.a / 1000;
        }
      }
      if (isPlaying) {
        rafId = requestAnimationFrame(tick);
      }
    };
    if (isPlaying) {
      rafId = requestAnimationFrame(tick);
    }
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [isPlaying]);

  // Sleep timer countdown
  useEffect(() => {
    if (sleepMinutesLeft === null) return;
    if (sleepMinutesLeft <= 0) {
      audioRef.current?.pause();
      setIsPlaying(false);
      setSleepMinutesLeft(null);
      return;
    }
    const timer = setTimeout(() => {
      setSleepMinutesLeft((prev) => (prev !== null ? prev - 1 : null));
    }, 60000);
    return () => clearTimeout(timer);
  }, [sleepMinutesLeft]);

  // Media Session integration
  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentTrack) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.artist,
      album: currentTrack.album,
      artwork: currentTrack.coverUrl ? [{ src: currentTrack.coverUrl, sizes: '512x512', type: 'image/jpeg' }] : [],
    });
    navigator.mediaSession.setActionHandler('play', () => {
      ensureAudioGraph();
      void audioRef.current?.play();
    });
    navigator.mediaSession.setActionHandler('pause', () => audioRef.current?.pause());
    navigator.mediaSession.setActionHandler('previoustrack', prevTrack);
    navigator.mediaSession.setActionHandler('nexttrack', nextTrack);
  }, [currentTrack, ensureAudioGraph, nextTrack, prevTrack]);

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    ensureAudioGraph();
    if (audio.paused) {
      try {
        await audio.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
      }
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }, [currentTrack, ensureAudioGraph]);

  const playTrackNow = useCallback(
    (trackId: string) => {
      if (trackId === currentTrackId) {
        void togglePlay();
        return;
      }
      shouldAutoPlayRef.current = true;
      onSelectTrack(trackId);
    },
    [currentTrackId, onSelectTrack, togglePlay]
  );

  const seekToMs = useCallback((ms: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const clampedSec = Math.max(0, Math.min(audio.duration || 99999, ms / 1000));
    audio.currentTime = clampedSec;
    setCurrentTimeMs(clampedSec * 1000);
  }, []);

  const cycleRepeat = useCallback(() => {
    setRepeat((prev) => (prev === 'all' ? 'one' : prev === 'one' ? 'off' : 'all'));
  }, []);

  return {
    currentTrack,
    isPlaying,
    currentTimeMs,
    durationSec,
    volume,
    setVolume,
    isMuted,
    setIsMuted,
    shuffle,
    setShuffle,
    repeat,
    cycleRepeat,
    abLoop,
    setAbLoop,
    sleepMinutesLeft,
    setSleepMinutesLeft,
    analyserNode: analyserRef.current,
    togglePlay,
    playTrackNow,
    nextTrack,
    prevTrack,
    seekToMs,
  };
}
