import { describe, expect, it } from 'vitest';
import { hireStaff, startNextDay } from '../engine';
import { candidatesForState } from '../staff';
import { currentTutorialStep, tutorialSteps } from '../tutorial';
import type { GameState } from '../types';
import { expectOk, newGame, settle, stockAll } from './helpers';

const done = (s: GameState) => tutorialSteps(s).filter((t) => t.done).map((t) => t.id);

describe('the getting-started guide', () => {
  it('follows a new player through their first days, one step at a time', () => {
    let s = newGame();
    expect(done(s)).toEqual([]);
    expect(currentTutorialStep(s)).toMatchObject({ step: { id: 'stok', tab: 'menu', sub: 'inventori' }, index: 0, total: 5 });

    s = stockAll(s, 40);
    expect(done(s)).toEqual(['stok']);
    expect(currentTutorialStep(s)?.step.id).toBe('buka');

    s = settle(s).state;
    expect(done(s)).toEqual(['stok', 'buka']);
    expect(currentTutorialStep(s)?.step.id).toBe('laporan');

    s = expectOk(startNextDay(s, s.day)).state;
    expect(done(s)).toEqual(['stok', 'buka', 'laporan']);
    expect(currentTutorialStep(s)?.step).toMatchObject({ id: 'rutin', tab: 'operasi' });

    // Hiring does not finish the second day: playing it does.
    s = expectOk(hireStaff(s, candidatesForState(s)[0]!.id)).state;
    expect(currentTutorialStep(s)?.step.id).toBe('rutin');
    s = settle(stockAll(s, 40)).state;
    s = expectOk(startNextDay(s, s.day)).state;
    // By then the first days' objectives have taken the café to level 2.
    expect(done(s)).toEqual(['stok', 'buka', 'laporan', 'rutin', 'tahap']);
    expect(currentTutorialStep(s)).toBeNull();
  });

  it('counts a step done out of order, and keeps pointing at the first one left', () => {
    const levelTwo = { ...newGame(), completedObjectives: [{ id: 'cash_8000' as const, day: 1 }, { id: 'rep_70' as const, day: 1 }] };
    expect(done(levelTwo)).toEqual(['tahap']);
    expect(currentTutorialStep(levelTwo)?.step.id).toBe('stok');
  });
});
