import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { UsersRound, Pencil } from "lucide-react";
import { api } from "@/lib/api";
import { PhotoCard } from "@/components/PhotoCard";
import { BulkActionsBar } from "@/components/BulkActionsBar";
import { EmptyState } from "@/components/EmptyState";
import { PhotoViewer } from "@/components/PhotoViewer";
import { useSelectAllShortcut } from "@/stores/useSelectAllShortcut";

export function FacesView() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
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
        {t("faces.loading")}
      </div>
    );
  }

  if (!clustersData || clustersData.clusters.length === 0) {
    return (
      <EmptyState
        icon={UsersRound}
        title={t("faces.empty.title")}
        description={t("faces.empty.description")}
      />
    );
  }

  return (
    <div className="grid h-full grid-cols-[260px_1fr]">
      <aside
        className="overflow-auto border-r border-border bg-card/50 p-2"
        aria-label={t("faces.people")}
      >
        <h2 className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("faces.peopleCount", { count: clustersData.clusters.length })}
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
                          {c.label ?? t("faces.personLabel", { id: c.cluster_id })}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground">
                        {t("faces.photoCount", {
                          count: c.face_count,
                          formatParams: { count: { locale } },
                        })}
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
                      aria-label={t("common.rename")}
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

      <section className="overflow-auto p-4" aria-label={t("faces.title")}>
        {activeCluster === null ? (
          <div className="p-6 text-sm text-muted-foreground">
            {t("common.noPersonSelected")}
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
          <div className="p-6 text-sm text-muted-foreground">{t("common.loading")}</div>
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
