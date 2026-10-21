/**
 * Random business events. Each day's event is rolled once from (seed, day),
 * so it is reproducible and cannot be re-rolled by reloading.
 */
import { EVENT_CHANCE, EVENT_IDS, EVENTS, type EventDef, type EventEffects } from './data/events';
import { dayRng, RNG_PURPOSE } from './rng';
import type { EventId, UpgradeId } from './types';

export interface ResolvedEvent {
  def: EventDef;
  effects: EventEffects;
  mitigated: boolean;
  mitigationNote: string | null;
}

export function rollEventForDay(seed: number, day: number): EventId | null {
  if (day <= 1) return null; // a calm first day for new players
  const rng = dayRng(seed, day, RNG_PURPOSE.event);
  if (!rng.chance(EVENT_CHANCE)) return null;
  const eligible = EVENT_IDS.filter((id) => EVENTS[id].minDay <= day);
  return rng.weighted(eligible, (id) => EVENTS[id].weight) ?? null;
}

export function resolveEvent(eventId: EventId | null, upgrades: readonly UpgradeId[]): ResolvedEvent | null {
  if (!eventId) return null;
  const def = EVENTS[eventId];
  if (def.mitigation && upgrades.includes(def.mitigation.upgrade)) {
    return { def, effects: def.mitigation.effects, mitigated: true, mitigationNote: def.mitigation.note };
  }
  return { def, effects: def.effects, mitigated: false, mitigationNote: null };
}

/** Whether the player can see this event during preparation. */
export function isEventVisibleInPrep(eventId: EventId | null): boolean {
  return eventId !== null && EVENTS[eventId].visibility === 'forecast';
}
