import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, LockKeyhole, Shield, Waves } from 'lucide-react';
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
        <div className="min-h-screen bg-transparent px-4 py-8 sm:px-6 lg:px-8">
            <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-[1380px] gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
                <section className="hidden lg:block">
                    <div className="max-w-2xl">
                        <div className="badge-dark">
                            <Waves className="h-3.5 w-3.5" />
                            Operator Access
                        </div>
                        <h1 className="section-title mt-6 text-6xl font-semibold leading-[0.95] text-zinc-950">
                            Structured panel telemetry with the same clean shell as FunpayAutomationV2.
                        </h1>
                        <p className="mt-6 max-w-xl text-base leading-8 text-zinc-500">
                            Session analytics, SAB finder reports, and script registry controls now sit inside a flatter white workspace instead of the old glossy panel.
                        </p>

                        <div className="mt-8 grid gap-4 sm:grid-cols-3">
                            <div className="panel p-5">
                                <p className="section-kicker">Telemetry</p>
                                <p className="mt-3 text-2xl font-semibold text-zinc-950">Live</p>
                                <p className="mt-2 text-sm leading-6 text-zinc-500">Realtime session stats and active player tracking.</p>
                            </div>
                            <div className="panel p-5">
                                <p className="section-kicker">Finder</p>
                                <p className="mt-3 text-2xl font-semibold text-zinc-950">30s</p>
                                <p className="mt-2 text-sm leading-6 text-zinc-500">Short-lived server listings for newly reported brainrots.</p>
                            </div>
                            <div className="panel p-5">
                                <p className="section-kicker">Registry</p>
                                <p className="mt-3 text-2xl font-semibold text-zinc-950">HMAC</p>
                                <p className="mt-2 text-sm leading-6 text-zinc-500">Per-script keys and embed snippets from one place.</p>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="panel mx-auto w-full max-w-[560px] p-6 sm:p-8">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-900 text-white">
                                <Shield className="h-6 w-6" />
                            </div>
                            <p className="section-kicker mt-5">Secure Sign In</p>
                            <h2 className="section-title mt-2 text-4xl font-semibold text-zinc-950">Operator panel login</h2>
                            <p className="mt-3 text-sm leading-7 text-zinc-500">
                                Authenticate to access analytics, active sessions, and the SAB finder feed.
                            </p>
                        </div>
                        <div className="badge">v2 style</div>
                    </div>

                    {error && (
                        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                        <div>
                            <label htmlFor="login-username" className="field-label">Username</label>
                            <input
                                id="login-username"
                                type="text"
                                value={username}
                                onChange={(event) => setUsername(event.target.value)}
                                className="input"
                                placeholder="operator"
                                autoFocus
                                required
                            />
                        </div>

                        <div>
                            <label htmlFor="login-password" className="field-label">Password</label>
                            <div className="relative">
                                <input
                                    id="login-password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                    className="input pr-12"
                                    placeholder="Enter password"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((value) => !value)}
                                    className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                        </div>

                        <div className="surface-soft rounded-2xl border border-zinc-200 px-4 py-3 text-sm text-zinc-500">
                            <div className="flex items-center gap-3">
                                <LockKeyhole className="h-4 w-4 text-amber-500" />
                                Session token is stored in local storage after authentication succeeds.
                            </div>
                        </div>

                        <button id="login-submit" type="submit" disabled={loading} className="btn btn-dark w-full">
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
    );
}
