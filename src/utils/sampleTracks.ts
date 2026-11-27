import type { Track } from '../types/music';
import { getLyricFromDb } from './storage';

interface SynthSegment {
  freqs: number[];
  durationSec: number;
}

function createSynthWavUrl(segments: SynthSegment[], tempoPulse = true): { url: string; duration: number } {
  const sampleRate = 22050;
  const totalDuration = segments.reduce((sum, seg) => sum + seg.durationSec, 0);
  const totalSamples = Math.floor(totalDuration * sampleRate);
  const buffer = new ArrayBuffer(44 + totalSamples * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i += 1) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + totalSamples * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, totalSamples * 2, true);

  let sampleIndex = 0;
  for (const seg of segments) {
    const segSamples = Math.floor(seg.durationSec * sampleRate);
    for (let i = 0; i < segSamples && sampleIndex < totalSamples; i += 1) {
      const t = i / sampleRate;
      const env =
        Math.min(1, t / 0.08) *
        Math.min(1, (seg.durationSec - t) / 0.14) *
        (0.85 + 0.15 * Math.sin(t * 3.5));

      let sum = 0;
      for (let k = 0; k < seg.freqs.length; k += 1) {
        const f = seg.freqs[k];
        sum += Math.sin(2 * Math.PI * f * t) * 0.65 + Math.sin(2 * Math.PI * f * 2 * t) * 0.14;
      }
      sum /= Math.max(1, seg.freqs.length);

      // Soft metronomic pulse on beat
      const beatPos = t % 0.75;
      const pulse = tempoPulse && beatPos < 0.04 ? Math.sin(2 * Math.PI * 110 * beatPos) * (1 - beatPos / 0.04) * 0.2 : 0;

      const sample = Math.max(-1, Math.min(1, (sum * env * 0.45) + pulse));
      view.setInt16(44 + sampleIndex * 2, Math.round(sample * 32767), true);
      sampleIndex += 1;
    }
  }

  const blob = new Blob([buffer], { type: 'audio/wav' });
  return { url: URL.createObjectURL(blob), duration: totalDuration };
}

export async function createSampleTracks(): Promise<Track[]> {
  const track1Wav = createSynthWavUrl([
    { freqs: [220, 261.63, 329.63, 392.0], durationSec: 4.5 }, // Am7
    { freqs: [174.61, 220, 261.63, 349.23], durationSec: 4.5 }, // Fmaj7
    { freqs: [130.81, 196.0, 261.63, 329.63], durationSec: 4.5 }, // Cmaj7
    { freqs: [196.0, 246.94, 293.66, 392.0], durationSec: 4.5 }, // G6
    { freqs: [220, 261.63, 329.63, 392.0], durationSec: 4.5 }, // Am7
    { freqs: [174.61, 220, 261.63, 349.23], durationSec: 4.5 }, // Fmaj7
    { freqs: [130.81, 196.0, 261.63, 329.63], durationSec: 4.5 }, // Cmaj7
    { freqs: [196.0, 246.94, 293.66, 392.0], durationSec: 4.5 }, // G6
  ]);

  const track2Wav = createSynthWavUrl([
    { freqs: [146.83, 220, 261.63, 329.63], durationSec: 4.0 }, // Dm9
    { freqs: [196.0, 246.94, 293.66, 349.23], durationSec: 4.0 }, // G7
    { freqs: [130.81, 164.81, 196.0, 246.94], durationSec: 4.0 }, // Cmaj7
    { freqs: [110.0, 164.81, 220, 261.63], durationSec: 4.0 }, // Am7
    { freqs: [146.83, 220, 261.63, 329.63], durationSec: 4.0 }, // Dm9
    { freqs: [196.0, 246.94, 293.66, 349.23], durationSec: 4.0 }, // G7
    { freqs: [130.81, 164.81, 196.0, 246.94], durationSec: 4.0 }, // Cmaj7
  ]);

  const track3Wav = createSynthWavUrl([
    { freqs: [164.81, 196.0, 246.94, 293.66], durationSec: 4.2 }, // Em7
    { freqs: [130.81, 196.0, 246.94, 329.63], durationSec: 4.2 }, // Cmaj7
    { freqs: [196.0, 246.94, 293.66, 392.0], durationSec: 4.2 }, // G
    { freqs: [146.83, 220, 293.66, 369.99], durationSec: 4.2 }, // D
    { freqs: [164.81, 196.0, 246.94, 293.66], durationSec: 4.2 }, // Em7
    { freqs: [130.81, 196.0, 246.94, 329.63], durationSec: 4.2 }, // Cmaj7
  ]);

  const samples: Track[] = [
    {
      id: 'sample-midnight-echoes',
      title: 'Midnight Studio Echoes',
      artist: 'Klara Senja',
      album: 'Analog Sessions Vol. 1',
      duration: track1Wav.duration,
      fileName: 'Klara Senja - Midnight Studio Echoes.wav',
      baseName: 'Klara Senja - Midnight Studio Echoes',
      folderPath: 'Koleksi Contoh',
      audioUrl: track1Wav.url,
      coverUrl: '/src/assets/images/cover_midnight_echoes_1795796529768.jpg',
      format: 'WAV',
      lrcContent: `[ti:Midnight Studio Echoes]
[ar:Klara Senja]
[al:Analog Sessions Vol. 1]

[00:00.50] Warm tape rolling under midnight light
[00:04.50] Every frequency drifts into calm
[00:09.00] Soft Rhodes chords breathing through the dark
[00:13.50] Holding onto every lingering note
[00:18.00] Tap any line or open the real-time LRC editor
[00:22.50] Adjust timestamps live while the track plays
[00:27.00] Search online .lrc lyrics or save straight to your folder
[00:31.50] Pure studio playback, synced to the millisecond`,
      lrcFileName: 'Klara Senja - Midnight Studio Echoes.lrc',
      lrcSource: 'sample',
      isFavorite: true,
      addedAt: Date.now() - 3000,
      isSample: true,
    },
    {
      id: 'sample-golden-resonance',
      title: 'Golden Brass Resonance',
      artist: 'Raka Pratama Trio',
      album: 'Acoustic Diffuser',
      duration: track2Wav.duration,
      fileName: 'Raka Pratama Trio - Golden Brass Resonance.wav',
      baseName: 'Raka Pratama Trio - Golden Brass Resonance',
      folderPath: 'Koleksi Contoh',
      audioUrl: track2Wav.url,
      coverUrl: '/src/assets/images/cover_golden_resonance_1795796529280.jpg',
      format: 'WAV',
      lrcContent: `[ti:Golden Brass Resonance]
[ar:Raka Pratama Trio]
[al:Acoustic Diffuser]

[00:00.40] Brass keys shimmer in the late afternoon
[00:04.00] Shadows stretch across the studio floor
[00:08.00] Five-band equalizer shapes the warmth below
[00:12.00] Crisp highs shimmering above the bassline
[00:16.00] Every measure locked in rhythmic time
[00:20.00] Fine-tune offset in real time like Musicolet
[00:24.00] Export clean .lrc files directly to disk`,
      lrcFileName: 'Raka Pratama Trio - Golden Brass Resonance.lrc',
      lrcSource: 'sample',
      isFavorite: false,
      addedAt: Date.now() - 2000,
      isSample: true,
    },
    {
      id: 'sample-velvet-horizon',
      title: 'Rain on Studio Glass',
      artist: 'Nadia & The Horizon',
      album: 'Twilight Frequencies',
      duration: track3Wav.duration,
      fileName: 'Nadia & The Horizon - Rain on Studio Glass.wav',
      baseName: 'Nadia & The Horizon - Rain on Studio Glass',
      folderPath: 'Koleksi Contoh',
      audioUrl: track3Wav.url,
      coverUrl: '/src/assets/images/cover_velvet_horizon_1795796529529.jpg',
      format: 'WAV',
      lrcContent: `[ti:Rain on Studio Glass]
[ar:Nadia & The Horizon]
[al:Twilight Frequencies]

[00:00.40] Raindrops trace the windowpane at dusk
[00:04.20] Amber streetlamps blur into gold
[00:08.40] Quiet echoes fill the listening room
[00:12.60] Waiting for your local music folder
[00:16.80] Load MP3, FLAC, or M4A tracks anytime
[00:21.00] Sync lyrics online from Lyricsify or LRCLIB`,
      lrcFileName: 'Nadia & The Horizon - Rain on Studio Glass.lrc',
      lrcSource: 'sample',
      isFavorite: false,
      addedAt: Date.now() - 1000,
      isSample: true,
    },
  ];

  // Restore any user edits saved in IndexedDB for sample tracks too
  for (const track of samples) {
    const saved = await getLyricFromDb(track.baseName);
    if (saved) {
      track.lrcContent = saved;
      track.lrcSource = 'edited';
    }
  }

  return samples;
}
