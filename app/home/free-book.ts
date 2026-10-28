// UI hint only; real enforcement will be server-side.
const KEY = "lectoria.freeBookUsed.v1";

export function getFreeBookUsed(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setFreeBookUsed(): void {
  try {
    window.localStorage.setItem(KEY, "1");
  } catch {
    // Private mode or blocked storage: the hint just does not stick.
  }
}
