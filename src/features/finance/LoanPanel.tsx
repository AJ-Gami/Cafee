import { Landmark, Lock } from 'lucide-react';
import { useState } from 'react';
import { useGame } from '../../app/GameProvider';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card, CardTitle, Row } from '../../components/Card';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Money } from '../../components/Money';
import { Notice } from '../../components/Notice';
import { ProgressBar } from '../../components/ProgressBar';
import { activeLoanView, loanOfferViews, type LoanOfferView } from '../../game/selectors';
import type { ActiveLoan } from '../../game/types';

function ratePercent(bps: number): string {
  return `${(bps / 100).toLocaleString('ms-MY', { maximumFractionDigits: 2 })}%`;
}

export function LoanPanel() {
  const { game, dispatch } = useGame();
  const offers = loanOfferViews(game);
  const active = activeLoanView(game);
  const locked = game.phase !== 'prep' || game.status !== 'active';
  const [offerTarget, setOfferTarget] = useState<LoanOfferView | null>(null);
  // Tied to the loan it was opened for, so a loan replaced meanwhile (e.g. by another tab) closes it.
  const [repayTarget, setRepayTarget] = useState<ActiveLoan | null>(null);

  return (
    <div className="space-y-3">
      <p className="px-1 text-sm text-espresso-600">
        Pinjaman memberi tunai serta-merta. Mulai esok, satu ansuran (pokok + faedah) ditolak setiap kali kafe ditutup. Hanya faedah dikira sebagai
        perbelanjaan; bayaran pokok ialah pembiayaan.
      </p>
      {locked && game.status === 'active' ? (
        <Notice tone="info" title="Kafe sudah ditutup untuk hari ini">
          Pinjaman boleh diambil atau dilunaskan semasa persediaan hari seterusnya.
        </Notice>
      ) : null}

      {active ? (
        <Card className="border-caramel-200">
          <CardTitle title={active.name} subtitle="Pinjaman aktif" icon={<Landmark className="size-5" />} />
          <ProgressBar
            value={active.loan.principalRepaidSen}
            max={active.loan.principalSen}
            tone="caramel"
            label="Pokok pinjaman telah dibayar"
          />
          <dl className="mt-2 divide-y divide-espresso-800/[0.07]">
            <Row label="Jumlah pinjaman" value={<Money sen={active.loan.principalSen} />} />
            <Row label="Baki pokok" value={<Money sen={active.remainingPrincipalSen} />} strong />
            <Row label="Baki faedah (ikut jadual)" value={<Money sen={active.remainingInterestSen} />} />
            <Row label="Ansuran dibayar" value={`${active.loan.paymentsMade}/${active.loan.termDays}`} />
            <Row
              label={
                active.nextChargedToday
                  ? 'Ansuran semasa tutup hari ini'
                  : active.loan.paymentsMade === 0
                    ? 'Ansuran pertama (esok)'
                    : 'Ansuran seterusnya (esok)'
              }
              value={<Money sen={active.nextInstallment.totalSen} />}
            />
          </dl>
          <div className="mt-3 rounded-xl bg-cream-100 p-3 text-sm text-espresso-700">
            {active.settlement.cancellation ? (
              <p>Pinjaman diambil hari ini — anda boleh membatalkannya tanpa faedah dengan memulangkan <Money sen={active.settlement.principalSen} />.</p>
            ) : (
              <p>
                {active.actionTomorrow ? 'Lunaskan awal esok' : 'Lunaskan awal'}: baki pokok <Money sen={active.settlement.principalSen} /> + faedah
                satu hari <Money sen={active.settlement.interestSen} />. Faedah selebihnya dikecualikan.
              </p>
            )}
          </div>
          <Button
            className="mt-3"
            block
            variant="secondary"
            disabled={locked || !active.canSettle}
            onClick={() => setRepayTarget(game.loan)}
          >
            {!active.canSettle ? (
              'Tunai tak cukup untuk melunaskan'
            ) : (
              <>
                {active.settlement.cancellation ? 'Batalkan pinjaman' : active.actionTomorrow ? 'Lunaskan esok' : 'Lunaskan sekarang'} (
                <Money sen={active.settlement.totalSen} />)
              </>
            )}
          </Button>
        </Card>
      ) : null}

      <h2 className="px-1 pt-1 font-display text-lg text-espresso-800">Tawaran bank</h2>
      {active ? <p className="px-1 text-sm text-espresso-600">Satu pinjaman pada satu masa. Lunaskan pinjaman semasa untuk memohon yang lain.</p> : null}
      {offers.map((o) => (
        <Card key={o.id}>
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-display text-lg leading-tight">{o.name}</h3>
            {o.locked ? (
              <Badge icon={<Lock className="size-3" aria-hidden="true" />}>Tahap {o.minLevel}</Badge>
            ) : null}
          </div>
          <p className="mt-0.5 text-sm text-espresso-600">{o.description}</p>
          <dl className="mt-2 divide-y divide-espresso-800/[0.07]">
            <Row label="Jumlah pinjaman" value={<Money sen={o.principalSen} />} strong />
            <Row label="Tempoh" value={`${o.termDays} hari`} />
            <Row label={`Faedah rata ${ratePercent(o.flatRateBps)}`} value={<Money sen={o.totalInterestSen} />} />
            <Row label="Ansuran harian" value={<Money sen={o.dailyInstallmentSen} />} />
            <Row label="Jumlah bayaran balik" value={<Money sen={o.totalRepaySen} />} muted />
          </dl>
          <Button
            className="mt-3"
            block
            variant="primary"
            disabled={locked || o.locked || active !== null}
            onClick={() => setOfferTarget(o)}
          >
            {o.locked ? `Buka di Tahap ${o.minLevel}` : 'Mohon pinjaman'}
          </Button>
        </Card>
      ))}
      <p className="px-2 text-center text-xs text-espresso-600">Tawaran pinjaman ini rekaan untuk permainan, bukan terma pembiayaan sebenar.</p>

      <ConfirmDialog
        open={offerTarget !== null}
        title={`Ambil ${offerTarget?.name ?? 'pinjaman'}?`}
        confirmLabel="Ambil pinjaman"
        tone="accent"
        onCancel={() => setOfferTarget(null)}
        onConfirm={() => {
          if (offerTarget) dispatch({ type: 'TAKE_LOAN', offerId: offerTarget.id });
          setOfferTarget(null);
        }}
      >
        {offerTarget ? (
          <>
            <p>
              <Money sen={offerTarget.principalSen} /> dimasukkan ke tunai anda serta-merta. Mulai esok, kira-kira{' '}
              <Money sen={offerTarget.dailyInstallmentSen} /> ditolak setiap kali kafe ditutup selama {offerTarget.termDays} hari (jumlah{' '}
              <Money sen={offerTarget.totalRepaySen} />
              ).
            </p>
            <p className="mt-2 text-sm text-espresso-600">
              Ansuran tetap dicaj walaupun tunai tidak cukup. Tunai negatif selama 3 hari berturut-turut menyebabkan kafe muflis.
            </p>
          </>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={active !== null && repayTarget === active.loan}
        title={active?.settlement.cancellation ? 'Batalkan pinjaman?' : 'Lunaskan pinjaman sekarang?'}
        confirmLabel={active?.settlement.cancellation ? 'Batalkan pinjaman' : 'Lunaskan'}
        onCancel={() => setRepayTarget(null)}
        onConfirm={() => {
          dispatch({ type: 'REPAY_LOAN' });
          setRepayTarget(null);
        }}
      >
        {active ? (
          <p>
            <Money sen={active.settlement.totalSen} /> akan ditolak daripada tunai anda serta-merta. Baki tunai semasa: <Money sen={game.cashSen} />.
          </p>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
