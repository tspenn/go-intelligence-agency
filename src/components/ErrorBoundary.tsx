import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { error: Error | null };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen bg-[#0a0e10] flex items-center justify-center p-8">
        <div className="max-w-md text-center">
          <p className="font-mono text-xs text-emerald-400 tracking-widest uppercase mb-3">
            Briefing interrupted
          </p>
          <p className="text-[#f5f0e8] mb-6">
            Something went wrong loading your operations. Refresh the page to try again.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="font-mono text-[12px] uppercase tracking-widest bg-emerald-600 text-white px-4 py-2 rounded-sm"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
