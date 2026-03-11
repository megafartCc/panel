import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, LockKeyhole, RadioTower, ShieldCheck } from 'lucide-react';
import { login } from '../lib/api';

export default function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError('');
        setLoading(true);

        try {
            await login(username, password);
            navigate('/');
        } catch (err) {
            setError(err.message || 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="relative min-h-screen overflow-hidden bg-panel-bg text-panel-text">
            <div className="panel-grid pointer-events-none absolute inset-0 opacity-80" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_top,_rgba(255,107,87,0.18),_transparent_58%)]" />
            <div className="pointer-events-none absolute left-[-5rem] top-24 h-72 w-72 rounded-full bg-[radial-gradient(circle,_rgba(103,184,255,0.16),_transparent_72%)] blur-3xl" />
            <div className="pointer-events-none absolute bottom-[-4rem] right-[-2rem] h-80 w-80 rounded-full bg-[radial-gradient(circle,_rgba(255,186,73,0.14),_transparent_68%)] blur-3xl" />

            <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1480px] items-center px-4 py-8 sm:px-6 lg:px-8">
                <div className="grid w-full gap-6 lg:grid-cols-[1.08fr_0.92fr] lg:items-center">
                    <section className="hidden lg:block">
                        <div className="max-w-2xl space-y-6">
                            <div className="inline-flex items-center gap-3 rounded-full border border-panel-border bg-white/[0.04] px-4 py-2">
                                <RadioTower className="h-4 w-4 text-panel-accent" />
                                <span className="panel-mono text-[11px] uppercase tracking-[0.28em] text-panel-text-muted">
                                    Operator Access
                                </span>
                            </div>

                            <div>
                                <h1 className="panel-title max-w-xl text-5xl font-bold leading-[1.02]">
                                    Professional script telemetry without the throwaway admin-panel look.
                                </h1>
                                <p className="mt-5 max-w-xl text-base leading-8 text-panel-text-dim">
                                    Panel HQ centralizes session visibility, script-level distribution, and authenticated shipping keys in one controlled surface.
                                </p>
                            </div>

                            <div className="grid max-w-2xl gap-4 sm:grid-cols-3">
                                <div className="panel-card rounded-[24px] p-4">
                                    <p className="panel-mono text-[11px] uppercase tracking-[0.26em] text-panel-text-muted">Telemetry</p>
                                    <p className="mt-3 text-2xl font-semibold">Live</p>
                                    <p className="mt-2 text-sm leading-6 text-panel-text-dim">Active session feed, 24h activity curve, and script saturation.</p>
                                </div>
                                <div className="panel-card rounded-[24px] p-4">
                                    <p className="panel-mono text-[11px] uppercase tracking-[0.26em] text-panel-text-muted">Auth</p>
                                    <p className="mt-3 text-2xl font-semibold">HMAC</p>
                                    <p className="mt-2 text-sm leading-6 text-panel-text-dim">Per-script keys and integration snippets exposed from one registry.</p>
                                </div>
                                <div className="panel-card rounded-[24px] p-4">
                                    <p className="panel-mono text-[11px] uppercase tracking-[0.26em] text-panel-text-muted">Surface</p>
                                    <p className="mt-3 text-2xl font-semibold">Clean</p>
                                    <p className="mt-2 text-sm leading-6 text-panel-text-dim">Sharper hierarchy, better space usage, and responsive layout.</p>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section className="panel-card panel-ring mx-auto w-full max-w-[560px] rounded-[30px] p-5 sm:p-7 lg:ml-auto">
                        <div className="mb-8 flex items-start justify-between gap-4">
                            <div>
                                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-[22px] bg-[linear-gradient(135deg,_rgba(255,107,87,0.92),_rgba(255,186,73,0.9))] text-white shadow-[0_20px_50px_rgba(255,107,87,0.22)]">
                                    <ShieldCheck className="h-8 w-8" />
                                </div>
                                <p className="panel-mono text-[11px] uppercase tracking-[0.34em] text-panel-text-muted">Panel HQ</p>
                                <h2 className="mt-2 text-3xl font-bold">Secure operator sign-in</h2>
                                <p className="mt-3 text-sm leading-7 text-panel-text-dim">
                                    Authenticate to access live script analytics, session monitoring, and registry controls.
                                </p>
                            </div>
                            <div className="hidden rounded-full border border-panel-border px-3 py-1.5 panel-mono text-[11px] uppercase tracking-[0.26em] text-panel-text-muted sm:block">
                                v2
                            </div>
                        </div>

                        {error && (
                            <div className="mb-5 rounded-2xl border border-panel-danger/25 bg-panel-danger/10 px-4 py-3 text-sm text-panel-danger">
                                {error}
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div>
                                <label htmlFor="login-username" className="mb-2 block text-sm font-medium text-panel-text-dim">
                                    Username
                                </label>
                                <input
                                    id="login-username"
                                    type="text"
                                    value={username}
                                    onChange={(event) => setUsername(event.target.value)}
                                    className="w-full rounded-2xl border border-panel-border bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition focus:border-white/20"
                                    placeholder="operator"
                                    autoFocus
                                    required
                                />
                            </div>

                            <div>
                                <label htmlFor="login-password" className="mb-2 block text-sm font-medium text-panel-text-dim">
                                    Password
                                </label>
                                <div className="relative">
                                    <input
                                        id="login-password"
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={(event) => setPassword(event.target.value)}
                                        className="w-full rounded-2xl border border-panel-border bg-white/[0.04] px-4 py-3 pr-12 text-sm text-white outline-none transition focus:border-white/20"
                                        placeholder="Enter password"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword((value) => !value)}
                                        className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl text-panel-text-muted transition hover:bg-white/[0.06] hover:text-white"
                                    >
                                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>

                            <div className="rounded-[22px] border border-panel-border bg-white/[0.03] px-4 py-3 text-sm text-panel-text-dim">
                                <div className="flex items-center gap-3">
                                    <LockKeyhole className="h-4 w-4 text-panel-secondary" />
                                    Session token is stored locally after successful authentication.
                                </div>
                            </div>

                            <button
                                id="login-submit"
                                type="submit"
                                disabled={loading}
                                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,_rgba(255,107,87,0.94),_rgba(245,158,11,0.88))] px-5 py-3.5 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(255,107,87,0.24)] transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Signing in...
                                    </>
                                ) : (
                                    'Sign In'
                                )}
                            </button>
                        </form>
                    </section>
                </div>
            </div>
        </div>
    );
}
