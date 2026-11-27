import { useEffect, useRef } from 'react';

interface SpectrumBarsProps {
  analyserNode: AnalyserNode | null;
  isPlaying: boolean;
}

export function SpectrumBars({ analyserNode, isPlaying }: SpectrumBarsProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const barCount = 32;
    const dataArray = analyserNode ? new Uint8Array(analyserNode.frequencyBinCount) : new Uint8Array(barCount);
    const smoothed = new Float32Array(barCount);
    let rafId = 0;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      if (analyserNode && isPlaying) {
        analyserNode.getByteFrequencyData(dataArray);
      }

      const gap = 3;
      const barWidth = (width - gap * (barCount - 1)) / barCount;

      for (let i = 0; i < barCount; i += 1) {
        const binIdx = Math.min(dataArray.length - 1, Math.floor((i / barCount) * (dataArray.length * 0.75)));
        const target = isPlaying ? (dataArray[binIdx] || 0) / 255 : 0.08;
        smoothed[i] = smoothed[i] * 0.72 + target * 0.28;

        const barHeight = Math.max(3, smoothed[i] * (height - 4));
        const x = i * (barWidth + gap);
        const y = height - barHeight;

        ctx.fillStyle = isPlaying
          ? `rgba(245, 158, 11, ${0.35 + smoothed[i] * 0.65})`
          : 'rgba(255, 255, 255, 0.12)';
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 2);
        ctx.fill();
      }

      if (isPlaying) {
        rafId = requestAnimationFrame(render);
      }
    };

    render();
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [analyserNode, isPlaying]);

  return (
    <canvas
      ref={canvasRef}
      width={360}
      height={44}
      className="w-full h-11 block"
      aria-label="Spektrum frekuensi audio"
    />
  );
}
