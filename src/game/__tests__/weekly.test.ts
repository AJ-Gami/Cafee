import { describe, expect, it } from 'vitest';
import { weekdayName } from '../demand';
import { sumSen } from '../money';
import { isWeekEnd, weekEndingOn, weeklySummaries, weekOfDay } from '../reports';
import { newGame, playDays } from './helpers';

describe('weekly summaries', () => {
  const { reports } = playDays(newGame(), 16);

  it('numbers weeks from day 1 (Monday) to day 7 (Sunday)', () => {
    expect([1, 7, 8, 14, 15].map(weekOfDay)).toEqual([1, 1, 2, 2, 3]);
    expect([6, 7, 14, 15].map(isWeekEnd)).toEqual([false, true, true, false]);
    expect([weekdayName(1), weekdayName(7)]).toEqual(['Isnin', 'Ahad']);
  });

  it('totals each week exactly from its daily reports', () => {
    const weeks = weeklySummaries(reports);
    expect(weeks.map((w) => [w.week, w.daysPlayed, w.complete, w.coverage])).toEqual([
      [1, 7, true, 'complete'],
      [2, 7, true, 'complete'],
      [3, 2, false, 'in_progress'],
    ]);
    for (const w of weeks) {
      const days = reports.filter((r) => weekOfDay(r.day) === w.week);
      expect(w.revenueSen).toBe(sumSen(days.map((r) => r.revenueSen)));
      expect(w.cogsSen).toBe(sumSen(days.map((r) => r.cogsSen)));
      expect(w.netProfitSen).toBe(sumSen(days.map((r) => r.netProfitSen)));
      expect(w.netProfitSen).toBe(w.revenueSen + w.otherIncomeSen - w.cogsSen - w.totalExpensesSen);
      expect(w.served).toBe(days.reduce((n, r) => n + r.customers.served, 0));
      expect(w.profitableDays).toBe(days.filter((r) => r.netProfitSen > 0).length);
      expect(w.bestDay.revenueSen).toBe(Math.max(...days.map((r) => r.revenueSen)));
      expect(w.openingCashSen).toBe(days[0]?.openingCashSen);
      expect(w.closingCashSen).toBe(days.at(-1)?.closingCashSen);
      expect(w.serviceRate).toBeGreaterThanOrEqual(0);
      expect(w.serviceRate).toBeLessThanOrEqual(1);
    }
    expect(weeks[1]?.openingCashSen).toBe(weeks[0]?.closingCashSen);
  });

  it('compares a complete week only with a complete previous week', () => {
    const [w1, w2, w3] = weeklySummaries(reports);
    expect(w1?.vsPrevious).toBeNull();
    expect(w3?.vsPrevious).toBeNull();
    expect(w2?.vsPrevious).toEqual({
      revenueChangePct: Math.round(((w2!.revenueSen - w1!.revenueSen) * 100) / w1!.revenueSen),
      netProfitChangeSen: w2!.netProfitSen - w1!.netProfitSen,
      servedChange: w2!.served - w1!.served,
    });
  });

  it('marks a week cut off by the history limit as partial, not in progress', () => {
    const weeks = weeklySummaries(reports.slice(4)); // oldest kept report is day 5
    expect(weeks[0]).toMatchObject({ week: 1, daysPlayed: 3, complete: false, coverage: 'cut_off', firstDay: 1, lastDay: 7, firstPlayedDay: 5, lastPlayedDay: 7 });
    expect(weeklySummaries(reports).at(-1)).toMatchObject({ coverage: 'in_progress', firstPlayedDay: 15, lastPlayedDay: 16 });
    expect(weeks[1]?.vsPrevious).toBeNull();
  });

  it('does not describe the last week of an ended game as still being played', () => {
    expect(weeklySummaries(reports, false).map((w) => w.coverage)).toEqual(['complete', 'complete', 'ended']);
  });

  it('finds the week that ends on a given day', () => {
    expect(weekEndingOn(reports, 7)?.week).toBe(1);
    expect(weekEndingOn(reports, 14)?.week).toBe(2);
    expect(weekEndingOn(reports, 6)).toBeNull();
    expect(weekEndingOn(reports, 21)).toBeNull();
    expect(weeklySummaries([])).toEqual([]);
  });
});
