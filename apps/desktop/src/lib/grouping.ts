import type { TFunction } from "i18next";
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
  photos: Photo[];
}

const PLACEHOLDER_NO_DATE = "@@noDate";
const PLACEHOLDER_NO_GPS = "@@noGps";
const PLACEHOLDER_NO_CAMERA = "@@noCamera";

const PLACEHOLDERS = new Set([
  PLACEHOLDER_NO_DATE,
  PLACEHOLDER_NO_GPS,
  PLACEHOLDER_NO_CAMERA,
]);

function dateOf(photo: Photo): string | null {
  return photo.taken_at ?? photo.indexed_at ?? null;
}

function parentFolderName(p: string): string {
  const normalized = p.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 2] ?? "(root)";
}

export function photoGroupKey(photo: Photo, mode: GroupMode): string {
  if (mode === "folder") return parentFolderName(photo.path);
  if (mode === "city")
    return (photo.city ?? "").trim() || PLACEHOLDER_NO_GPS;
  if (mode === "country")
    return (photo.country ?? "").trim() || PLACEHOLDER_NO_GPS;
  if (mode === "camera_make")
    return (photo.camera_make ?? "").trim() || PLACEHOLDER_NO_CAMERA;
  if (mode === "camera_model")
    return (photo.camera_model ?? "").trim() || PLACEHOLDER_NO_CAMERA;
  const d = dateOf(photo);
  if (!d) return PLACEHOLDER_NO_DATE;
  if (mode === "year") return d.slice(0, 4);
  if (mode === "month") return d.slice(0, 7);
  return "";
}

export function formatGroupLabel(
  key: string,
  mode: GroupMode,
  t: TFunction,
  locale: string,
): string {
  if (key === PLACEHOLDER_NO_DATE) return t("library.placeholders.noDate");
  if (key === PLACEHOLDER_NO_GPS) return t("library.placeholders.noGps");
  if (key === PLACEHOLDER_NO_CAMERA) return t("library.placeholders.noCamera");
  if (mode === "month" && /^\d{4}-\d{2}$/.test(key)) {
    const [year, month] = key.split("-");
    const d = new Date(Number(year), Number(month) - 1, 1);
    const monthName = d.toLocaleDateString(locale, { month: "long" });
    return `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)} ${year}`;
  }
  return key;
}

export function groupPhotos(photos: Photo[], mode: GroupMode): PhotoGroup[] {
  if (mode === "none") return [{ key: "all", photos }];

  const buckets = new Map<string, Photo[]>();
  for (const p of photos) {
    const k = photoGroupKey(p, mode);
    const arr = buckets.get(k);
    if (arr) arr.push(p);
    else buckets.set(k, [p]);
  }

  const groups: PhotoGroup[] = Array.from(buckets, ([key, list]) => ({
    key,
    photos: list,
  }));

  if (
    mode === "folder" ||
    mode === "city" ||
    mode === "country" ||
    mode === "camera_make" ||
    mode === "camera_model"
  ) {
    groups.sort((a, b) => a.key.localeCompare(b.key));
  } else {
    groups.sort((a, b) => b.key.localeCompare(a.key));
  }
  const placeholders: PhotoGroup[] = [];
  const rest: PhotoGroup[] = [];
  for (const g of groups) {
    (PLACEHOLDERS.has(g.key) ? placeholders : rest).push(g);
  }
  return [...rest, ...placeholders];
}
