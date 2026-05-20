import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { FolderPlus, X, RefreshCw, Sparkles, Languages } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { api } from "@/lib/api";
import { SUPPORTED_LOCALES, type LocaleCode } from "@/i18n";
import { cn } from "@/lib/utils";

export function SettingsView() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const currentLocale = (i18n.resolvedLanguage ?? i18n.language) as LocaleCode;

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
      <h1 className="text-xl font-semibold">{t("settings.title")}</h1>

      <section className="mt-6 surface p-4">
        <div className="mb-3 flex items-center gap-2">
          <Languages className="size-4 text-primary" aria-hidden />
          <h2 className="font-medium">{t("settings.language.title")}</h2>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          {t("settings.language.description")}
        </p>
        <div
          role="radiogroup"
          aria-label={t("settings.language.title")}
          className="flex flex-wrap gap-2"
        >
          {SUPPORTED_LOCALES.map((l) => {
            const active = currentLocale === l.code;
            return (
              <button
                key={l.code}
                role="radio"
                aria-checked={active}
                type="button"
                onClick={() => i18n.changeLanguage(l.code)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <span className="text-base" aria-hidden>{l.flag}</span>
                {l.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-6 surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="font-medium">{t("settings.roots.title")}</h2>
            <p className="text-xs text-muted-foreground">
              {t("settings.roots.description")}
            </p>
          </div>
          <button
            type="button"
            onClick={addFolder}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <FolderPlus className="size-4" aria-hidden />
            {t("common.addFolder")}
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
                  aria-label={t("settings.roots.removeAria", { path: root })}
                >
                  <X className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-3 text-sm text-muted-foreground">
            {t("settings.roots.empty")}
          </p>
        )}
      </section>

      <section className="mt-6 surface p-4">
        <h2 className="font-medium">{t("settings.indexing.title")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("settings.indexing.description")}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => indexMissingMut.mutate()}
            disabled={indexMissingMut.isPending}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Sparkles className="size-4" aria-hidden />
            {t("settings.indexing.indexMissing")}
          </button>
          <button
            type="button"
            onClick={() => rescanMut.mutate()}
            disabled={rescanMut.isPending}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className="size-4" aria-hidden />
            {t("settings.indexing.rescanAll")}
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {t("settings.indexing.indexMissing")}
          </span>
          {" : "}
          {t("settings.indexing.indexMissingHint")}
          <br />
          <span className="font-medium text-foreground">
            {t("settings.indexing.rescanAll")}
          </span>
          {" : "}
          {t("settings.indexing.rescanAllHint")}
        </p>
      </section>
    </div>
  );
}
