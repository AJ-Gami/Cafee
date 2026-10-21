/** Objectives award XP; XP determines the café level, which unlocks upgrades and promotions. */
import { LEVELS, OBJECTIVES, type LevelDef, type ObjectiveDef } from './data/objectives';
import type { GameState, ObjectiveId } from './types';

const OBJECTIVE_BY_ID = new Map<ObjectiveId, ObjectiveDef>(OBJECTIVES.map((o) => [o.id, o]));

export function objectiveDef(id: ObjectiveId): ObjectiveDef {
  const def = OBJECTIVE_BY_ID.get(id);
  if (!def) throw new Error(`Unknown objective ${id}`);
  return def;
}

export function totalXp(state: GameState): number {
  return state.completedObjectives.reduce((sum, o) => sum + (OBJECTIVE_BY_ID.get(o.id)?.xp ?? 0), 0);
}

export interface LevelInfo {
  current: LevelDef;
  next: LevelDef | null;
  xp: number;
  /** 0..1 progress from current level to the next. */
  progress: number;
}

export function levelInfo(state: GameState): LevelInfo {
  const xp = totalXp(state);
  let current: LevelDef = LEVELS[0] as LevelDef;
  for (const level of LEVELS) if (xp >= level.minXp) current = level;
  const next = LEVELS.find((l) => l.minXp > xp) ?? null;
  const progress = next ? (xp - current.minXp) / (next.minXp - current.minXp) : 1;
  return { current, next, xp, progress };
}

export function currentLevel(state: GameState): number {
  return levelInfo(state).current.level;
}

export function isObjectiveComplete(state: GameState, id: ObjectiveId): boolean {
  return state.completedObjectives.some((o) => o.id === id);
}

/** Mark any newly satisfied objectives as complete. Pure. */
export function evaluateObjectives(state: GameState): { state: GameState; newlyCompleted: ObjectiveId[] } {
  const newlyCompleted: ObjectiveId[] = [];
  for (const def of OBJECTIVES) {
    if (isObjectiveComplete(state, def.id)) continue;
    if (def.progress(state) >= def.target) newlyCompleted.push(def.id);
  }
  if (newlyCompleted.length === 0) return { state, newlyCompleted };
  return {
    state: {
      ...state,
      completedObjectives: [...state.completedObjectives, ...newlyCompleted.map((id) => ({ id, day: state.day }))],
    },
    newlyCompleted,
  };
}
