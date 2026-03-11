import { Component } from 'react';

export default class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, message: '' };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, message: error?.message || 'Unknown frontend error' };
    }

    componentDidCatch(error, errorInfo) {
        // Keep this for diagnostics in the browser console.
        console.error('Frontend error boundary caught:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex min-h-screen items-center justify-center bg-[#0b1220] p-6 text-white">
                    <div className="w-full max-w-xl rounded-2xl border border-white/15 bg-white/5 p-6">
                        <h1 className="text-2xl font-bold">Frontend crashed</h1>
                        <p className="mt-2 text-sm text-slate-300">
                            Something failed while rendering. Refresh the page. If it keeps happening, share this message.
                        </p>
                        <pre className="mt-4 overflow-x-auto rounded-lg bg-black/30 p-3 text-xs text-rose-200">
                            {this.state.message}
                        </pre>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
