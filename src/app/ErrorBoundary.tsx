import { Component, type ErrorInfo, type ReactNode } from 'react';
import { clearSave, getBrowserStorage } from '../game/save';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Last-resort error screen so a rendering bug never leaves a blank page. */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Café Empire crashed', error, info.componentStack);
  }

  private reload = (): void => {
    window.location.reload();
  };

  private resetAndReload = (): void => {
    if (window.confirm('Padam simpanan dan mulakan permainan baharu? Tindakan ini tidak boleh dibatalkan.')) {
      clearSave(getBrowserStorage());
      window.location.reload();
    }
  };

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center" role="alert">
        <h1 className="font-display text-2xl text-espresso-800">Alamak, ada ralat</h1>
        <p className="text-espresso-600">
          Sesuatu tidak kena semasa memaparkan permainan. Kemajuan anda yang terakhir disimpan masih ada dalam pelayar ini.
        </p>
        <button
          type="button"
          onClick={this.reload}
          className="min-h-11 w-full rounded-xl bg-espresso-800 px-4 font-semibold text-cream-50"
        >
          Muat semula
        </button>
        <button
          type="button"
          onClick={this.resetAndReload}
          className="min-h-11 w-full rounded-xl border border-rust-600 px-4 font-semibold text-rust-700"
        >
          Padam simpanan &amp; mula semula
        </button>
      </main>
    );
  }
}
