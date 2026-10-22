import { ChartColumn, ChevronRight, Receipt, Table, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useGame } from '../../app/GameProvider';
import { useNav } from '../../app/navigation';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card, CardTitle, Row, ScreenTitle } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { Sheet } from '../../components/Modal';
import { Money } from '../../components/Money';
import { Segmented, tabPanelProps } from '../../components/Segmented';
import { Stat } from '../../components/Stat';
import { HISTORY_LIMIT } from '../../game/constants';
import { weekdayName } from '../../game/demand';
import { remainingPrincipal } from '../../game/loans';
import { historySeries, servedTotal, weekEndingOn, weeklySummaries } from '../../game/reports';
import { currentInventoryValue, lastReport, reportForDay } from '../../game/selectors';
import { DayReportView, TransactionList } from '../reports/DayReportView';
import { WeekSummaryCard, weekStatusLabel } from '../reports/WeekSummary';
import { CashChart, RevenueProfitChart } from './LazyCharts';
import { LoanPanel } from './LoanPanel';

type FinanceTab = 'ringkasan' | 'laporan' | 'lejar' | 'pinjaman';

export function FinanceScreen() {
  const { sub, setSub } = useNav();
  const tab: FinanceTab = sub === 'laporan' || sub === 'lejar' || sub === 'pinjaman' ? sub : 'ringkasan';
  return (
    <div className="space-y-4">
      <ScreenTitle title="Kewangan & laporan" subtitle="Semua angka ialah data simulasi permainan." />
      <Segmented<FinanceTab>
        id="kewangan-tabs"
        label="Bahagian kewangan"
        value={tab}
        onChange={setSub}
        options={[
          { id: 'ringkasan', label: 'Ringkasan' },
          { id: 'laporan', label: 'Laporan' },
          { id: 'lejar', label: 'Lejar' },
          { id: 'pinjaman', label: 'Pinjaman' },
        ]}
      />
      <div {...tabPanelProps('kewangan-tabs', tab)}>
        {tab === 'ringkasan' && <SummaryPanel />}
        {tab === 'laporan' && <ReportsPanel />}
        {tab === 'lejar' && <LedgerPanel />}
        {tab === 'pinjaman' && <LoanPanel />}
      </div>
    </div>
  );
}

function SummaryPanel() {
  const { game } = useGame();
  const { go } = useNav();
  const [showTable, setShowTable] = useState(false);
  const series = useMemo(() => historySeries(game.history, 14), [game.history]);
  const last = lastReport(game);
  const s = game.stats;

  return (
    <div className="space-y-3">
      <Stat
        emphasis
        label="Baki tunai"
        icon={<Wallet className="size-3.5" aria-hidden="true" />}
        value={<Money sen={game.cashSen} tabular={false} className={game.cashSen < 0 ? 'text-rust-700' : ''} />}
      />
      <Card>
        <dl className="divide-y divide-espresso-800/[0.07]">
          <Row label="Nilai inventori" value={<Money sen={currentInventoryValue(game)} />} />
          {game.loan ? <Row label="Baki pokok pinjaman" value={<Money sen={-remainingPrincipal(game.loan)} />} /> : null}
          <Row label={`Jumlah hasil (${s.daysCompleted} hari)`} value={<Money sen={s.totalRevenueSen} />} />
          <Row label={`Jumlah untung bersih (${s.profitableDays} hari untung)`} value={<Money sen={s.totalNetProfitSen} colored />} strong />
        </dl>
      </Card>

      {series.length === 0 ? (
        <EmptyState
          icon={<ChartColumn className="size-6" />}
          title="Belum ada laporan"
          action={
            <Button size="sm" onClick={() => go('operasi')}>
              Ke Operasi
            </Button>
          }
        >
          Buka kafe untuk hari pertama dan carta kewangan akan muncul di sini.
        </EmptyState>
      ) : (
        <>
          <Card>
            <CardTitle title="Hasil & untung bersih" subtitle={`${series.length} hari terakhir`} icon={<ChartColumn className="size-5" />} />
            <RevenueProfitChart data={series} />
            <Button
              size="sm"
              variant="ghost"
              className="mt-2"
              aria-expanded={showTable}
              onClick={() => setShowTable((v) => !v)}
              icon={<Table className="size-4" aria-hidden="true" />}
            >
              {showTable ? 'Sembunyikan jadual' : 'Lihat sebagai jadual'}
            </Button>
            {showTable ? (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">Hasil jualan, untung bersih dan baki tunai mengikut hari</caption>
                  <thead>
                    <tr className="text-left text-xs uppercase text-espresso-600">
                      <th scope="col" className="py-1.5 pr-2 font-semibold">Hari</th>
                      <th scope="col" className="py-1.5 pr-2 text-right font-semibold">Hasil</th>
                      <th scope="col" className="py-1.5 pr-2 text-right font-semibold">Untung</th>
                      <th scope="col" className="py-1.5 text-right font-semibold">Tunai</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-espresso-800/[0.07]">
                    {series.map((p) => (
                      <tr key={p.day}>
                        <th scope="row" className="py-1.5 pr-2 text-left font-semibold">
                          {p.day}
                        </th>
                        <td className="py-1.5 pr-2 text-right">
                          <Money sen={p.revenueSen} />
                        </td>
                        <td className="py-1.5 pr-2 text-right">
                          <Money sen={p.netProfitSen} colored />
                        </td>
                        <td className="py-1.5 text-right">
                          <Money sen={p.closingCashSen} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </Card>

          <Card>
            <CardTitle title="Baki tunai akhir hari" icon={<Wallet className="size-5" />} />
            <CashChart data={series} />
          </Card>

          {last ? (
            <Card>
              <CardTitle title={`Perbelanjaan Hari ${last.day}`} subtitle="Pecahan kos operasi" icon={<Receipt className="size-5" />} />
              <ExpenseBars report={last} />
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}

function ExpenseBars({ report }: { report: NonNullable<ReturnType<typeof lastReport>> }) {
  const e = report.expenses;
  const rows = [
    { label: 'Kos barang dijual', sen: report.cogsSen },
    { label: 'Gaji', sen: e.wagesSen },
    { label: 'Sewa', sen: e.rentSen },
    { label: 'Utiliti', sen: e.utilitiesSen },
    { label: 'Pemasaran', sen: e.marketingSen },
    ...(e.depreciationSen > 0 ? [{ label: 'Susut nilai', sen: e.depreciationSen }] : []),
    { label: 'Lain-lain', sen: e.otherSen },
  ];
  const max = Math.max(1, ...rows.map((r) => r.sen));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex justify-between text-sm">
            <span className="text-espresso-700">{r.label}</span>
            <Money sen={r.sen} className="font-semibold" />
          </div>
          <div className="mt-1 h-2 w-full rounded-full bg-cream-200" aria-hidden="true">
            <div className="h-full rounded-full bg-espresso-500" style={{ width: `${(r.sen / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

type ReportKind = 'harian' | 'mingguan';

function ReportsPanel() {
  const { game } = useGame();
  const { go } = useNav();
  const [kind, setKind] = useState<ReportKind>('harian');

  if (game.history.length === 0) {
    return (
      <EmptyState
        icon={<Receipt className="size-6" />}
        title="Belum ada laporan harian"
        action={
          <Button size="sm" onClick={() => go('operasi')}>
            Ke Operasi
          </Button>
        }
      >
        Laporan dijana secara automatik setiap kali kafe ditutup.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-3">
      <Segmented<ReportKind>
        id="laporan-jenis"
        label="Jenis laporan"
        value={kind}
        onChange={setKind}
        options={[
          { id: 'harian', label: 'Harian' },
          { id: 'mingguan', label: 'Mingguan' },
        ]}
      />
      <div {...tabPanelProps('laporan-jenis', kind)}>{kind === 'harian' ? <DailyReportList /> : <WeeklyReportList />}</div>
    </div>
  );
}

function DailyReportList() {
  const { game } = useGame();
  const [openDay, setOpenDay] = useState<number | null>(null);
  const report = openDay !== null ? reportForDay(game, openDay) : null;
  const reports = [...game.history].reverse();

  return (
    <div className="space-y-2">
      <p className="px-1 text-sm text-espresso-600">Ketik laporan untuk melihat butiran penuh. {HISTORY_LIMIT} laporan terkini disimpan.</p>
      <ul className="space-y-2">
        {reports.map((r) => (
          <li key={r.day}>
            <button
              type="button"
              onClick={() => setOpenDay(r.day)}
              className="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-espresso-800/[0.07] bg-cream-50 p-3 text-left shadow-card hover:bg-cream-100"
            >
              <span className="inline-flex size-11 shrink-0 flex-col items-center justify-center rounded-xl bg-cream-200 leading-none">
                <span className="text-[10px] font-semibold uppercase text-espresso-600">Hari</span>
                <span className="font-semibold">{r.day}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="font-semibold">{weekdayName(r.day)}</span>
                  {r.eventId ? <Badge tone="info">Peristiwa</Badge> : null}
                </span>
                <span className="block text-sm text-espresso-600">
                  Jualan <Money sen={r.revenueSen} /> · {servedTotal(r)} pelanggan
                </span>
              </span>
              <span className="text-right">
                <Money sen={r.netProfitSen} colored signed className="font-semibold" />
              </span>
              <ChevronRight className="size-4 shrink-0 text-espresso-500" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <Sheet open={report !== null} onClose={() => setOpenDay(null)} title={report ? `Laporan Hari ${report.day}` : 'Laporan'}>
        {report ? <DayReportView report={report} week={weekEndingOn(game.history, report.day)} /> : null}
      </Sheet>
    </div>
  );
}

function WeeklyReportList() {
  const { game } = useGame();
  const active = game.status === 'active';
  const weeks = useMemo(() => [...weeklySummaries(game.history, active)].reverse(), [game.history, active]);
  const [openWeek, setOpenWeek] = useState<number | null>(null);
  const summary = weeks.find((w) => w.week === openWeek) ?? null;

  return (
    <div className="space-y-2">
      <p className="px-1 text-sm text-espresso-600">Setiap minggu bermula hari Isnin. Jumlah dikira daripada laporan harian yang disimpan.</p>
      <ul className="space-y-2">
        {weeks.map((w) => {
          const status = weekStatusLabel(w, 'short');
          return (
            <li key={w.week}>
              <button
                type="button"
                onClick={() => setOpenWeek(w.week)}
                className="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-espresso-800/[0.07] bg-cream-50 p-3 text-left shadow-card hover:bg-cream-100"
              >
                <span className="inline-flex size-11 shrink-0 flex-col items-center justify-center rounded-xl bg-cream-200 leading-none">
                  <span className="text-[10px] font-semibold uppercase text-espresso-600">Mgg</span>
                  <span className="font-semibold">{w.week}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2">
                    <span className="font-semibold">
                      Hari {w.firstDay}–{w.lastDay}
                    </span>
                    {status ? <Badge tone="warn">{status}</Badge> : null}
                  </span>
                  <span className="block text-sm text-espresso-600">
                    Jualan <Money sen={w.revenueSen} /> · {w.served} pelanggan
                    {w.goalsSet > 0 ? ` · sasaran ${w.goalsMet}/${w.goalsSet}` : ''}
                  </span>
                </span>
                <span className="text-right">
                  <Money sen={w.netProfitSen} colored signed className="font-semibold" />
                </span>
                <ChevronRight className="size-4 shrink-0 text-espresso-500" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
      <Sheet open={summary !== null} onClose={() => setOpenWeek(null)} title={summary ? `Ringkasan Minggu ${summary.week}` : 'Ringkasan mingguan'}>
        {summary ? <WeekSummaryCard summary={summary} /> : null}
      </Sheet>
    </div>
  );
}

function LedgerPanel() {
  const { game } = useGame();
  const last = lastReport(game);
  const todaysTx = game.dayTransactions;
  return (
    <div className="space-y-3">
      {game.phase === 'prep' ? (
        <Card>
          <CardTitle title={`Hari ${game.day} (belum ditutup)`} subtitle="Transaksi persediaan hari ini" icon={<Receipt className="size-5" />} />
          {todaysTx.length > 0 ? (
            <>
              <TransactionList transactions={todaysTx} />
              <dl className="mt-2 border-t border-espresso-800/10 pt-1">
                <Row label="Tunai awal hari" value={<Money sen={game.dayStart.cashSen} />} muted />
                <Row label="Baki tunai semasa" value={<Money sen={game.cashSen} />} strong />
              </dl>
            </>
          ) : (
            <p className="text-sm text-espresso-600">Tiada transaksi lagi hari ini. Belian stok, pengambilan staf dan naik taraf akan muncul di sini.</p>
          )}
        </Card>
      ) : null}
      {last ? (
        <Card>
          <CardTitle title={`Hari ${last.day} (ditutup)`} subtitle={`${last.transactions.length} transaksi`} icon={<Receipt className="size-5" />} />
          <TransactionList transactions={last.transactions} />
          <dl className="mt-2 border-t border-espresso-800/10 pt-1">
            <Row label="Tunai awal" value={<Money sen={last.openingCashSen} />} muted />
            <Row label="Tunai akhir" value={<Money sen={last.closingCashSen} />} strong />
          </dl>
        </Card>
      ) : (
        <EmptyState icon={<Receipt className="size-6" />} title="Lejar kosong">
          Transaksi jualan dan perbelanjaan akan direkodkan apabila kafe ditutup.
        </EmptyState>
      )}
    </div>
  );
}
