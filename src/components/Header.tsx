import { FolderOpen } from 'lucide-react';
import type { AppView } from '../types/music';

interface HeaderProps {
  activeView: AppView;
  onChangeView: (view: AppView) => void;
  onOpenFolder: () => void;
  isScanning: boolean;
}

const NAV_ITEMS: Array<{ id: AppView; label: string }> = [
  { id: 'library', label: 'Pustaka' },
  { id: 'player', label: 'Pemutar & Lirik' },
  { id: 'editor', label: 'Editor LRC' },
  { id: 'search', label: 'Cari Lirik Online' },
];

export function Header({ activeView, onChangeView, onOpenFolder, isScanning }: HeaderProps) {
  return (
    <header className="h-16 px-4 sm:px-6 border-b border-white/[0.08] bg-[#0B0D12]/95 backdrop-blur-md flex items-center justify-between gap-8 shrink-0">
      {/* Zone 1: Single text element wordmark */}
      <button
        type="button"
        onClick={() => onChangeView('library')}
        className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded"
      >
        Sonara LRC
      </button>

      {/* Zone 2: Clean single-line navigation links */}
      <nav className="hidden md:flex items-center gap-6" aria-label="Navigasi utama">
        {NAV_ITEMS.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChangeView(item.id)}
              className={`relative py-5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:text-amber-400 ${
                isActive ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {item.label}
              {isActive && (
                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-amber-500 rounded-full" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: Single primary action */}
      <div className="shrink-0">
        <button
          type="button"
          onClick={onOpenFolder}
          disabled={isScanning}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 active:bg-amber-600 disabled:opacity-60 text-[#0B0D12] text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0D12]"
        >
          <FolderOpen className="w-4 h-4 shrink-0" />
          <span>{isScanning ? 'Memindai...' : 'Buka Folder Musik'}</span>
        </button>
      </div>
    </header>
  );
}
