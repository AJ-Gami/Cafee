import { X } from 'lucide-react';
import { useEffect, useId, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Open modals, innermost last. Only the top-most one reacts to Escape and traps Tab. `focusTarget`
 * takes focus when a modal above closes and the control it came from no longer exists.
 */
const modalStack: { token: symbol; focusTarget: HTMLElement | null }[] = [];
/** Increases every time any modal opens, even when another closes in the same update. */
let modalOpenSeq = 0;
const stackListeners = new Set<() => void>();
const notifyStack = () => stackListeners.forEach((l) => l());

function subscribeStack(listener: () => void): () => void {
  stackListeners.add(listener);
  return () => stackListeners.delete(listener);
}

/** Number of dialogs and sheets currently open (0 when none). */
export function useOpenModalCount(): number {
  return useSyncExternalStore(subscribeStack, () => modalStack.length, () => 0);
}

/** A counter that changes whenever a dialog or sheet opens. */
export function useModalOpenSeq(): number {
  return useSyncExternalStore(subscribeStack, () => modalOpenSeq, () => 0);
}

function useModalBehaviour(
  open: boolean,
  onClose: () => void,
  panelRef: React.RefObject<HTMLDivElement | null>,
  focusTargetRef: React.RefObject<HTMLDivElement | null> = panelRef,
) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const token = Symbol('modal');
    const panel = panelRef.current;
    modalStack.push({ token, focusTarget: focusTargetRef.current });
    modalOpenSeq += 1;
    notifyStack();
    document.body.style.overflow = 'hidden';
    const first =
      panel?.querySelector<HTMLElement>('[data-autofocus]') ??
      Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).find((el) => el.getClientRects().length > 0);
    first?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (modalStack[modalStack.length - 1]?.token !== token) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      // Only rendered elements can take focus (a display:none file input would break the wrap).
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0);
      if (items.length === 0) return;
      const firstEl = items[0] as HTMLElement;
      const lastEl = items[items.length - 1] as HTMLElement;
      // Focus can end up outside (e.g. on <body> after the focused control was removed) or on the
      // panel itself, where the browser's own Tab order would leave the modal: bring it back.
      const active = document.activeElement;
      if (active === panel || !panel.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? lastEl : firstEl).focus();
      } else if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const index = modalStack.findIndex((m) => m.token === token);
      if (index >= 0) modalStack.splice(index, 1);
      notifyStack();
      if (modalStack.length === 0) document.body.style.overflow = '';
      // Return focus to where it was; if that control is gone (e.g. the button that opened this
      // dialog was removed by the action), keep focus inside the modal underneath, if any.
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
      else modalStack[modalStack.length - 1]?.focusTarget?.focus();
    };
  }, [open, panelRef, focusTargetRef]);
}

/** Centered dialog for confirmations. */
export function Dialog({
  open,
  onClose,
  title,
  children,
  role = 'dialog',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  role?: 'dialog' | 'alertdialog';
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModalBehaviour(open, onClose, panelRef);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div className="absolute inset-0 bg-espresso-900/50" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative w-full max-w-sm animate-pop rounded-3xl bg-cream-50 p-5 shadow-lift outline-none"
      >
        <h2 id={titleId} className="pr-8 font-display text-xl text-espresso-800">
          {title}
        </h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Tall bottom sheet for detailed content (settings, past reports). Its top edge always leaves
 * room for a toast so feedback never covers the sheet's title or close button.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // The scrolling body is the fallback focus target, so keys like PageDown keep scrolling it.
  useModalBehaviour(open, onClose, panelRef, bodyRef);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-40 flex items-end justify-center">
      <div className="absolute inset-0 bg-espresso-900/50" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[calc(100dvh-7.5rem-env(safe-area-inset-top,0px))] w-full max-w-md animate-fade-up flex-col rounded-t-3xl bg-cream-100 shadow-lift"
      >
        <div className="flex items-center justify-between gap-3 border-b border-espresso-800/10 px-4 py-2">
          <h2 id={titleId} className="font-display text-xl text-espresso-800">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="inline-flex size-11 items-center justify-center rounded-xl text-espresso-700 hover:bg-cream-200"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <div ref={bodyRef} tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 outline-none">
          {children}
        </div>
        {footer ? <div className="border-t border-espresso-800/10 px-4 pb-safe pt-3">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
