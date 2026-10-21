import { describe, expect, it } from 'vitest';
import { EVENTS } from '../data/events';
import { buyUpgrade, purchaseStock } from '../engine';
import { resolveEvent, rollEventForDay } from '../events';
import { reconcileReport } from '../reports';
import { visibleTodayEvent } from '../selectors';
import { expectOk, newGame, settle, soldOf, stockAll, withEvent } from './helpers';

describe('event rolls', () => {
  it('are reproducible for the same seed and day', () => {
    for (let day = 1; day <= 50; day++) {
      expect(rollEventForDay(99, day)).toBe(rollEventForDay(99, day));
    }
  });

  it('never fire on day 1 and respect minimum days', () => {
    for (let seed = 0; seed < 200; seed++) {
      expect(rollEventForDay(seed, 1)).toBeNull();
      const e = rollEventForDay(seed, 2);
      if (e) expect(EVENTS[e].minDay).toBeLessThanOrEqual(2);
    }
  });

  it('produce a mix of event days and quiet days', () => {
    const results = Array.from({ length: 400 }, (_, i) => rollEventForDay(5, i + 2));
    const withEvents = results.filter(Boolean).length;
    expect(withEvents).toBeGreaterThan(150);
    expect(withEvents).toBeLessThan(300);
  });

  it('hide surprise events during preparation', () => {
    expect(visibleTodayEvent(withEvent(newGame(), 'machine_breakdown'))).toBeNull();
    expect(visibleTodayEvent(withEvent(newGame(), 'heavy_rain'))?.title).toBe(EVENTS.heavy_rain.title);
  });
});

describe('event effects', () => {
  const stocked = () => stockAll(newGame(), 150);

  it('surprise events only affect hours from when they happen', () => {
    const calm = settle(stocked()).report;
    const viral = settle(withEvent(stocked(), 'viral_post')).report; // happens at 12:00
    const before = (r: typeof calm) => r.hourly.filter((h) => h.hour < 12);
    const after = (r: typeof calm) => r.hourly.filter((h) => h.hour >= 12).reduce((n, h) => n + h.arrivals, 0);
    expect(before(viral)).toEqual(before(calm));
    expect(after(viral)).toBeGreaterThan(after(calm));
    const opening = viral.timeline[0]?.text ?? '';
    expect(opening).toContain('kapasiti 8 pesanan sejam');
  });

  it('forecast events apply from opening time', () => {
    const calm = settle(stocked()).report;
    const fest = settle(withEvent(stocked(), 'food_festival')).report;
    expect(fest.hourly[0]?.arrivals).toBeGreaterThan(calm.hourly[0]?.arrivals ?? 0);
  });

  it('heavy rain reduces footfall', () => {
    const calm = settle(stocked()).report;
    const rain = settle(withEvent(stocked(), 'heavy_rain')).report;
    expect(rain.customers.arrivals).toBeLessThan(calm.customers.arrivals);
    expect(rain.eventId).toBe('heavy_rain');
  });

  it('food festival increases footfall', () => {
    const calm = settle(stocked()).report;
    const fest = settle(withEvent(stocked(), 'food_festival')).report;
    expect(fest.customers.arrivals).toBeGreaterThan(calm.customers.arrivals);
  });

  it('heatwave shifts demand toward iced tea', () => {
    const calm = settle(stocked()).report;
    const hot = settle(withEvent(stocked(), 'heatwave')).report;
    expect(soldOf(hot, 'teh_ais') / hot.customers.served).toBeGreaterThan(soldOf(calm, 'teh_ais') / calm.customers.served);
  });

  it('power outage closes the café for three hours', () => {
    const { report } = settle(withEvent(stocked(), 'power_outage'));
    for (const hour of [14, 15, 16]) {
      const line = report.hourly.find((h) => h.hour === hour);
      expect(line?.capacity).toBe(0);
      expect(line?.served).toBe(0);
    }
    expect(report.customers.lostClosed).toBeGreaterThan(0);
  });

  it('machine breakdown cuts capacity and charges repairs as other expenses', () => {
    const { report } = settle(withEvent(stocked(), 'machine_breakdown'));
    // The machine breaks at 11:00: full capacity before, floor(8 * 0.65) = 5 afterwards.
    expect(report.hourly.find((h) => h.hour === 10)?.capacity).toBe(8);
    expect(report.hourly.find((h) => h.hour === 11)?.capacity).toBe(5);
    expect(report.hourly.find((h) => h.hour === 19)?.capacity).toBe(5);
    expect(report.expenses.eventCostSen).toBe(12_000);
    expect(report.transactions).toContainEqual(expect.objectContaining({ type: 'event_cost', amountSen: -12_000 }));
    expect(reconcileReport(report).ok).toBe(true);
  });

  it('health inspection fine is avoided with the hygiene upgrade', () => {
    const fined = settle(withEvent(stocked(), 'health_inspection')).report;
    expect(fined.expenses.eventCostSen).toBe(20_000);
    const clean = settle(withEvent(expectOk(buyUpgrade(stocked(), 'hygiene_system')).state, 'health_inspection')).report;
    expect(clean.expenses.eventCostSen).toBe(0);
    expect(clean.eventOutcome).toContain('lulus');
    expect(resolveEvent('health_inspection', ['hygiene_system'])?.mitigated).toBe(true);
  });

  it('barista contest records other income', () => {
    const { report } = settle(withEvent(stocked(), 'barista_contest'));
    expect(report.otherIncomeSen).toBe(25_000);
    expect(reconcileReport(report).ok).toBe(true);
  });

  it('office order sells extra units from stock, limited by stock on hand', () => {
    const full = settle(withEvent(stocked(), 'office_order')).report;
    expect(full.eventOutcome).toContain('20/20');
    const tight = expectOk(purchaseStock(withEvent(newGame(), 'office_order'), 'latte', 5)).state;
    const partial = settle(tight).report;
    expect(soldOf(partial, 'latte')).toBeLessThanOrEqual(5);
    expect(partial.eventOutcome).toContain('/20');
  });

  it('food blogger rewards excellent service and punishes poor service', () => {
    const good = settle(withEvent(stockAll(newGame(), 150), 'food_blogger')).report;
    const bad = settle(withEvent(newGame(), 'food_blogger')).report; // no stock at all
    expect(good.reputationAfter - good.reputationBefore).toBeGreaterThan(bad.reputationAfter - bad.reputationBefore);
    expect(bad.reputationAfter).toBeLessThan(bad.reputationBefore);
  });

  it('coffee price spike makes today’s coffee stock more expensive', () => {
    const normal = expectOk(purchaseStock(newGame(), 'latte', 10)).state;
    const spiked = expectOk(purchaseStock(withEvent(newGame(), 'coffee_price_spike'), 'latte', 10)).state;
    expect(spiked.products.latte.stockValueSen).toBeGreaterThan(normal.products.latte.stockValueSen);
  });
});
