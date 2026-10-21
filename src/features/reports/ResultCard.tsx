import { Copy, Gauge, Heart, Share2, ShoppingCart, Users } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/Button';
import { CafeScene } from '../../components/CafeScene';
import { Money } from '../../components/Money';
import { EVENTS } from '../../game/data/events';
import { percentPoints, reputationPoints, weekdayName } from '../../game/demand';
import { formatRM } from '../../game/money';
import { shareText } from '../../game/reports';
import type { DayReport } from '../../game/types';
import { renderShareImage } from './shareImage';

type ShareState = { status: 'idle' } | { status: 'working' } | { status: 'done'; message: string } | { status: 'error'; message: string };

/** Shareable end-of-day result card. */
export function ResultCard({ report }: { report: DayReport }) {
  const [share, setShare] = useState<ShareState>({ status: 'idle' });
  const repDelta = Math.round((report.reputationAfter - report.reputationBefore) * 10) / 10;

  const onShare = async () => {
    setShare({ status: 'working' });
    try {
      const blob = await renderShareImage(report);
      const fileName = `cafe-empire-hari-${report.day}.png`;
      const file = typeof File !== 'undefined' ? new File([blob], fileName, { type: 'image/png' }) : null;
      const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
      if (file && nav.share && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: `${report.cafeName} — Hari ${report.day}`, text: shareText(report, formatRM) });
        setShare({ status: 'done', message: 'Kad keputusan dikongsi.' });
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
      setShare({ status: 'done', message: 'Imej kad keputusan dimuat turun.' });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setShare({ status: 'idle' });
        return;
      }
      setShare({ status: 'error', message: 'Gagal berkongsi. Cuba salin teks sebagai ganti.' });
    }
  };

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareText(report, formatRM));
      setShare({ status: 'done', message: 'Ringkasan disalin ke papan klip.' });
    } catch {
      setShare({ status: 'error', message: 'Papan klip tidak tersedia pada pelayar ini.' });
    }
  };

  return (
    <section aria-label={`Kad keputusan Hari ${report.day}`} className="overflow-hidden rounded-3xl bg-cream-50 shadow-lift">
      <div className="relative h-36 overflow-hidden bg-espresso-800">
        <CafeScene evening className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-espresso-900/95 via-espresso-900/60 to-transparent" aria-hidden="true" />
        <div className="relative flex h-full flex-col justify-end p-4 text-white">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cream-200">Laporan akhir hari</p>
          <p className="font-display text-2xl leading-tight">{report.cafeName}</p>
          <p className="text-sm text-cream-100">
            Hari {report.day} · {weekdayName(report.day)}
          </p>
        </div>
      </div>
      <div className="p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-espresso-600">Untung bersih</p>
        <p className="mt-0.5 text-4xl font-bold">
          <Money sen={report.netProfitSen} signed colored tabular={false} />
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-cream-100 p-2.5">
            <dt className="flex items-center gap-1 text-[11px] font-semibold uppercase text-espresso-600">
              <ShoppingCart className="size-3" aria-hidden="true" /> Hasil jualan
            </dt>
            <dd className="mt-0.5 text-lg font-semibold">
              <Money sen={report.revenueSen} tabular={false} />
            </dd>
          </div>
          <div className="rounded-xl bg-cream-100 p-2.5">
            <dt className="flex items-center gap-1 text-[11px] font-semibold uppercase text-espresso-600">
              <Users className="size-3" aria-hidden="true" /> Dilayan
            </dt>
            <dd className="mt-0.5 text-lg font-semibold">{report.customers.served} pelanggan</dd>
          </div>
          <div className="rounded-xl bg-cream-100 p-2.5">
            <dt className="flex items-center gap-1 text-[11px] font-semibold uppercase text-espresso-600">
              <Gauge className="size-3" aria-hidden="true" /> Kadar servis
            </dt>
            <dd className="mt-0.5 text-lg font-semibold">{percentPoints(report.customers.serviceRate)}%</dd>
          </div>
          <div className="rounded-xl bg-cream-100 p-2.5">
            <dt className="flex items-center gap-1 text-[11px] font-semibold uppercase text-espresso-600">
              <Heart className="size-3" aria-hidden="true" /> Reputasi
            </dt>
            <dd className="mt-0.5 text-lg font-semibold">
              {reputationPoints(report.reputationAfter)}{' '}
              <span className={`text-sm ${repDelta >= 0 ? 'text-sage-700' : 'text-rust-700'}`}>
                ({repDelta >= 0 ? '+' : '−'}
                {Math.abs(repDelta)})
              </span>
            </dd>
          </div>
        </dl>
        {report.eventId ? <p className="mt-3 text-sm text-espresso-700">Peristiwa: {EVENTS[report.eventId].title}</p> : null}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            onClick={onShare}
            loading={share.status === 'working'}
            icon={<Share2 className="size-4" aria-hidden="true" />}
          >
            {share.status === 'working' ? 'Menjana…' : 'Kongsi kad'}
          </Button>
          <Button variant="secondary" onClick={onCopy} icon={<Copy className="size-4" aria-hidden="true" />}>
            Salin teks
          </Button>
        </div>
        <p aria-live="polite" className={`mt-2 min-h-5 text-sm ${share.status === 'error' ? 'text-rust-700' : 'text-sage-700'}`}>
          {share.status === 'done' || share.status === 'error' ? share.message : ''}
        </p>
        <p className="text-xs text-espresso-600">Data simulasi permainan — bukan data perniagaan sebenar.</p>
      </div>
    </section>
  );
}
