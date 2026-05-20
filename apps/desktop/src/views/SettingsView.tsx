import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderPlus, X, RefreshCw, Sparkles } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { api } from "@/lib/api";

export function SettingsView() {
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["library-roots"],
    queryFn: api.listRoots,
  });

  const addMut = useMutation({
    mutationFn: api.addRoot,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["library-roots"] }),
  });
  const removeMut = useMutation({
    mutationFn: api.removeRoot,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["library-roots"] }),
  });
  const indexMissingMut = useMutation({
    mutationFn: () => api.startScan({ full: false }),
  });
  const rescanMut = useMutation({
    mutationFn: () => api.startScan({ full: true }),
  });

  const addFolder = async () => {
    const sel = await openDialog({ directory: true, multiple: false });
    if (typeof sel === "string") addMut.mutate(sel);
  };

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-xl font-semibold">Réglages</h1>

      <section className="mt-6 surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="font-medium">Dossiers indexés</h2>
            <p className="text-xs text-muted-foreground">
              Mirafold scanne récursivement ces dossiers. Toute l'indexation reste sur ton PC.
            </p>
          </div>
          <button
            type="button"
            onClick={addFolder}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <FolderPlus className="size-4" aria-hidden />
            Ajouter
          </button>
        </div>

        {data && data.roots.length > 0 ? (
          <ul className="divide-y divide-border">
            {data.roots.map((root) => (
              <li
                key={root}
                className="flex items-center justify-between py-2 text-sm"
              >
                <code className="truncate font-mono text-xs">{root}</code>
                <button
                  type="button"
                  onClick={() => removeMut.mutate(root)}
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                  aria-label={`Retirer ${root}`}
                >
                  <X className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-3 text-sm text-muted-foreground">
            Aucun dossier ajouté.
          </p>
        )}
      </section>

      <section className="mt-6 surface p-4">
        <h2 className="font-medium">Indexation</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Toute photo nouvelle ou modifiée déclenche automatiquement empreinte, embedding sémantique et détection des visages. Utilise ces boutons pour relancer manuellement.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => indexMissingMut.mutate()}
            disabled={indexMissingMut.isPending}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Sparkles className="size-4" aria-hidden />
            Indexer ce qui manque
          </button>
          <button
            type="button"
            onClick={() => rescanMut.mutate()}
            disabled={rescanMut.isPending}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className="size-4" aria-hidden />
            Rescan complet
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Indexer ce qui manque</span> : ne re-traite que les photos sans embedding ou sans visages détectés. Recommandé après l'ajout d'un nouveau modèle.
          <br />
          <span className="font-medium text-foreground">Rescan complet</span> : reconstruit tout depuis zéro, plus lent.
        </p>
      </section>
    </div>
  );
}
