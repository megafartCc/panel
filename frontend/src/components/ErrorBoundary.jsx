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
        console.error('Frontend error boundary caught:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex min-h-screen items-center justify-center bg-transparent p-6">
                    <div className="panel w-full max-w-xl p-6">
                        <h1 className="text-2xl font-semibold text-zinc-950">Frontend crashed</h1>
                        <p className="mt-2 text-sm text-zinc-500">
                            Something failed while rendering. Refresh the page. If it keeps happening, share this message.
                        </p>
                        <pre className="mt-4 overflow-x-auto rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                            {this.state.message}
                        </pre>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
