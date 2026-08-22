import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const message = error instanceof Error ? error.message : String(error);
    return { hasError: true, errorMessage: message };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('Application render error:', error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full flex items-center justify-center bg-[#f4f7f6] p-4">
          <div className="w-full max-w-md bg-white border border-[#d7dde1] rounded-md shadow-sm p-5">
            <div className="text-base font-bold text-[#b71c1c] mb-2">
              Something went wrong
            </div>
            <div className="text-xs text-gray-600 mb-3 leading-snug">
              The app hit an unexpected error and stopped rendering. Your saved data is safe. Reload to continue.
            </div>
            <div className="text-[11px] font-mono text-gray-700 bg-[#f4f7f6] border border-[#d7dde1] rounded p-2 mb-4 max-h-32 overflow-auto whitespace-pre-wrap break-words">
              {this.state.errorMessage}
            </div>
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex items-center justify-center gap-1.5 rounded border-0 px-2.5 py-1.5 text-xs font-bold cursor-pointer bg-[#2b579a] text-white hover:bg-blue-800"
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
