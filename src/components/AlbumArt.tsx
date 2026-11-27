import { useState } from 'react';
import { Disc3 } from 'lucide-react';

interface AlbumArtProps {
  src?: string;
  alt: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function AlbumArt({ src, alt, size = 'md', className = '' }: AlbumArtProps) {
  const [hasError, setHasError] = useState(false);

  const iconSize = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-14 h-14' : 'w-7 h-7';

  if (!src || hasError) {
    return (
      <div
        className={`flex items-center justify-center bg-gradient-to-br from-[#1B1F2A] via-[#141720] to-[#0E1016] border border-white/[0.08] text-amber-500/70 select-none ${className}`}
        aria-label={alt}
      >
        <Disc3 className={iconSize} strokeWidth={1.5} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setHasError(true)}
      className={`object-cover bg-[#141720] border border-white/[0.08] ${className}`}
    />
  );
}
