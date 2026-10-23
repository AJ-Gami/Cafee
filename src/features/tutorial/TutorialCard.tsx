import { ArrowRight, Check, GraduationCap, Sparkles } from 'lucide-react';
import { useGame } from '../../app/GameProvider';
import { useNav } from '../../app/navigation';
import { useTutorialHidden } from '../../app/tutorial';
import { Button } from '../../components/Button';
import { Card, CardTitle } from '../../components/Card';
import { ProgressBar } from '../../components/ProgressBar';
import { tutorialSteps } from '../../game/tutorial';

/** The getting-started guide on the dashboard: every step, ticked off as the game shows it done. */
export function TutorialCard() {
  const { game } = useGame();
  const { go } = useNav();
  const { hidden, hide } = useTutorialHidden(game.seed);
  if (game.status !== 'active') return null;
  const steps = tutorialSteps(game);
  const done = steps.filter((s) => s.done).length;
  if (hidden || done === steps.length) return null;
  const current = steps.find((s) => !s.done);
  const isNewPlayer = game.day === 1 && game.phase === 'prep' && game.history.length === 0;

  return (
    <Card aria-labelledby="panduan-title">
      <CardTitle
        title={<span id="panduan-title">{isNewPlayer ? 'Selamat datang, usahawan!' : 'Panduan bermula'}</span>}
        subtitle={isNewPlayer ? 'Anda ada RM5,000 untuk membina empayar kafe anda. Ikut langkah ini untuk bermula.' : `${done} daripada ${steps.length} langkah selesai.`}
        icon={isNewPlayer ? <Sparkles className="size-5" /> : <GraduationCap className="size-5" />}
      />
      <ProgressBar value={done} max={steps.length} label="Kemajuan panduan" className="mb-3" />
      <ol className="space-y-2.5 text-[15px] text-espresso-700">
        {steps.map((step, i) => {
          const active = step === current;
          return (
            <li key={step.id} className={`rounded-xl ${active ? 'bg-cream-100 p-3' : ''}`}>
              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                    step.done ? 'bg-sage-600 text-white' : 'bg-sage-100 text-sage-800'
                  }`}
                >
                  {step.done ? <Check className="size-4" aria-label="Selesai" /> : i + 1}
                </span>
                <span className={`min-w-0 flex-1 ${step.done ? 'text-espresso-600 line-through' : active ? 'font-semibold text-espresso-800' : ''}`}>
                  {step.title}
                </span>
                {active ? (
                  <Button size="sm" variant="primary" onClick={() => go(step.tab, step.sub)} aria-label={`Pergi: ${step.title}`}>
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
              {active ? <p className="mt-2 text-sm text-espresso-700">{step.detail}</p> : null}
            </li>
          );
        })}
      </ol>
      <div className="mt-3 text-right">
        <Button size="sm" variant="ghost" onClick={hide}>
          Sembunyikan panduan
        </Button>
      </div>
    </Card>
  );
}
