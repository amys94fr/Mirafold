import { memo } from "react";
import { Check } from "lucide-react";
import { type Photo, api } from "@/lib/api";
import { cn, formatBytes } from "@/lib/utils";
import { useSelection } from "@/stores/selection";

interface Props {
  photo: Photo;
  badge?: string;
  onOpen?: (photo: Photo) => void;
}

export const PhotoCard = memo(function PhotoCard({ photo, badge, onOpen }: Props) {
  const isSelected = useSelection((s) => s.selected.has(photo.id));
  const toggle = useSelection((s) => s.toggle);

  return (
    <div
      className={cn(
        "group relative aspect-square overflow-hidden rounded-md border-2 transition-all",
        isSelected
          ? "border-primary ring-2 ring-primary/40"
          : "border-transparent hover:border-border",
      )}
    >
      <button
        type="button"
        className="size-full cursor-pointer"
        onClick={(e) => {
          if (e.ctrlKey || e.metaKey || e.shiftKey) {
            toggle(photo.id);
          } else {
            onOpen?.(photo);
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          toggle(photo.id);
        }}
        aria-label={`Photo ${photo.filename}, ${formatBytes(photo.size_bytes)}${isSelected ? ", sélectionnée" : ""}`}
        aria-pressed={isSelected}
      >
        <img
          src={api.photoThumb(photo.id)}
          alt=""
          loading="lazy"
          className="size-full object-cover transition-transform group-hover:scale-[1.02]"
        />
      </button>

      <button
        type="button"
        onClick={() => toggle(photo.id)}
        className={cn(
          "absolute left-2 top-2 grid size-6 place-items-center rounded-full border-2 transition-opacity",
          isSelected
            ? "border-primary bg-primary text-primary-foreground opacity-100"
            : "border-white/70 bg-black/40 opacity-0 group-hover:opacity-100",
        )}
        aria-label={isSelected ? "Désélectionner" : "Sélectionner"}
      >
        {isSelected ? <Check className="size-3.5" aria-hidden /> : null}
      </button>

      {badge ? (
        <span className="absolute right-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
          {badge}
        </span>
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100">
        <div className="truncate">{photo.filename}</div>
        <div className="flex justify-between text-white/60">
          <span>
            {photo.width && photo.height
              ? `${photo.width}×${photo.height}`
              : ""}
          </span>
          <span>{formatBytes(photo.size_bytes)}</span>
        </div>
      </div>
    </div>
  );
});
