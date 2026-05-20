import { useEffect, useCallback } from "react";
import { X, ChevronLeft, ChevronRight, ExternalLink, FolderOpen, Info } from "lucide-react";
import { api, type Photo } from "@/lib/api";
import { formatBytes } from "@/lib/utils";
import { revealItemInDir, openPath } from "@tauri-apps/plugin-opener";

interface Props {
  photos: Photo[];
  index: number;
  onClose: () => void;
  onIndexChange: (next: number) => void;
}

export function PhotoViewer({ photos, index, onClose, onIndexChange }: Props) {
  const photo = photos[index];
  const total = photos.length;

  const next = useCallback(() => {
    onIndexChange((index + 1) % total);
  }, [index, total, onIndexChange]);

  const prev = useCallback(() => {
    onIndexChange((index - 1 + total) % total);
  }, [index, total, onIndexChange]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, next, prev]);

  if (!photo) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Photo ${photo.filename}`}
      className="fixed inset-0 z-[100] flex flex-col bg-black/95 backdrop-blur"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <header className="flex items-center justify-between gap-2 border-b border-white/10 bg-black/50 px-4 py-2 text-sm text-white">
        <div className="flex min-w-0 items-center gap-3">
          <span className="font-mono text-xs text-white/60">
            {index + 1} / {total}
          </span>
          <span className="truncate font-medium">{photo.filename}</span>
          <span className="hidden text-xs text-white/50 md:inline">
            {photo.width && photo.height ? `${photo.width}×${photo.height}` : ""}
            {photo.width && photo.height ? " · " : ""}
            {formatBytes(photo.size_bytes)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => openPath(photo.path)}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs hover:bg-white/10"
            title="Ouvrir avec l'application par défaut"
          >
            <ExternalLink className="size-3.5" aria-hidden />
            Ouvrir
          </button>
          <button
            type="button"
            onClick={() => revealItemInDir(photo.path)}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs hover:bg-white/10"
            title="Voir dans l'explorateur Windows"
          >
            <FolderOpen className="size-3.5" aria-hidden />
            Dossier
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 hover:bg-white/10"
            aria-label="Fermer"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
      </header>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden p-4">
        <img
          key={photo.id}
          src={api.photoFull(photo.id)}
          alt={photo.filename}
          className="max-h-full max-w-full select-none object-contain"
          draggable={false}
        />

        {total > 1 ? (
          <>
            <button
              type="button"
              onClick={prev}
              className="absolute left-2 top-1/2 grid size-12 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white/90 backdrop-blur transition hover:bg-black/70"
              aria-label="Photo précédente"
            >
              <ChevronLeft className="size-6" aria-hidden />
            </button>
            <button
              type="button"
              onClick={next}
              className="absolute right-2 top-1/2 grid size-12 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white/90 backdrop-blur transition hover:bg-black/70"
              aria-label="Photo suivante"
            >
              <ChevronRight className="size-6" aria-hidden />
            </button>
          </>
        ) : null}
      </div>

      <footer className="flex items-center gap-2 border-t border-white/10 bg-black/50 px-4 py-1.5 text-[11px] text-white/60">
        <Info className="size-3.5" aria-hidden />
        <code className="truncate font-mono">{photo.path}</code>
        <span className="ml-auto whitespace-nowrap">
          Esc · ← → · clic en dehors pour fermer
        </span>
      </footer>
    </div>
  );
}
