import { useGame } from '../../app/GameProvider';
import { useNav } from '../../app/navigation';
import { ScreenTitle } from '../../components/Card';
import { Notice } from '../../components/Notice';
import { Segmented, tabPanelProps } from '../../components/Segmented';
import { ObjectivesPanel } from './ObjectivesPanel';
import { StaffPanel } from './StaffPanel';
import { UpgradesPanel } from './UpgradesPanel';

type BusinessTab = 'staf' | 'naik-taraf' | 'objektif';

export function BusinessScreen() {
  const { game } = useGame();
  const { sub, setSub } = useNav();
  const tab: BusinessTab = sub === 'naik-taraf' || sub === 'objektif' ? sub : 'staf';
  const locked = game.phase !== 'prep' || game.status !== 'active';
  return (
    <div className="space-y-4">
      <ScreenTitle title="Urus perniagaan" subtitle="Staf, naik taraf dan objektif kafe anda." />
      <Segmented<BusinessTab>
        id="urus-tabs"
        label="Bahagian pengurusan"
        value={tab}
        onChange={setSub}
        options={[
          { id: 'staf', label: 'Staf' },
          { id: 'naik-taraf', label: 'Naik taraf' },
          { id: 'objektif', label: 'Objektif' },
        ]}
      />
      {locked && tab !== 'objektif' ? (
        <Notice tone="info" title="Kafe sudah ditutup untuk hari ini">
          Pengambilan staf dan pembelian naik taraf dibuka semula apabila hari seterusnya bermula.
        </Notice>
      ) : null}
      <div {...tabPanelProps('urus-tabs', tab)}>
        {tab === 'staf' && <StaffPanel locked={locked} />}
        {tab === 'naik-taraf' && <UpgradesPanel locked={locked} />}
        {tab === 'objektif' && <ObjectivesPanel />}
      </div>
    </div>
  );
}
