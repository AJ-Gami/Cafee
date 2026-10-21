import { BANKRUPTCY_NEGATIVE_DAYS } from '../game/constants';
import { Notice } from '../components/Notice';
import { useGame } from './GameProvider';

export function GlobalNotices({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { bootNotice, dismissBootNotice, storageAvailable, saveInfo, game } = useGame();
  const streak = game.stats.negativeCashStreak;
  return (
    <>
      {!storageAvailable ? (
        <Notice tone="warn" title="Simpanan tidak tersedia" role="status">
          Pelayar ini menyekat storan setempat (contohnya mod peribadi). Anda boleh bermain, tetapi kemajuan akan hilang apabila halaman ditutup.
        </Notice>
      ) : null}
      {saveInfo.status === 'error' ? (
        <Notice tone="bad" title="Gagal menyimpan" role="alert">
          {saveInfo.error}
        </Notice>
      ) : null}
      {bootNotice ? (
        <Notice
          tone={bootNotice.kind === 'corrupt' ? 'warn' : bootNotice.kind === 'migrated' ? 'info' : 'good'}
          title={bootNotice.kind === 'corrupt' ? 'Simpanan rosak dipulihkan' : undefined}
          onDismiss={dismissBootNotice}
          role="status"
          action={
            bootNotice.kind === 'corrupt' ? (
              <button type="button" onClick={onOpenSettings} className="min-h-11 font-semibold underline underline-offset-2">
                Tetapan simpanan
              </button>
            ) : undefined
          }
        >
          {bootNotice.message}
        </Notice>
      ) : null}
      {game.status === 'active' && streak > 0 ? (
        <Notice tone="bad" title="Amaran tunai negatif" role="alert">
          Baki tunai negatif selama {streak} hari berturut-turut. Kafe akan muflis jika tunai masih negatif selepas{' '}
          {BANKRUPTCY_NEGATIVE_DAYS - streak} hari lagi. Kurangkan kos atau tingkatkan jualan.
        </Notice>
      ) : null}
    </>
  );
}
