import { ArrowDownToLine, ArrowUpFromLine, FolderSync, History } from 'lucide-react';
import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useGame } from '../../app/GameProvider';
import { Button } from '../../components/Button';
import { Card, CardTitle } from '../../components/Card';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Money } from '../../components/Money';
import { exportFileName, exportSave, MAX_IMPORT_BYTES, parseImportedSave } from '../../game/save';
import type { GameState } from '../../game/types';

type Status = { kind: 'idle' } | { kind: 'reading' } | { kind: 'exported'; fileName: string } | { kind: 'error'; message: string };

/** Export the save to a file, or import one, to back up or move a game between browsers and devices. */
export function BackupCard() {
  const { game, importGame, readBackupSave } = useGame();
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [pending, setPending] = useState<{ game: GameState; migratedFrom: number | null; source: 'file' | 'backup' } | null>(null);
  // A loadable copy in the backup key that differs from the current game can be restored.
  const backup = useMemo(() => {
    const saved = readBackupSave();
    return saved && JSON.stringify(saved.game) !== JSON.stringify(game) ? saved : null;
  }, [readBackupSave, game]);

  const onExport = () => {
    try {
      const fileName = exportFileName(game);
      const url = URL.createObjectURL(new Blob([exportSave(game)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
      setStatus({ kind: 'exported', fileName });
    } catch {
      setStatus({ kind: 'error', message: 'Gagal mengeksport simpanan pada pelayar ini.' });
    }
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      setStatus({ kind: 'error', message: 'Fail terlalu besar untuk simpanan Café Empire.' });
      return;
    }
    setStatus({ kind: 'reading' });
    try {
      const result = parseImportedSave(await file.text());
      if (!result.ok) {
        setStatus({ kind: 'error', message: result.error });
        return;
      }
      setStatus({ kind: 'idle' });
      setPending({ game: result.game, migratedFrom: result.migratedFrom, source: 'file' });
    } catch {
      setStatus({ kind: 'error', message: 'Fail tidak dapat dibaca.' });
    }
  };

  return (
    <Card>
      <CardTitle
        title="Sandaran & pindah peranti"
        subtitle="Eksport fail simpanan untuk sandaran, atau import untuk menyambung permainan di pelayar atau peranti lain."
        icon={<FolderSync className="size-5" />}
      />
      <div className="grid grid-cols-1 gap-2">
        <Button variant="secondary" onClick={onExport} icon={<ArrowDownToLine className="size-4" aria-hidden="true" />}>
          Eksport simpanan
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            if (status.kind !== 'reading') fileRef.current?.click();
          }}
          // Not disabled while reading, so keyboard focus stays on the button.
          aria-busy={status.kind === 'reading' || undefined}
          icon={<ArrowUpFromLine className="size-4" aria-hidden="true" />}
        >
          {status.kind === 'reading' ? 'Membaca fail…' : 'Import simpanan'}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-label="Pilih fail simpanan untuk diimport"
          onChange={onFile}
        />
      </div>
      <p
        aria-live="polite"
        role={status.kind === 'error' ? 'alert' : undefined}
        className={`mt-2 min-h-5 text-sm font-semibold ${status.kind === 'error' ? 'text-rust-700' : 'text-sage-700'}`}
      >
        {status.kind === 'exported' ? `Fail ${status.fileName} dimuat turun.` : status.kind === 'error' ? status.message : ''}
      </p>
      <p className="text-xs text-espresso-600">Fail hanya mengandungi data permainan ini dan kekal pada peranti anda kecuali anda berkongsinya.</p>

      {backup ? (
        <div className="mt-3 rounded-xl bg-cream-100 p-3">
          <p className="text-sm font-semibold text-espresso-800">Salinan sandaran dalam pelayar ini</p>
          <p className="mt-0.5 text-sm text-espresso-700">
            {backup.game.cafeName}, Hari {backup.game.day} · tunai <Money sen={backup.game.cashSen} />
          </p>
          <p className="mt-1 text-xs text-espresso-600">Disimpan secara automatik apabila simpanan tidak dapat dibaca atau ditimpa oleh tab versi lama.</p>
          <Button
            className="mt-2"
            block
            variant="secondary"
            icon={<History className="size-4" aria-hidden="true" />}
            onClick={() => setPending({ game: backup.game, migratedFrom: backup.migratedFrom, source: 'backup' })}
          >
            Pulihkan salinan sandaran
          </Button>
        </div>
      ) : null}

      <ConfirmDialog
        open={pending !== null}
        title="Gantikan permainan semasa?"
        confirmLabel={pending?.source === 'backup' ? 'Pulihkan & gantikan' : 'Import & gantikan'}
        tone="danger"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending) {
            importGame(
              pending.game,
              pending.source === 'backup' ? `Salinan sandaran dipulihkan: ${pending.game.cafeName}, Hari ${pending.game.day}.` : undefined,
            );
          }
          setPending(null);
        }}
      >
        {pending ? (
          <>
            <p>
              Permainan semasa ({game.cafeName}, Hari {game.day}) akan digantikan dengan simpanan <strong>{pending.game.cafeName}</strong>, Hari{' '}
              {pending.game.day}.
            </p>
            {pending.migratedFrom !== null ? (
              <p className="mt-2 text-sm text-espresso-600">
                {pending.source === 'backup' ? 'Salinan ini' : 'Fail ini'} daripada versi {pending.migratedFrom} dan akan dikemas kini ke format terkini.
              </p>
            ) : null}
            <p className="mt-2 text-sm text-espresso-600">Eksport permainan semasa dahulu jika anda mahu menyimpannya. Tindakan ini tidak boleh dibatalkan.</p>
          </>
        ) : null}
      </ConfirmDialog>
    </Card>
  );
}
