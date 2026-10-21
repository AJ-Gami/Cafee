import { Gauge, UserMinus, UserPlus, Users } from 'lucide-react';
import { useState } from 'react';
import { useGame } from '../../app/GameProvider';
import { useNav } from '../../app/navigation';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card, CardTitle } from '../../components/Card';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { Money } from '../../components/Money';
import { STAFF_ROLES } from '../../game/data/staff';
import { capacityAfterHire, capacityView, dayEstimate, fixedCostsView, hiringCandidates } from '../../game/selectors';
import type { StaffCandidate, StaffMember } from '../../game/types';

function Avatar({ name, role }: { name: string; role: StaffMember['role'] }) {
  const initials = name
    .split(' ')
    .map((p) => p.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      className={`inline-flex size-11 shrink-0 items-center justify-center rounded-full font-semibold ${role === 'barista' ? 'bg-espresso-800 text-cream-50' : 'bg-caramel-200 text-espresso-800'}`}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

export function StaffPanel({ locked }: { locked: boolean }) {
  const { game, dispatch } = useGame();
  const { go } = useNav();
  const cap = capacityView(game);
  const est = dayEstimate(game);
  const fixed = fixedCostsView(game);
  const candidates = hiringCandidates(game);
  const [hireTarget, setHireTarget] = useState<StaffCandidate | null>(null);
  const [fireTarget, setFireTarget] = useState<StaffMember | null>(null);
  const full = cap.staffCount >= cap.slots;
  const canExpand = !game.upgrades.includes('second_counter');
  const baristas = game.staff.filter((s) => s.role === 'barista').length;

  return (
    <div className="space-y-3">
      <Card>
        <CardTitle title="Kapasiti servis" icon={<Gauge className="size-5" />} />
        <dl className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-cream-100 p-2.5">
            <dt className="text-[11px] font-semibold uppercase text-espresso-600">Pesanan/jam</dt>
            <dd className="text-xl font-semibold">{cap.perHour}</dd>
          </div>
          <div className="rounded-xl bg-cream-100 p-2.5">
            <dt className="text-[11px] font-semibold uppercase text-espresso-600">Staf</dt>
            <dd className="text-xl font-semibold">
              {cap.staffCount}/{cap.slots}
            </dd>
          </div>
          <div className="rounded-xl bg-cream-100 p-2.5">
            <dt className="text-[11px] font-semibold uppercase text-espresso-600">Gaji/hari</dt>
            <dd className="font-semibold">
              <Money sen={fixed.wagesSen} trimZeroSen />
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-sm text-espresso-600">
          Waktu puncak dijangka menerima ~{est.peakHourFootfall} pelanggan sejam berbanding kapasiti {cap.perHour}. Pelanggan melebihi kapasiti akan beredar dan
          reputasi akan terjejas.
        </p>
      </Card>

      <Card>
        <CardTitle title="Pasukan anda" icon={<Users className="size-5" />} />
        <ul className="divide-y divide-espresso-800/[0.07]">
          {game.staff.map((m) => {
            const lastBarista = m.role === 'barista' && baristas <= 1;
            return (
              <li key={m.id} className="flex items-center gap-3 py-2.5">
                <Avatar name={m.name} role={m.role} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{m.name}</p>
                  <p className="text-sm text-espresso-600">
                    {STAFF_ROLES[m.role].name} · {m.ordersPerHour} pesanan/jam · <Money sen={m.wageSen} trimZeroSen />
                    /hari
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={locked || lastBarista}
                  aria-label={lastBarista ? `${m.name} ialah satu-satunya barista` : `Berhentikan ${m.name}`}
                  onClick={() => setFireTarget(m)}
                >
                  <UserMinus className="size-4" aria-hidden="true" />
                </Button>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <CardTitle
          title="Calon hari ini"
          subtitle="Calon baharu muncul setiap hari. Gaji dibayar setiap hari semasa tutup."
          icon={<UserPlus className="size-5" />}
        />
        {full && canExpand ? (
          <EmptyState
            icon={<Users className="size-6" />}
            title="Had staf dicapai"
            action={
              <Button size="sm" variant="secondary" onClick={() => go('urus', 'naik-taraf')}>
                Lihat Kaunter Servis Kedua
              </Button>
            }
          >
            Kafe anda hanya muat {cap.slots} orang staf. Naik taraf kaunter untuk menambah ruang.
          </EmptyState>
        ) : full ? (
          <EmptyState icon={<Users className="size-6" />} title="Pasukan sudah penuh">
            Kafe anda sudah mencapai had maksimum {cap.slots} orang staf. Berhentikan seorang staf jika mahu mengambil calon baharu.
          </EmptyState>
        ) : candidates.length === 0 ? (
          <EmptyState icon={<Users className="size-6" />} title="Tiada calon hari ini">
            Cuba lagi esok.
          </EmptyState>
        ) : (
          <ul className="space-y-2">
            {candidates.map((c) => {
              const affordable = c.hireFeeSen <= game.cashSen;
              return (
                <li key={c.id} className="rounded-xl border border-espresso-800/10 p-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={c.name} role={c.role} />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 font-semibold">
                        {c.name} <Badge tone={c.role === 'barista' ? 'dark' : 'info'}>{STAFF_ROLES[c.role].name}</Badge>
                      </p>
                      <p className="text-sm text-espresso-600">
                        {c.ordersPerHour} pesanan/jam · <Money sen={c.wageSen} trimZeroSen />
                        /hari
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-sm text-espresso-600">
                      Kos pengambilan <Money sen={c.hireFeeSen} trimZeroSen />
                    </p>
                    <Button size="sm" variant="accent" disabled={locked || !affordable} onClick={() => setHireTarget(c)}>
                      {affordable ? 'Ambil' : 'Tunai tak cukup'}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={hireTarget !== null}
        title={`Ambil ${hireTarget?.name ?? ''}?`}
        confirmLabel="Ambil bekerja"
        tone="accent"
        onCancel={() => setHireTarget(null)}
        onConfirm={() => {
          if (hireTarget) dispatch({ type: 'HIRE', candidateId: hireTarget.id });
          setHireTarget(null);
        }}
      >
        {hireTarget ? (
          <p>
            Kos pengambilan <Money sen={hireTarget.hireFeeSen} /> dibayar sekarang. Gaji <Money sen={hireTarget.wageSen} /> sehari akan dibayar setiap kali kafe
            ditutup. Kapasiti kafe bertambah daripada {capacityAfterHire(game, hireTarget).before} kepada {capacityAfterHire(game, hireTarget).after} pesanan sejam.
          </p>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={fireTarget !== null}
        title={`Berhentikan ${fireTarget?.name ?? ''}?`}
        confirmLabel="Berhentikan"
        tone="danger"
        onCancel={() => setFireTarget(null)}
        onConfirm={() => {
          if (fireTarget) dispatch({ type: 'FIRE', staffId: fireTarget.id });
          setFireTarget(null);
        }}
      >
        <p>
          {fireTarget?.name} akan meninggalkan kafe serta-merta dan kapasiti servis akan berkurang. Kos pengambilan tidak akan dipulangkan. Tindakan ini tidak boleh
          dibatalkan.
        </p>
      </ConfirmDialog>
    </div>
  );
}
