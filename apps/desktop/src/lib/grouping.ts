import type { Photo } from "./api";

export type GroupMode =
  | "none"
  | "folder"
  | "year"
  | "month"
  | "city"
  | "country"
  | "camera_make"
  | "camera_model";

export interface PhotoGroup {
  key: string;
  label: string;
  photos: Photo[];
}

const MONTH_LABELS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

function dateOf(photo: Photo): string | null {
  return photo.taken_at ?? photo.indexed_at ?? null;
}

function parentFolderName(p: string): string {
  const normalized = p.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 2] ?? "(racine)";
}

export function photoGroupKey(photo: Photo, mode: GroupMode): string {
  if (mode === "folder") return parentFolderName(photo.path);
  if (mode === "city") return (photo.city ?? "").trim() || "Sans GPS";
  if (mode === "country") return (photo.country ?? "").trim() || "Sans GPS";
  if (mode === "camera_make")
    return (photo.camera_make ?? "").trim() || "Sans appareil";
  if (mode === "camera_model")
    return (photo.camera_model ?? "").trim() || "Sans appareil";
  const d = dateOf(photo);
  if (!d) return "Sans date";
  if (mode === "year") return d.slice(0, 4);
  if (mode === "month") return d.slice(0, 7);
  return "";
}

const groupKey = photoGroupKey;

export function formatGroupLabel(key: string, mode: GroupMode): string {
  if (mode === "month" && /^\d{4}-\d{2}$/.test(key)) {
    const [year, month] = key.split("-");
    const idx = Math.max(0, Math.min(11, Number(month) - 1));
    return `${MONTH_LABELS[idx]} ${year}`;
  }
  return key;
}

const groupLabel = formatGroupLabel;

export function groupPhotos(photos: Photo[], mode: GroupMode): PhotoGroup[] {
  if (mode === "none") return [{ key: "all", label: "", photos }];

  const buckets = new Map<string, Photo[]>();
  for (const p of photos) {
    const k = groupKey(p, mode);
    const arr = buckets.get(k);
    if (arr) arr.push(p);
    else buckets.set(k, [p]);
  }

  const groups: PhotoGroup[] = Array.from(buckets, ([key, list]) => ({
    key,
    label: groupLabel(key, mode),
    photos: list,
  }));

  const PLACEHOLDERS = new Set(["Sans date", "Sans GPS", "Sans appareil"]);
  if (
    mode === "folder" ||
    mode === "city" ||
    mode === "country" ||
    mode === "camera_make" ||
    mode === "camera_model"
  ) {
    groups.sort((a, b) => a.label.localeCompare(b.label, "fr"));
  } else {
    groups.sort((a, b) => b.key.localeCompare(a.key));
  }
  // Toujours pousser les placeholders à la fin
  const placeholders: PhotoGroup[] = [];
  const rest: PhotoGroup[] = [];
  for (const g of groups) {
    (PLACEHOLDERS.has(g.key) ? placeholders : rest).push(g);
  }
  return [...rest, ...placeholders];
}
