import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Copy } from "lucide-react";
import { api, type Photo } from "@/lib/api";
import { PhotoCard } from "@/components/PhotoCard";
import { BulkActionsBar } from "@/components/BulkActionsBar";
import { EmptyState } from "@/components/EmptyState";
import { PhotoViewer } from "@/components/PhotoViewer";
import { useSelection } from "@/stores/selection";
import { useSelectAllShortcut } from "@/stores/useSelectAllShortcut";
import { formatBytes } from "@/lib/utils";

export function DuplicatesView() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const [similarity, setSimilarity] = useState(0.95);
  const addSelection = useSelection((s) => s.add);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["duplicates", similarity],
    queryFn: () => api.duplicates(similarity),
  });

  const flat: Photo[] = useMemo(
    () => (data?.groups ?? []).flatMap((g) => g.photos),
    [data],
  );
  const visibleIds = useMemo(() => flat.map((p) => p.id), [flat]);
  useSelectAllShortcut(visibleIds);

  if (isLoading) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        {t("duplicates.searching")}
      </div>
    );
  }

  if (!data || data.groups.length === 0) {
    return (
      <EmptyState
        icon={Copy}
        title={t("duplicates.empty.title")}
        description={t("duplicates.empty.description")}
      />
    );
  }

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{t("duplicates.title")}</h1>
          <p className="text-xs text-muted-foreground">
            {t("duplicates.groupCount", {
              count: data.groups.length,
              formatParams: { count: { locale } },
            })}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t("duplicates.threshold")}</span>
          <input
            type="range"
            min={0.8}
            max={1}
            step={0.01}
            value={similarity}
            onChange={(e) => setSimilarity(Number(e.target.value))}
            className="w-32"
          />
          <span className="w-12 text-right font-mono">
            {Math.round(similarity * 100)}%
          </span>
        </label>
      </div>

      <div className="space-y-6">
        {data.groups.map((group) => {
          const total = group.photos.reduce((s, p) => s + p.size_bytes, 0);
          const keepLargest = () => {
            const sorted = [...group.photos].sort(
              (a, b) =>
                b.size_bytes - a.size_bytes ||
                (b.width ?? 0) * (b.height ?? 0) -
                  (a.width ?? 0) * (a.height ?? 0),
            );
            addSelection(sorted.slice(1).map((p) => p.id));
          };

          return (
            <section
              key={group.group_id}
              className="surface p-3"
              aria-label={t("duplicates.groupHeader", {
                count: group.photos.length,
              })}
            >
              <header className="mb-2 flex items-center justify-between">
                <div className="text-sm">
                  <span className="font-medium">
                    {t("duplicates.groupHeader", {
                      count: group.photos.length,
                      formatParams: { count: { locale } },
                    })}
                  </span>
                  <span className="text-muted-foreground">
                    {" · "}
                    {t("duplicates.similarity", {
                      percent: Math.round(group.similarity * 100),
                    })}
                    {" · "}
                    {formatBytes(total)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={keepLargest}
                  className="rounded-md bg-muted px-2.5 py-1 text-xs hover:bg-muted/70"
                >
                  {t("duplicates.keepBest")}
                </button>
              </header>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
                {group.photos.map((p, idx) => (
                  <PhotoCard
                    key={p.id}
                    photo={p}
                    badge={idx === 0 ? t("duplicates.ref") : undefined}
                    onOpen={() => {
                      const flatIdx = flat.findIndex((x) => x.id === p.id);
                      if (flatIdx >= 0) setViewerIndex(flatIdx);
                    }}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <BulkActionsBar />

      {viewerIndex !== null ? (
        <PhotoViewer
          photos={flat}
          index={viewerIndex}
          onClose={() => setViewerIndex(null)}
          onIndexChange={setViewerIndex}
        />
      ) : null}
    </div>
  );
}
