import { ArrowDownToLine, ArrowUpFromLine, FolderSync, History, Trash2 } from 'lucide-react';
import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useGame } from '../../app/GameProvider';
import { Button } from '../../components/Button';
import { Card, CardTitle } from '../../components/Card';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Money } from '../../components/Money';
import { exportFileName, exportSave, isEarlierStateOf, MAX_IMPORT_BYTES, parseImportedSave } from '../../game/save';
import type { GameState } from '../../game/types';

/** When a copy was set aside, e.g. "22 Okt, 09:15" (null when unknown). */
function savedAtLabel(savedAt: string | null): string | null {
  if (!savedAt) return null;
  const date = new Date(savedAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('ms-MY', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

type Status = { kind: 'idle' } | { kind: 'reading' } | { kind: 'exported'; fileName: string } | { kind: 'error'; message: string };

/** Export the save to a file, or import one, to back up or move a game between browsers and devices. */
export function BackupCard() {
  const { game, importGame, readCopies, discardCopy } = useGame();
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [pending, setPending] = useState<{ game: GameState; migratedFrom: number | null; source: 'file' | 'backup' } | null>(null);
  const [copiesVersion, setCopiesVersion] = useState(0);
  const [discardTarget, setDiscardTarget] = useState<GameState | null>(null);
  // Offer only copies holding play the current game does not: restoring an earlier point of this
  // same game would just roll it back.
  const copies = useMemo(
    () => {
      const all = readCopies().filter((c) => !isEarlierStateOf(c.game, game));
      // A copy that is only an earlier point of another listed copy adds nothing (of two equal
      // copies, the first listed stays).
      return all.filter(
        (c, i) => !all.some((other, j) => j !== i && isEarlierStateOf(c.game, other.game) && (j < i || !isEarlierStateOf(other.game, c.game))),
      );
    },
    // copiesVersion changes after a copy is discarded, to read the list again.
    [readCopies, game, copiesVersion],
  );

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

      {copies.length > 0 ? (
        <section className="mt-3 rounded-xl bg-cream-100 p-3" aria-labelledby="salinan-title">
          <h3 id="salinan-title" className="text-sm font-semibold text-espresso-800">
            Salinan sandaran dalam pelayar ini
          </h3>
          <p className="mt-0.5 text-xs text-espresso-600">
            Disimpan secara automatik apabila simpanan tidak dapat dibaca, atau apabila tab versi lama menyimpan kemajuan yang berbeza.
          </p>
          <ul className="mt-2 space-y-3">
            {copies.map((c, i) => {
              const state = c.game.status !== 'active' ? ' (muflis)' : c.game.phase === 'closed' ? ' (ditutup)' : '';
              const label = `${c.game.cafeName}, Hari ${c.game.day}${state}`;
              return (
                <li key={`${i}-${c.game.seed}-${c.game.day}-${c.game.txSeq}`}>
                  <p className="break-words text-sm text-espresso-700">
                    {label} · tunai <Money sen={c.game.cashSen} />
                    {savedAtLabel(c.savedAt) ? <span className="block text-xs text-espresso-600">Disimpan {savedAtLabel(c.savedAt)}</span> : null}
                  </p>
                  <div className="mt-1.5 grid grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<History className="size-4" aria-hidden="true" />}
                      aria-label={`Pulihkan salinan sandaran: ${label}`}
                      onClick={() => setPending({ game: c.game, migratedFrom: c.migratedFrom, source: 'backup' })}
                    >
                      Pulihkan
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Trash2 className="size-4" aria-hidden="true" />}
                      aria-label={`Buang salinan sandaran: ${label}`}
                      onClick={() => setDiscardTarget(c.game)}
                    >
                      Buang
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <ConfirmDialog
        open={discardTarget !== null}
        title="Buang salinan sandaran ini?"
        confirmLabel="Buang salinan"
        tone="danger"
        onCancel={() => setDiscardTarget(null)}
        onConfirm={() => {
          if (discardTarget) discardCopy(discardTarget);
          setDiscardTarget(null);
          setCopiesVersion((v) => v + 1);
        }}
      >
        {discardTarget ? (
          <p className="break-words">
            Salinan {discardTarget.cafeName}, Hari {discardTarget.day} akan dipadam daripada pelayar ini. Permainan semasa tidak berubah. Tindakan ini
            tidak boleh dibatalkan.
          </p>
        ) : null}
      </ConfirmDialog>

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
            <p className="break-words">
              Permainan semasa ({game.cafeName}, Hari {game.day}, tunai <Money sen={game.cashSen} />) akan digantikan dengan simpanan{' '}
              <strong>{pending.game.cafeName}</strong>, Hari {pending.game.day}, tunai <Money sen={pending.game.cashSen} />.
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
