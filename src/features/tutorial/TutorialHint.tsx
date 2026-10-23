import { useGame } from '../../app/GameProvider';
import { useNav } from '../../app/navigation';
import { useTutorialHidden } from '../../app/tutorial';
import { Button } from '../../components/Button';
import { Notice } from '../../components/Notice';
import { currentTutorialStep } from '../../game/tutorial';

const SUB_LABEL: Record<string, string> = { inventori: 'Inventori', objektif: 'Objektif' };

/** The guide's current step, shown on the screen where it is done. */
export function TutorialHint() {
  const { game } = useGame();
  const { tab, sub, go } = useNav();
  const { hidden, hide } = useTutorialHidden(game.seed);
  const current = game.status === 'active' ? currentTutorialStep(game) : null;
  if (hidden || !current || current.step.tab !== tab) return null;
  const { step, index, total } = current;
  const elsewhere = step.sub !== null && step.sub !== sub;

  return (
    <Notice
      title={`Panduan ${index + 1}/${total}: ${step.title}`}
      action={
        <div className="flex flex-wrap gap-2">
          {elsewhere ? (
            <Button size="sm" variant="secondary" onClick={() => go(step.tab, step.sub)}>
              Buka {SUB_LABEL[step.sub ?? ''] ?? 'skrin ini'}
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={hide}>
            Sembunyikan panduan
          </Button>
        </div>
      }
    >
      {step.detail}
    </Notice>
  );
}
