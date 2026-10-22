import { Copy, Share2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/Button';

type ShareState = { status: 'idle' } | { status: 'working' } | { status: 'done'; message: string } | { status: 'error'; message: string };

/**
 * "Share card" and "copy text" buttons for a result card. Shares the PNG through the system share
 * sheet where files can be shared, otherwise downloads it. `label` (e.g. "mingguan") is added to
 * the buttons' accessible names when one screen shows more than one card.
 */
export function ShareActions({
  render,
  fileName,
  title,
  text,
  cardName,
  label,
}: {
  render: () => Promise<Blob>;
  fileName: string;
  title: string;
  text: () => string;
  /** How messages name the card, e.g. "Kad keputusan". */
  cardName: string;
  label?: string;
}) {
  const [share, setShare] = useState<ShareState>({ status: 'idle' });

  const onShare = async () => {
    setShare({ status: 'working' });
    try {
      const blob = await render();
      const file = typeof File !== 'undefined' ? new File([blob], fileName, { type: 'image/png' }) : null;
      const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
      if (file && nav.share && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title, text: text() });
        setShare({ status: 'done', message: `${cardName} dikongsi.` });
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
      setShare({ status: 'done', message: `Imej ${cardName.toLowerCase()} dimuat turun.` });
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
      await navigator.clipboard.writeText(text());
      setShare({ status: 'done', message: 'Ringkasan disalin ke papan klip.' });
    } catch {
      setShare({ status: 'error', message: 'Papan klip tidak tersedia pada pelayar ini.' });
    }
  };

  return (
    <>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button
          variant="secondary"
          onClick={onShare}
          loading={share.status === 'working'}
          aria-label={label && share.status !== 'working' ? `Kongsi kad ${label}` : undefined}
          icon={<Share2 className="size-4" aria-hidden="true" />}
        >
          {share.status === 'working' ? 'Menjana…' : 'Kongsi kad'}
        </Button>
        <Button variant="secondary" onClick={onCopy} aria-label={label ? `Salin teks ${label}` : undefined} icon={<Copy className="size-4" aria-hidden="true" />}>
          Salin teks
        </Button>
      </div>
      <p aria-live="polite" className={`mt-2 min-h-5 text-sm ${share.status === 'error' ? 'text-rust-700' : 'text-sage-700'}`}>
        {share.status === 'done' || share.status === 'error' ? share.message : ''}
      </p>
    </>
  );
}
