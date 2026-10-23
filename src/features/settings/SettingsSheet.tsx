import { BookOpen, HardDrive, Pencil, RotateCcw, Save, ShieldCheck } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useGame } from '../../app/GameProvider';
import { Button } from '../../components/Button';
import { Card, CardTitle } from '../../components/Card';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Sheet } from '../../components/Modal';
import { Notice } from '../../components/Notice';
import { CAFE_NAME_MAX_LENGTH, SAVE_SCHEMA_VERSION } from '../../game/constants';
import { useTutorialHidden } from '../../app/tutorial';
import { tutorialSteps } from '../../game/tutorial';
import { BackupCard } from './BackupCard';

function formatSavedAt(iso: string | null): string {
  if (!iso) return 'belum disimpan';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'tidak diketahui';
  return d.toLocaleString('ms-MY', { dateStyle: 'medium', timeStyle: 'medium' });
}

/** Bring the getting-started guide back after it was hidden. */
function TutorialSetting({ onShown }: { onShown: () => void }) {
  const { game } = useGame();
  const { hidden, show } = useTutorialHidden(game.seed);
  if (tutorialSteps(game).every((s) => s.done)) {
    return <p className="mt-3 text-sm text-espresso-600">Panduan bermula sudah selesai.</p>;
  }
  if (!hidden) return null;
  return (
    <Button
      className="mt-3"
      block
      variant="secondary"
      onClick={() => {
        show();
        onShown();
      }}
    >
      Tunjuk panduan bermula
    </Button>
  );
}

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { game, dispatch, saveInfo, saveNow, resetGame, storageAvailable } = useGame();
  const nameId = useId();
  const [name, setName] = useState(game.cafeName);
  const [confirmReset, setConfirmReset] = useState(false);

  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (open) setName(game.cafeName);
    if (!open) {
      setConfirmReset(false);
      setSavedFlash(false);
    }
  }, [open, game.cafeName]);

  return (
    <Sheet open={open} onClose={onClose} title="Tetapan">
      <div className="space-y-4">
        <Card>
          <CardTitle title="Nama kafe" icon={<Pencil className="size-5" />} />
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              dispatch({ type: 'RENAME', name });
            }}
          >
            <label htmlFor={nameId} className="sr-only">
              Nama kafe
            </label>
            <input
              id={nameId}
              value={name}
              maxLength={CAFE_NAME_MAX_LENGTH}
              onChange={(e) => setName(e.target.value)}
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-espresso-800/20 bg-white px-3"
            />
            <Button type="submit" disabled={name.trim().length === 0 || name.trim() === game.cafeName}>
              Simpan
            </Button>
          </form>
        </Card>

        <Card>
          <CardTitle title="Simpanan permainan" icon={<HardDrive className="size-5" />} />
          {storageAvailable ? (
            <p className="text-sm text-espresso-700">
              Kemajuan disimpan secara automatik selepas setiap tindakan penting. Simpanan terakhir:{' '}
              <span className="font-semibold">{saveInfo.status === 'saved' ? formatSavedAt(saveInfo.savedAt) : saveInfo.status === 'error' ? 'gagal' : 'menunggu'}</span>.
            </p>
          ) : (
            <Notice tone="warn" title="Storan pelayar tidak tersedia">
              Kemajuan tidak dapat disimpan pada pelayar ini.
            </Notice>
          )}
          {saveInfo.status === 'error' ? (
            <div className="mt-2">
              <Notice tone="bad">{saveInfo.error}</Notice>
            </div>
          ) : null}
          <div className="mt-3 rounded-xl bg-cream-100 p-3 text-sm text-espresso-700">
            <p className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-sage-700" aria-hidden="true" />
              <span>
                Simpanan hanya wujud dalam pelayar ini pada peranti ini (localStorage). Ia <strong>tidak</strong> dihantar ke mana-mana pelayan dan{' '}
                <strong>tidak</strong> disegerakkan ke awan. Mengosongkan data pelayar atau menukar peranti akan memulakan permainan baharu — gunakan eksport di bawah untuk membuat sandaran.
              </span>
            </p>
            <p className="mt-2">Permainan ini tidak mengumpul maklumat peribadi dan tiada pembayaran. Format simpanan: versi {SAVE_SCHEMA_VERSION}.</p>
            <p className="mt-2">Selepas lawatan pertama, permainan boleh dimainkan tanpa internet dan boleh dipasang ke skrin utama melalui menu pelayar.</p>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2">
            <Button
              variant="secondary"
              disabled={!storageAvailable}
              onClick={() => setSavedFlash(saveNow())}
              icon={<Save className="size-4" aria-hidden="true" />}
            >
              Simpan sekarang
            </Button>
            <p aria-live="polite" className="min-h-5 text-center text-sm font-semibold text-sage-700">
              {savedFlash && saveInfo.status === 'saved' ? 'Disimpan dalam pelayar ini.' : ''}
            </p>
            <Button variant="danger" onClick={() => setConfirmReset(true)} icon={<RotateCcw className="size-4" aria-hidden="true" />}>
              Set semula permainan
            </Button>
          </div>
        </Card>

        <BackupCard />

        <Card>
          <CardTitle title="Cara bermain" icon={<BookOpen className="size-5" />} />
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-espresso-700">
            <li>
              <strong>Persediaan:</strong> beli stok di Menu & Stok, semak harga, ambil staf atau naik taraf, dan pilih promosi.
            </li>
            <li>
              <strong>Buka kafe:</strong> pelanggan datang sepanjang 08:00–20:00. Harga, reputasi, stok, kapasiti staf, promosi dan peristiwa menentukan jualan.
            </li>
            <li>
              <strong>Tutup:</strong> gaji, sewa dan utiliti dibayar. Croissant dan susu yang tidak terjual boleh rosak.
            </li>
            <li>
              <strong>Laporan:</strong> semak untung bersih dan aliran tunai, kemudian mulakan hari seterusnya.
            </li>
          </ol>
          <p className="mt-3 text-sm text-espresso-600">
            Jika baki tunai negatif selama 3 hari berturut-turut, kafe akan muflis. Capai objektif untuk naik tahap dan membuka naik taraf baharu.
          </p>
          <TutorialSetting onShown={onClose} />
          <p className="mt-3 text-xs text-espresso-600">
            Semua harga, kos dan peristiwa ialah nilai rekaan untuk keseimbangan permainan — bukan data pasaran, analitik atau nasihat perniagaan sebenar.
          </p>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmReset}
        title="Set semula permainan?"
        confirmLabel="Ya, padam & mula semula"
        tone="danger"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          setConfirmReset(false);
          resetGame();
          onClose();
        }}
      >
        <p>
          Semua kemajuan — Hari {game.day}, tunai, stok, staf, naik taraf, laporan dan objektif — akan dipadam daripada pelayar ini. Tindakan ini tidak boleh
          dibatalkan.
        </p>
      </ConfirmDialog>
    </Sheet>
  );
}
