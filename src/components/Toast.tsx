import { CircleAlert, CircleCheck, Info, Target } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useGame } from '../app/GameProvider';
import { objectiveDef } from '../game/objectives';
import { useModalOpenSeq, useOpenModalCount } from './Modal';

/** Transient feedback for player actions (purchase succeeded/failed, objectives reached). */
export function Toast() {
  const { store, dispatch } = useGame();
  const feedback = store.feedback;
  const modalOpen = useOpenModalCount() > 0;
  const openSeq = useModalOpenSeq();
  const prevOpenSeq = useRef(openSeq);

  // A newly opened dialog or sheet takes over: clear any toast so it can never hide the
  // dialog's buttons. The toast itself always captures its own taps (tap = dismiss only).
  useEffect(() => {
    if (openSeq !== prevOpenSeq.current && feedback) dispatch({ type: 'DISMISS_FEEDBACK', id: feedback.id });
    prevOpenSeq.current = openSeq;
  }, [openSeq, feedback, dispatch]);

  useEffect(() => {
    if (!feedback) return;
    const ms = feedback.kind === 'error' ? 5_000 : feedback.objectives.length > 0 ? 4_500 : 3_000;
    const timer = window.setTimeout(() => dispatch({ type: 'DISMISS_FEEDBACK', id: feedback.id }), ms);
    return () => window.clearTimeout(timer);
  }, [feedback, dispatch]);

  return (
    <div
      className={`pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-4 ${
        modalOpen ? 'top-[calc(8px+env(safe-area-inset-top,0px))]' : 'top-[calc(72px+env(safe-area-inset-top,0px))]'
      }`}
    >
      <div aria-live="polite" role="status" className="w-full max-w-md">
        {feedback ? (
          <button
            type="button"
            key={feedback.id}
            onClick={() => dispatch({ type: 'DISMISS_FEEDBACK', id: feedback.id })}
            className={`pointer-events-auto flex w-full animate-fade-up items-start gap-3 rounded-2xl px-4 py-3 text-left text-[15px] shadow-lift ${
              feedback.kind === 'error' ? 'bg-rust-700 text-white' : feedback.kind === 'info' ? 'bg-espresso-800 text-cream-50' : 'bg-sage-800 text-white'
            }`}
          >
            <span className="mt-0.5 shrink-0" aria-hidden="true">
              {feedback.kind === 'error' ? <CircleAlert className="size-5" /> : feedback.kind === 'info' ? <Info className="size-5" /> : <CircleCheck className="size-5" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block">{feedback.message}</span>
              {feedback.objectives.map((id) => {
                const def = objectiveDef(id);
                return (
                  <span key={id} className="mt-1 flex items-center gap-1.5 font-semibold">
                    <Target className="size-4" aria-hidden="true" /> Objektif dicapai: {def.title} (+{def.xp} XP)
                  </span>
                );
              })}
            </span>
            <span className="sr-only">Ketik untuk tutup</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
