import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UsersRound, Pencil } from "lucide-react";
import { api } from "@/lib/api";
import { PhotoCard } from "@/components/PhotoCard";
import { BulkActionsBar } from "@/components/BulkActionsBar";
import { EmptyState } from "@/components/EmptyState";
import { PhotoViewer } from "@/components/PhotoViewer";
import { useSelectAllShortcut } from "@/stores/useSelectAllShortcut";

export function FacesView() {
  const [activeCluster, setActiveCluster] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [labelDraft, setLabelDraft] = useState("");
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const qc = useQueryClient();

  const { data: clustersData, isLoading } = useQuery({
    queryKey: ["face-clusters"],
    queryFn: api.faceClusters,
  });

  const { data: photosData } = useQuery({
    queryKey: ["face-photos", activeCluster],
    queryFn: () =>
      activeCluster !== null
        ? api.facePhotos(activeCluster)
        : Promise.resolve({ photos: [] }),
    enabled: activeCluster !== null,
  });

  const renameMut = useMutation({
    mutationFn: ({ id, label }: { id: number; label: string }) =>
      api.renameCluster(id, label),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["face-clusters"] });
      setEditing(null);
    },
  });

  const visibleIds = useMemo(
    () => (photosData?.photos ?? []).map((p) => p.id),
    [photosData],
  );
  useSelectAllShortcut(visibleIds);

  if (isLoading) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Chargement des visages...
      </div>
    );
  }

  if (!clustersData || clustersData.clusters.length === 0) {
    return (
      <EmptyState
        icon={UsersRound}
        title="Aucun visage détecté"
        description="Mirafold n'a pas encore détecté de visages. L'indexation faciale s'exécute après le scan initial."
      />
    );
  }

  return (
    <div className="grid h-full grid-cols-[260px_1fr]">
      <aside
        className="overflow-auto border-r border-border bg-card/50 p-2"
        aria-label="Liste des personnes"
      >
        <h2 className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Personnes ({clustersData.clusters.length})
        </h2>
        <ul className="mt-1 space-y-1">
          {clustersData.clusters.map((c) => {
            const isActive = c.cluster_id === activeCluster;
            const isEdit = editing === c.cluster_id;
            return (
              <li key={c.cluster_id}>
                <div
                  className={
                    "flex items-center gap-2 rounded-md p-1.5 " +
                    (isActive ? "bg-primary/15" : "hover:bg-muted")
                  }
                >
                  <button
                    type="button"
                    onClick={() => setActiveCluster(c.cluster_id)}
                    className="flex flex-1 items-center gap-2 text-left"
                  >
                    {c.preview_photo_id !== null ? (
                      <img
                        src={api.photoThumb(c.preview_photo_id)}
                        alt=""
                        className="size-9 rounded-full object-cover"
                      />
                    ) : (
                      <div className="grid size-9 place-items-center rounded-full bg-muted">
                        <UsersRound className="size-4 text-muted-foreground" aria-hidden />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      {isEdit ? (
                        <input
                          autoFocus
                          value={labelDraft}
                          onChange={(e) => setLabelDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter")
                              renameMut.mutate({
                                id: c.cluster_id,
                                label: labelDraft,
                              });
                            if (e.key === "Escape") setEditing(null);
                          }}
                          className="w-full rounded bg-input px-1.5 py-0.5 text-sm"
                        />
                      ) : (
                        <div className="truncate text-sm">
                          {c.label ?? `Personne ${c.cluster_id}`}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground">
                        {c.face_count} photo{c.face_count > 1 ? "s" : ""}
                      </div>
                    </div>
                  </button>
                  {!isEdit ? (
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(c.cluster_id);
                        setLabelDraft(c.label ?? "");
                      }}
                      className="opacity-0 transition-opacity group-hover:opacity-100 hover:opacity-100"
                      aria-label="Renommer"
                    >
                      <Pencil className="size-3.5 text-muted-foreground" aria-hidden />
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </aside>

      <section className="overflow-auto p-4" aria-label="Photos de la personne">
        {activeCluster === null ? (
          <div className="p-6 text-sm text-muted-foreground">
            Sélectionne une personne pour voir ses photos.
          </div>
        ) : photosData ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2">
            {photosData.photos.map((p, idx) => (
              <PhotoCard
                key={p.id}
                photo={p}
                onOpen={() => setViewerIndex(idx)}
              />
            ))}
          </div>
        ) : (
          <div className="p-6 text-sm text-muted-foreground">Chargement...</div>
        )}
        <BulkActionsBar />
        {viewerIndex !== null && photosData ? (
          <PhotoViewer
            photos={photosData.photos}
            index={viewerIndex}
            onClose={() => setViewerIndex(null)}
            onIndexChange={setViewerIndex}
          />
        ) : null}
      </section>
    </div>
  );
}
