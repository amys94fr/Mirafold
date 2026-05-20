import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, CheckCircle2, AlertCircle } from "lucide-react";
import { api } from "@/lib/api";

export function ScanIndicator() {
  const qc = useQueryClient();
  const lastStatus = useRef<string | null>(null);

  const { data, isError } = useQuery({
    queryKey: ["scan-status"],
    queryFn: api.scanStatus,
    refetchInterval: 1500,
    retry: false,
  });

  useEffect(() => {
    if (!data) return;
    const prev = lastStatus.current;
    const curr = data.status;
    lastStatus.current = curr;
    if (prev && prev !== curr && (curr === "done" || curr === "error")) {
      qc.invalidateQueries({ queryKey: ["photos"] });
      qc.invalidateQueries({ queryKey: ["duplicates"] });
      qc.invalidateQueries({ queryKey: ["face-clusters"] });
    }
  }, [data, qc]);

  if (isError) {
    return (
      <div className="flex items-center gap-2 text-xs text-destructive">
        <AlertCircle className="size-4" aria-hidden />
        Service ML déconnecté
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Activity className="size-4 animate-pulse" aria-hidden />
        Connexion...
      </div>
    );
  }

  if (data.status === "idle" || data.status === "done") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <CheckCircle2 className="size-4 text-emerald-500" aria-hidden />
        {data.processed > 0
          ? `${data.processed.toLocaleString("fr-FR")} photos indexées`
          : "Aucune photo indexée"}
      </div>
    );
  }

  const pct =
    data.total_files > 0
      ? Math.round((data.processed / data.total_files) * 100)
      : 0;

  const labels: Record<string, string> = {
    scanning: "Analyse du système de fichiers",
    hashing: "Calcul des empreintes",
    embedding: "Indexation sémantique",
    faces: "Détection des visages",
    error: "Erreur",
  };

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Activity
          className="size-4 animate-pulse text-primary"
          aria-hidden
        />
        <span>{labels[data.status] ?? data.status}</span>
        <span className="font-mono text-foreground">{pct}%</span>
      </div>
      <div
        className="h-1.5 w-32 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
