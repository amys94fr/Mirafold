const ML_BASE_URL = "http://127.0.0.1:8765";

export interface Photo {
  id: number;
  path: string;
  filename: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  taken_at: string | null;
  lat?: number | null;
  lon?: number | null;
  city?: string | null;
  country?: string | null;
  camera_make?: string | null;
  camera_model?: string | null;
  indexed_at: string;
  phash: string | null;
  has_clip_embedding: boolean;
  face_count: number;
}

export interface ScanProgress {
  status: "idle" | "scanning" | "hashing" | "embedding" | "faces" | "done" | "error";
  total_files: number;
  processed: number;
  current_path: string | null;
  errors: number;
  started_at: string | null;
  finished_at: string | null;
}

export interface DuplicateGroup {
  group_id: string;
  similarity: number;
  photos: Photo[];
}

export interface FaceCluster {
  cluster_id: number;
  label: string | null;
  face_count: number;
  preview_photo_id: number | null;
  preview_face_box: [number, number, number, number] | null;
}

export interface SemanticSearchResult {
  photo: Photo;
  score: number;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${ML_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ML service ${res.status}: ${text || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => request<{ ok: boolean; version: string }>("/health"),

  listRoots: () => request<{ roots: string[] }>("/library/roots"),
  addRoot: (path: string) =>
    request<{ ok: boolean }>("/library/roots", {
      method: "POST",
      body: JSON.stringify({ path }),
    }),
  removeRoot: (path: string) =>
    request<{ ok: boolean }>("/library/roots", {
      method: "DELETE",
      body: JSON.stringify({ path }),
    }),

  startScan: (opts?: { full?: boolean }) =>
    request<ScanProgress>("/scan/start", {
      method: "POST",
      body: JSON.stringify(opts ?? {}),
    }),
  scanStatus: () => request<ScanProgress>("/scan/status"),
  cancelScan: () => request<{ ok: boolean }>("/scan/cancel", { method: "POST" }),
  backfillDates: () =>
    request<{ updated: number; scanned: number }>("/photos/backfill_dates", {
      method: "POST",
    }),
  backfillGps: () =>
    request<{ scanned: number; with_gps: number; geocoded: number }>(
      "/photos/backfill_gps",
      { method: "POST" },
    ),
  backfillCameras: () =>
    request<{ updated: number; scanned: number }>(
      "/photos/backfill_cameras",
      { method: "POST" },
    ),

  listPhotos: (params: { limit?: number; offset?: number; query?: string }) => {
    const qs = new URLSearchParams();
    if (params.limit) qs.set("limit", String(params.limit));
    if (params.offset) qs.set("offset", String(params.offset));
    if (params.query) qs.set("query", params.query);
    return request<{ photos: Photo[]; total: number }>(`/photos?${qs}`);
  },

  photoThumb: (id: number) => `${ML_BASE_URL}/photos/${id}/thumb`,
  photoFull: (id: number) => `${ML_BASE_URL}/photos/${id}/full`,

  duplicates: (similarity: number = 0.95) =>
    request<{ groups: DuplicateGroup[] }>(`/duplicates?similarity=${similarity}`),

  faceClusters: () => request<{ clusters: FaceCluster[] }>("/faces/clusters"),
  facePhotos: (clusterId: number) =>
    request<{ photos: Photo[] }>(`/faces/clusters/${clusterId}/photos`),
  searchByFace: (photoId: number, faceIndex: number) =>
    request<{ results: SemanticSearchResult[] }>(`/faces/search`, {
      method: "POST",
      body: JSON.stringify({ photo_id: photoId, face_index: faceIndex }),
    }),
  renameCluster: (clusterId: number, label: string) =>
    request<{ ok: boolean }>(`/faces/clusters/${clusterId}`, {
      method: "PATCH",
      body: JSON.stringify({ label }),
    }),

  semanticSearch: (query: string, limit: number = 60) =>
    request<{ results: SemanticSearchResult[] }>("/search/semantic", {
      method: "POST",
      body: JSON.stringify({ query, limit }),
    }),

  deletePhotos: (ids: number[], opts: { permanent: boolean }) =>
    request<{ deleted: number; errors: string[] }>("/photos/delete", {
      method: "POST",
      body: JSON.stringify({ ids, permanent: opts.permanent }),
    }),
  renamePhotos: (ids: number[], template: string) =>
    request<{ renamed: number; errors: string[] }>("/photos/rename", {
      method: "POST",
      body: JSON.stringify({ ids, template }),
    }),
};
