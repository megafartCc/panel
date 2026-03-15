import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { login } from '../lib/api';

export default function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
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
        <div className="min-h-screen bg-black px-4">
            <div className="mx-auto flex min-h-screen w-full max-w-xl items-center justify-center">
                <section className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
                    <h1 className="text-center text-2xl font-semibold text-black">Login</h1>

                    {error && (
                        <div className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                        <div>
                            <label htmlFor="login-username" className="mb-1 block text-sm font-medium text-black">Login</label>
                            <input
                                id="login-username"
                                type="text"
                                value={username}
                                onChange={(event) => setUsername(event.target.value)}
                                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-black outline-none focus:border-black"
                                placeholder="login"
                                autoFocus
                                required
                            />
                        </div>

                        <div>
                            <label htmlFor="login-password" className="mb-1 block text-sm font-medium text-black">Password</label>
                            <input
                                id="login-password"
                                type="password"
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-black outline-none focus:border-black"
                                placeholder="password"
                                required
                            />
                        </div>

                        <button
                            id="login-submit"
                            type="submit"
                            disabled={loading}
                            className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-md bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-70"
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
    );
}
