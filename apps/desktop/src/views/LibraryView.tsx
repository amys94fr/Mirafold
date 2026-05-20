import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  Images, FolderPlus, LayoutGrid, Folder, Calendar, CalendarRange,
  MapPin, Globe2, Camera, Aperture, Filter, X,
} from "lucide-react";
import { api, type Photo } from "@/lib/api";
import { PhotoCard } from "@/components/PhotoCard";
import { BulkActionsBar } from "@/components/BulkActionsBar";
import { EmptyState } from "@/components/EmptyState";
import { PhotoViewer } from "@/components/PhotoViewer";
import { useSelectAllShortcut } from "@/stores/useSelectAllShortcut";
import {
  groupPhotos,
  photoGroupKey,
  formatGroupLabel,
  type GroupMode,
} from "@/lib/grouping";
import { cn } from "@/lib/utils";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

const PAGE_SIZE = 200;

const GROUP_OPTIONS: { value: GroupMode; label: string; icon: typeof LayoutGrid }[] = [
  { value: "none", label: "Aucun", icon: LayoutGrid },
  { value: "folder", label: "Dossier", icon: Folder },
  { value: "year", label: "Année", icon: Calendar },
  { value: "month", label: "Mois", icon: CalendarRange },
  { value: "city", label: "Ville", icon: MapPin },
  { value: "country", label: "Pays", icon: Globe2 },
  { value: "camera_make", label: "Marque", icon: Camera },
  { value: "camera_model", label: "Modèle", icon: Aperture },
];

export function LibraryView() {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [groupMode, setGroupMode] = useState<GroupMode>("none");
  const [filterValue, setFilterValue] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ["photos", PAGE_SIZE],
      queryFn: ({ pageParam = 0 }) =>
        api.listPhotos({ limit: PAGE_SIZE, offset: pageParam }),
      initialPageParam: 0,
      getNextPageParam: (last, all) => {
        const loaded = all.reduce((s, p) => s + p.photos.length, 0);
        return loaded < last.total ? loaded : undefined;
      },
    });

  const photos: Photo[] = useMemo(
    () => (data?.pages ?? []).flatMap((p) => p.photos),
    [data],
  );
  const total = data?.pages[0]?.total ?? 0;

  // Valeurs distinctes pour la dimension courante (avec compteurs)
  const filterChoices = useMemo(() => {
    if (groupMode === "none") return [];
    const m = new Map<string, number>();
    for (const p of photos) {
      const k = photoGroupKey(p, groupMode);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()]
      .map(([key, count]) => ({
        key,
        label: formatGroupLabel(key, groupMode),
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [photos, groupMode]);

  // Photos filtrées selon filterValue
  const filteredPhotos = useMemo(() => {
    if (!filterValue || groupMode === "none") return photos;
    return photos.filter((p) => photoGroupKey(p, groupMode) === filterValue);
  }, [photos, groupMode, filterValue]);

  const visibleIds = useMemo(
    () => filteredPhotos.map((p) => p.id),
    [filteredPhotos],
  );
  useSelectAllShortcut(visibleIds);

  const groups = useMemo(
    () => groupPhotos(filteredPhotos, groupMode),
    [filteredPhotos, groupMode],
  );

  const activeFilterLabel = filterValue
    ? formatGroupLabel(filterValue, groupMode)
    : null;

  useEffect(() => {
    setFilterValue(null);
  }, [groupMode]);

  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "600px" },
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const addFolder = async () => {
    const selected = await openDialog({ directory: true, multiple: false });
    if (typeof selected === "string") {
      await api.addRoot(selected);
      await api.startScan();
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Chargement de la bibliothèque...
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <EmptyState
        icon={Images}
        title="Bibliothèque vide"
        description="Ajoute un dossier à scanner pour commencer à indexer tes photos. Mirafold indexe en local, rien n'est envoyé sur internet."
        action={
          <button
            type="button"
            onClick={addFolder}
            className="mt-2 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <FolderPlus className="size-4" aria-hidden />
            Ajouter un dossier
          </button>
        }
      />
    );
  }

  return (
    <div className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Bibliothèque</h1>
          <p className="text-xs text-muted-foreground">
            {filterValue
              ? `${filteredPhotos.length.toLocaleString("fr-FR")} sur ${total.toLocaleString("fr-FR")} photo${total > 1 ? "s" : ""} (filtrées)`
              : `${photos.length.toLocaleString("fr-FR")} sur ${total.toLocaleString("fr-FR")} photo${total > 1 ? "s" : ""} chargée${photos.length > 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="radiogroup"
            aria-label="Grouper par"
            className="flex items-center gap-0.5 rounded-md border border-border bg-card p-0.5 text-xs"
          >
            {GROUP_OPTIONS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                role="radio"
                aria-checked={groupMode === value}
                type="button"
                onClick={() => setGroupMode(value)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded px-2 py-1 transition-colors",
                  groupMode === value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" aria-hidden />
                {label}
              </button>
            ))}
          </div>

          {groupMode !== "none" ? (
            <label className="relative">
              <span className="sr-only">Filtrer par {groupMode}</span>
              <Filter
                className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <select
                value={filterValue ?? ""}
                onChange={(e) => setFilterValue(e.target.value || null)}
                className="appearance-none rounded-md border border-border bg-card py-1 pl-7 pr-3 text-xs hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Tous</option>
                {filterChoices.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label} ({c.count.toLocaleString("fr-FR")})
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <button
            type="button"
            onClick={addFolder}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-muted"
          >
            <FolderPlus className="size-4" aria-hidden />
            Ajouter un dossier
          </button>
        </div>
      </div>

      {activeFilterLabel ? (
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/15 px-3 py-1 text-xs text-primary">
          <Filter className="size-3.5" aria-hidden />
          <span className="font-medium">{activeFilterLabel}</span>
          <button
            type="button"
            onClick={() => setFilterValue(null)}
            className="rounded-full p-0.5 hover:bg-primary/20"
            aria-label="Retirer le filtre"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      ) : null}

      <div className="space-y-6">
        {groups.map((g) => (
          <section key={g.key} aria-label={g.label || "Photos"}>
            {g.label ? (
              <header className="sticky top-0 z-10 mb-2 flex items-baseline justify-between gap-3 bg-background/95 py-1 backdrop-blur-sm">
                <h2 className="text-sm font-semibold tracking-tight">
                  {g.label}
                </h2>
                <span className="text-xs text-muted-foreground">
                  {g.photos.length.toLocaleString("fr-FR")} photo
                  {g.photos.length > 1 ? "s" : ""}
                </span>
              </header>
            ) : null}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2">
              {g.photos.map((p) => {
                const globalIdx = filteredPhotos.indexOf(p);
                return (
                  <PhotoCard
                    key={p.id}
                    photo={p}
                    onOpen={() => setViewerIndex(globalIdx)}
                  />
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <div
        ref={sentinelRef}
        className="flex items-center justify-center py-6 text-xs text-muted-foreground"
      >
        {isFetchingNextPage
          ? "Chargement..."
          : hasNextPage
            ? "Faites défiler pour charger plus"
            : photos.length === total
              ? `Fin de la bibliothèque · ${total.toLocaleString("fr-FR")} photos`
              : ""}
      </div>

      <BulkActionsBar />

      {viewerIndex !== null ? (
        <PhotoViewer
          photos={filteredPhotos}
          index={viewerIndex}
          onClose={() => setViewerIndex(null)}
          onIndexChange={setViewerIndex}
        />
      ) : null}
    </div>
  );
}
