const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const openPanels: HTMLElement[] = [];
const inertedElements = new Map<HTMLElement, boolean>();
let originalBodyOverflow = "";

function updateBackgroundInertness() {
  for (const [element, previous] of inertedElements) element.inert = previous;
  inertedElements.clear();
  const top = openPanels.at(-1);
  if (!top) return;
  let current: HTMLElement = top;
  while (current !== document.body && current.parentElement) {
    const parent = current.parentElement;
    for (const sibling of parent.children) {
      if (sibling === current || !(sibling instanceof HTMLElement)) continue;
      inertedElements.set(sibling, sibling.inert);
      sibling.inert = true;
    }
    current = parent;
  }
}

function focusableElements(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => element.getClientRects().length > 0 && element.getAttribute("aria-hidden") !== "true");
}

export function activateOverlay(panel: HTMLElement, onClose: () => void): () => void {
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  if (openPanels.length === 0) {
    originalBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  openPanels.push(panel);
  updateBackgroundInertness();
  let active = true;
  const focusFirst = () => (focusableElements(panel)[0] ?? panel).focus({ preventScroll: true });
  queueMicrotask(() => { if (active && openPanels.at(-1) === panel) focusFirst(); });

  const onKeyDown = (event: KeyboardEvent) => {
    if (openPanels.at(-1) !== panel) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const candidates = focusableElements(panel);
    if (candidates.length === 0) { event.preventDefault(); panel.focus(); return; }
    const first = candidates[0];
    const last = candidates[candidates.length - 1];
    if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
  };
  const onFocusIn = (event: FocusEvent) => {
    if (openPanels.at(-1) === panel && !panel.contains(event.target as Node)) focusFirst();
  };
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("focusin", onFocusIn, true);

  return () => {
    active = false;
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("focusin", onFocusIn, true);
    const index = openPanels.indexOf(panel);
    if (index !== -1) openPanels.splice(index, 1);
    updateBackgroundInertness();
    if (openPanels.length === 0) document.body.style.overflow = originalBodyOverflow;
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    else openPanels.at(-1)?.focus({ preventScroll: true });
  };
}
