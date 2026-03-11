import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { BarChart3, LogOut, UserCircle2 } from 'lucide-react';
import { usePolling } from '../hooks/useWebSocket';

function compact(value) {
    return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0);
}

export default function Layout() {
    const navigate = useNavigate();
    const { sessions, stats, recent, connected } = usePolling(3000);

    const navItems = [{ to: '/', icon: BarChart3, label: 'Analytics' }];

    const handleLogout = () => {
        localStorage.removeItem('panel_token');
        navigate('/login');
    };

    return (
        <div className="min-h-screen bg-[#f6f8fc] text-slate-900">
            <div className="mx-auto flex min-h-screen w-full max-w-[1700px] gap-6 p-4 lg:p-6">
                <aside className="hidden w-[280px] shrink-0 rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_45px_rgba(15,23,42,0.08)] lg:flex lg:flex-col">
                    <nav className="space-y-2">
                        {navItems.map((item) => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                end={item.to === '/'}
                                className={({ isActive }) =>
                                    `flex items-center gap-3 rounded-md px-4 py-3 text-sm font-medium transition ${
                                        isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                                    }`
                                }
                            >
                                <item.icon className="h-4 w-4" />
                                {item.label}
                            </NavLink>
                        ))}
                    </nav>

                    <div className="mt-auto space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Realtime status</p>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-500">Socket</span>
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${connected ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                {connected ? 'Live' : 'Offline'}
                            </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                            <div className="rounded-xl bg-white p-2">
                                <p className="text-xs text-slate-400">Now</p>
                                <p className="font-semibold">{compact(stats?.totalActive || sessions.length)}</p>
                            </div>
                            <div className="rounded-xl bg-white p-2">
                                <p className="text-xs text-slate-400">Today</p>
                                <p className="font-semibold">{compact(stats?.last24h || 0)}</p>
                            </div>
                        </div>
                    </div>
                </aside>

                <div className="flex min-w-0 flex-1 flex-col">
                    <header className="mb-6 flex items-center justify-between rounded-3xl border border-slate-200 bg-white px-5 py-4 shadow-[0_15px_40px_rgba(15,23,42,0.06)]">
                        <div>
                            <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Dashboard</p>
                            <h2 className="text-xl font-bold">Player Connection Analytics</h2>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="hidden items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 sm:flex">
                                <UserCircle2 className="h-5 w-5 text-slate-400" />
                                <div>
                                    <p className="text-sm font-semibold">Operator</p>
                                    <p className="text-xs text-slate-400">Top-right profile</p>
                                </div>
                            </div>
                            <button
                                onClick={handleLogout}
                                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
                            >
                                <LogOut className="h-4 w-4" />
                                Logout
                            </button>
                        </div>
                    </header>

                    <main className="min-h-0 flex-1">
                        <Outlet context={{ sessions, stats, recent, connected }} />
                    </main>
                </div>
            </div>
        </div>
    );
}
