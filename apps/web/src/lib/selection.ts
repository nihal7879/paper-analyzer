import { useSyncExternalStore } from "react";

/**
 * Questions the student picked for a PDF (question ids, in the order picked).
 * Kept in localStorage so the pick survives a reload; later this becomes "My Book" on the server.
 */
const KEY = "pa.selection";
const listeners = new Set<() => void>();
let ids: string[] = read();

function read(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function write(next: string[]) {
  ids = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // private mode: the selection just won't survive a reload
  }
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export const selection = {
  toggle(id: string) {
    write(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  },
  addMany(more: string[]) {
    const have = new Set(ids);
    write([...ids, ...more.filter((id) => !have.has(id))]);
  },
  removeMany(less: string[]) {
    const drop = new Set(less);
    write(ids.filter((id) => !drop.has(id)));
  },
  clear() {
    write([]);
  },
};

/** All selected ids (re-renders when the selection changes). */
export function useSelection(): string[] {
  return useSyncExternalStore(subscribe, () => ids);
}

/** Only re-renders when THIS question's selected state flips (cheap for long lists). */
export function useIsSelected(id: string): boolean {
  return useSyncExternalStore(subscribe, () => ids.includes(id));
}

/** True when every one of these ids is selected (a whole question = all its parts). */
export function useAllSelected(list: string[]): boolean {
  const key = list.join(",");
  return useSyncExternalStore(subscribe, () => list.length > 0 && key.split(",").every((id) => ids.includes(id)));
}
