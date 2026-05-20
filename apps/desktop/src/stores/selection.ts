import { create } from "zustand";

interface SelectionState {
  selected: Set<number>;
  toggle: (id: number) => void;
  add: (ids: number[]) => void;
  set: (ids: number[]) => void;
  clear: () => void;
  has: (id: number) => boolean;
  size: () => number;
  toArray: () => number[];
}

export const useSelection = create<SelectionState>((set, get) => ({
  selected: new Set(),
  toggle: (id) =>
    set((state) => {
      const next = new Set(state.selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selected: next };
    }),
  add: (ids) =>
    set((state) => {
      const next = new Set(state.selected);
      for (const id of ids) next.add(id);
      return { selected: next };
    }),
  set: (ids) => set({ selected: new Set(ids) }),
  clear: () => set({ selected: new Set() }),
  has: (id) => get().selected.has(id),
  size: () => get().selected.size,
  toArray: () => [...get().selected],
}));
