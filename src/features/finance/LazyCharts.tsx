import { Component, lazy, Suspense, type ReactNode } from 'react';
import type { HistoryPoint } from '../../game/reports';

// Recharts is the heaviest dependency, so charts load in their own chunk after the first screen renders.
const load = () => import('./charts');
const RevenueProfitChartImpl = lazy(() => load().then((m) => ({ default: m.RevenueProfitChart })));
const CashChartImpl = lazy(() => load().then((m) => ({ default: m.CashChart })));
const ProfitMiniChartImpl = lazy(() => load().then((m) => ({ default: m.ProfitMiniChart })));

function ChartPlaceholder({ height, children }: { height: string; children: ReactNode }) {
  return (
    <div className={`flex items-center justify-center rounded-xl bg-cream-100 px-4 text-center text-sm text-espresso-600 ${height}`} role="status">
      {children}
    </div>
  );
}

class ChartBoundary extends Component<{ height: string; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return (
        <ChartPlaceholder height={this.props.height}>
          Carta tidak dapat dimuatkan. Semak sambungan internet dan muat semula halaman — data anda masih selamat.
        </ChartPlaceholder>
      );
    }
    return this.props.children;
  }
}

interface ChartProps {
  data: HistoryPoint[];
}

function withChart(Impl: React.LazyExoticComponent<(props: ChartProps) => ReactNode>, height: string) {
  return function LazyChart(props: ChartProps) {
    return (
      <ChartBoundary height={height}>
        <Suspense fallback={<ChartPlaceholder height={height}>Memuatkan carta…</ChartPlaceholder>}>
          <Impl {...props} />
        </Suspense>
      </ChartBoundary>
    );
  };
}

export const RevenueProfitChart = withChart(RevenueProfitChartImpl, 'h-64');
export const CashChart = withChart(CashChartImpl, 'h-44');
export const ProfitMiniChart = withChart(ProfitMiniChartImpl, 'h-32');
