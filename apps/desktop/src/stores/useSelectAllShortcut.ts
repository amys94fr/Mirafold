import { useEffect } from "react";
import { useSelection } from "./selection";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

/**
 * Active Ctrl+A / Cmd+A pour sélectionner toutes les photos visibles dans la vue courante,
 * Ctrl+Shift+A pour désélectionner. Ignore les frappes pendant la saisie dans un champ.
 */
export function useSelectAllShortcut(ids: number[]): void {
  const setSelection = useSelection((s) => s.set);
  const clear = useSelection((s) => s.clear);

  useEffect(() => {
    if (ids.length === 0) return;
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key !== "a" && e.key !== "A") return;
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      if (e.shiftKey) {
        clear();
      } else {
        setSelection(ids);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [ids, setSelection, clear]);
}
