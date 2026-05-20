import { useMemo, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Search, Sparkles } from "lucide-react";
import { api, type Photo } from "@/lib/api";
import { PhotoCard } from "@/components/PhotoCard";
import { BulkActionsBar } from "@/components/BulkActionsBar";
import { PhotoViewer } from "@/components/PhotoViewer";
import { useSelectAllShortcut } from "@/stores/useSelectAllShortcut";

export function SearchView() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const [query, setQuery] = useState("");
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const searchMut = useMutation({
    mutationFn: (q: string) => api.semanticSearch(q, 80),
  });

  const photosList: Photo[] = useMemo(
    () => (searchMut.data?.results ?? []).map((r) => r.photo),
    [searchMut.data],
  );
  const visibleIds = useMemo(() => photosList.map((p) => p.id), [photosList]);
  useSelectAllShortcut(visibleIds);

  const examples = useMemo(
    () => (t("search.examples", { returnObjects: true }) as string[]) ?? [],
    [t],
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q) searchMut.mutate(q);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border bg-card/50 p-4">
        <form onSubmit={onSubmit} className="mx-auto flex max-w-3xl gap-2">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("search.placeholder")}
              className="w-full rounded-md border border-border bg-input py-2.5 pl-10 pr-3 text-sm outline-none focus:border-primary"
              aria-label={t("search.title")}
            />
          </div>
          <button
            type="submit"
            disabled={!query.trim() || searchMut.isPending}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Sparkles className="size-4" aria-hidden />
            {searchMut.isPending ? t("search.running") : t("search.submit")}
          </button>
        </form>

        {!searchMut.data && !searchMut.isPending ? (
          <div className="mx-auto mt-3 flex max-w-3xl flex-wrap gap-1.5">
            <span className="text-xs text-muted-foreground">{t("search.tryExamples")}</span>
            {examples.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => {
                  setQuery(ex);
                  searchMut.mutate(ex);
                }}
                className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {ex}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex-1 overflow-auto p-4">
        {searchMut.isPending ? (
          <p className="text-sm text-muted-foreground">{t("common.searching")}</p>
        ) : searchMut.data ? (
          searchMut.data.results.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("search.noResults")}</p>
          ) : (
            <>
              <p className="mb-3 text-xs text-muted-foreground">
                {t("search.resultsCount", {
                  count: searchMut.data.results.length,
                  query,
                  formatParams: { count: { locale } },
                })}
              </p>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2">
                {searchMut.data.results.map((r, idx) => (
                  <PhotoCard
                    key={r.photo.id}
                    photo={r.photo}
                    badge={`${Math.round(r.score * 100)}%`}
                    onOpen={() => setViewerIndex(idx)}
                  />
                ))}
              </div>
            </>
          )
        ) : null}
        <BulkActionsBar />
        {viewerIndex !== null && photosList.length > 0 ? (
          <PhotoViewer
            photos={photosList}
            index={viewerIndex}
            onClose={() => setViewerIndex(null)}
            onIndexChange={setViewerIndex}
          />
        ) : null}
      </div>
    </div>
  );
}
