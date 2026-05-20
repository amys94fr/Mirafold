import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2, FilePenLine, X } from "lucide-react";
import { useSelection } from "@/stores/selection";
import { api } from "@/lib/api";

export function BulkActionsBar() {
  const count = useSelection((s) => s.selected.size);
  const clear = useSelection((s) => s.clear);
  const toArray = useSelection((s) => s.toArray);
  const qc = useQueryClient();
  const [renameOpen, setRenameOpen] = useState(false);
  const [template, setTemplate] = useState("photo-{n}");

  const deleteMut = useMutation({
    mutationFn: () => api.deletePhotos(toArray(), { permanent: false }),
    onSuccess: () => {
      clear();
      qc.invalidateQueries();
    },
  });

  const renameMut = useMutation({
    mutationFn: () => api.renamePhotos(toArray(), template),
    onSuccess: () => {
      setRenameOpen(false);
      clear();
      qc.invalidateQueries();
    },
  });

  if (count === 0) return null;

  return (
    <div
      role="region"
      aria-label="Actions groupées"
      className="surface fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 px-3 py-2 shadow-xl"
    >
      <span className="px-2 text-sm font-medium">
        {count.toLocaleString("fr-FR")} sélectionnée{count > 1 ? "s" : ""}
      </span>
      <div className="mx-1 h-5 w-px bg-border" aria-hidden />
      <button
        type="button"
        onClick={() => setRenameOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm hover:bg-muted"
      >
        <FilePenLine className="size-4" aria-hidden />
        Renommer
      </button>
      <button
        type="button"
        onClick={() => {
          if (confirm(`Envoyer ${count} photo(s) à la corbeille ?`)) {
            deleteMut.mutate();
          }
        }}
        disabled={deleteMut.isPending}
        className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10"
      >
        <Trash2 className="size-4" aria-hidden />
        Corbeille
      </button>
      <button
        type="button"
        onClick={clear}
        className="inline-flex items-center rounded-md px-2 py-1.5 text-muted-foreground hover:bg-muted"
        aria-label="Désélectionner tout"
      >
        <X className="size-4" aria-hidden />
      </button>

      {renameOpen ? (
        <div className="absolute -top-16 left-0 right-0 surface flex items-center gap-2 p-2 shadow-xl">
          <input
            type="text"
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            placeholder="Ex: vacances-{date}-{n}"
            className="flex-1 rounded-md bg-input px-2 py-1.5 text-sm outline-none"
            aria-label="Modèle de renommage"
          />
          <button
            type="button"
            onClick={() => renameMut.mutate()}
            disabled={renameMut.isPending || !template.trim()}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            Appliquer
          </button>
        </div>
      ) : null}
    </div>
  );
}
