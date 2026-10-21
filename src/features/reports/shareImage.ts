import { EVENTS } from '../../game/data/events';
import { weekdayName } from '../../game/demand';
import { formatRM } from '../../game/money';
import type { DayReport } from '../../game/types';

const W = 1080;
const H = 1350;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

/** Draws the end-of-day result card to a PNG. Contains only simulated game data. */
export async function renderShareImage(report: DayReport): Promise<Blob> {
  if (typeof document === 'undefined') throw new Error('Tiada dokumen');
  try {
    await document.fonts?.load('600 64px Fraunces');
  } catch {
    // Fall back to the serif stack.
  }
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Kanvas tidak disokong');

  const display = "600 {size}px Fraunces, Georgia, 'Times New Roman', serif";
  const sans = "{weight} {size}px system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
  const font = (tpl: string, size: number, weight = 600) => tpl.replace('{size}', String(size)).replace('{weight}', String(weight));

  // Background
  ctx.fillStyle = '#f7f0e6';
  ctx.fillRect(0, 0, W, H);

  // Header band
  const grad = ctx.createLinearGradient(0, 0, 0, 470);
  grad.addColorStop(0, '#50392b');
  grad.addColorStop(1, '#241914');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, 470);
  ctx.fillStyle = 'rgba(255, 217, 160, 0.18)';
  ctx.beginPath();
  ctx.ellipse(W - 180, 40, 360, 260, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ecd3b6';
  ctx.font = font(sans, 30, 700);
  ctx.fillText('REAL LIFE TYCOON · CAFÉ EMPIRE', 80, 120);
  ctx.fillStyle = '#ffffff';
  ctx.font = font(display, 92);
  ctx.fillText(fitText(ctx, report.cafeName, W - 160), 80, 240);
  ctx.fillStyle = '#efe4d3';
  ctx.font = font(sans, 40, 500);
  ctx.fillText(`Laporan Hari ${report.day} · ${weekdayName(report.day)}`, 80, 310);

  // Net profit panel
  roundRect(ctx, 60, 380, W - 120, 270, 40);
  ctx.fillStyle = '#fdfaf5';
  ctx.shadowColor = 'rgba(59, 42, 32, 0.25)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 12;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#6b4e3b';
  ctx.font = font(sans, 34, 700);
  ctx.fillText('UNTUNG BERSIH', 110, 460);
  ctx.fillStyle = report.netProfitSen >= 0 ? '#2f4635' : '#8c3526';
  ctx.font = font(sans, 112, 700);
  ctx.fillText(formatRM(report.netProfitSen, { signed: true }), 106, 590);

  // Metrics grid
  const metrics: [string, string][] = [
    ['Hasil jualan', formatRM(report.revenueSen)],
    ['Pelanggan dilayan', String(report.customers.served)],
    ['Kadar servis', `${Math.round(report.customers.serviceRate * 100)}%`],
    ['Reputasi', `${Math.round(report.reputationAfter)}/100`],
  ];
  metrics.forEach(([label, value], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 60 + col * ((W - 120) / 2 + 10);
    const y = 700 + row * 200;
    roundRect(ctx, x, y, (W - 120) / 2 - 10, 180, 32);
    ctx.fillStyle = '#efe4d3';
    ctx.fill();
    ctx.fillStyle = '#6b4e3b';
    ctx.font = font(sans, 30, 600);
    ctx.fillText(label, x + 36, y + 64);
    ctx.fillStyle = '#3b2a20';
    ctx.font = font(sans, 60, 700);
    ctx.fillText(fitText(ctx, value, (W - 120) / 2 - 80), x + 36, y + 140);
  });

  // Event line
  ctx.fillStyle = '#50392b';
  ctx.font = font(sans, 32, 500);
  const eventText = report.eventId ? `Peristiwa: ${EVENTS[report.eventId].title}` : 'Hari yang tenang tanpa peristiwa khas';
  ctx.fillText(fitText(ctx, eventText, W - 160), 80, 1160);

  // Footer
  ctx.fillStyle = '#7f6250';
  ctx.font = font(sans, 28, 500);
  ctx.fillText('Data simulasi permainan — bukan data perniagaan sebenar.', 80, 1270);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Gagal menjana imej'))), 'image/png');
  });
}
