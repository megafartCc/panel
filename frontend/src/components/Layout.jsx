import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Activity, ChartColumn, Code2, LineChart, LogOut, ShieldCheck, UserCircle2, Wifi, WifiOff } from 'lucide-react';
import { usePolling } from '../hooks/useWebSocket';

function formatCompact(value) {
    return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0);
}

export default function Layout() {
    const navigate = useNavigate();
    const location = useLocation();
    const { sessions, stats, finder, connected } = usePolling(3000);

    const navItems = [
        { to: '/', icon: ChartColumn, label: 'Analytics', hint: 'Connection analytics and charts' },
        { to: '/scripts', icon: Code2, label: 'Scripts', hint: 'Script registry and integration keys' },
    ];

    const handleLogout = () => {
        localStorage.removeItem('panel_token');
        navigate('/login');
    };

    const totalActive = stats?.totalActive || sessions.length || 0;
    const uniqueUsers = stats?.uniqueUsers || 0;
    const totalScripts = stats?.perScript?.length || 0;

    return (
        <div className="relative min-h-screen overflow-hidden bg-panel-bg text-panel-text">
            <div className="panel-grid pointer-events-none absolute inset-0 opacity-80" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(circle_at_top,_rgba(95,133,255,0.12),_transparent_55%)]" />

            <div className="relative mx-auto flex min-h-screen max-w-[1640px] gap-5 px-4 py-4 sm:px-5 lg:px-6">
                <aside className="panel-card panel-ring hidden w-[248px] shrink-0 rounded-[28px] p-5 lg:flex lg:flex-col">
                    <div>
                        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0d1833] text-white shadow-[0_18px_36px_rgba(13,24,51,0.16)]">
                            <ShieldCheck className="h-6 w-6" />
                        </div>
                        <p className="panel-mono text-[11px] uppercase tracking-[0.32em] text-panel-text-muted">Panel Suite</p>
                        <h1 className="panel-title mt-2 text-[2rem] font-extrabold">Operator</h1>
                        <p className="mt-3 text-sm leading-6 text-panel-text-dim">
                            Clean connection analytics and script status in one controlled surface.
                        </p>
                    </div>

                    <nav className="mt-8 space-y-2">
                        {navItems.map((item) => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                end={item.to === '/'}
                                className={({ isActive }) =>
                                    `group flex items-center gap-3 rounded-2xl border px-4 py-3.5 transition-all ${
                                        isActive
                                            ? 'border-[#0d1833]/8 bg-[#0d1833] text-white shadow-[0_16px_34px_rgba(13,24,51,0.18)]'
                                            : 'border-transparent text-panel-text hover:border-panel-border hover:bg-panel-bg-soft'
                                    }`
                                }
                            >
                                <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                                    location.pathname === item.to
                                        ? 'bg-white/12 text-white'
                                        : 'bg-[#eef2fa] text-panel-text-dim group-hover:bg-white'
                                }`}>
                                    <item.icon className="h-4.5 w-4.5" />
                                </div>
                                <div className="min-w-0">
                                    <p className="font-semibold">{item.label}</p>
                                    <p className={`mt-0.5 text-xs ${location.pathname === item.to ? 'text-white/62' : 'text-panel-text-muted'}`}>
                                        {item.hint}
                                    </p>
                                </div>
                            </NavLink>
                        ))}
                    </nav>

                    <div className="mt-auto rounded-[24px] border border-panel-border bg-[linear-gradient(180deg,_rgba(245,247,252,0.92),_rgba(255,255,255,0.88))] p-4">
                        <p className="panel-mono text-[10px] uppercase tracking-[0.28em] text-panel-text-muted">Realtime Status</p>
                        <div className="mt-4 flex items-center justify-between gap-3">
                            <div>
                                <p className="text-sm font-semibold">Socket</p>
                                <p className="text-xs text-panel-text-muted">Polling every 3 seconds</p>
                            </div>
                            <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                                connected ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                            }`}>
                                {connected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                                {connected ? 'Live' : 'Offline'}
                            </div>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-3">
                            <div className="rounded-2xl bg-white px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]">
                                <p className="panel-mono text-[10px] uppercase tracking-[0.2em] text-panel-text-muted">Now</p>
                                <p className="mt-2 text-lg font-bold">{formatCompact(totalActive)}</p>
                            </div>
                            <div className="rounded-2xl bg-white px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]">
                                <p className="panel-mono text-[10px] uppercase tracking-[0.2em] text-panel-text-muted">Scripts</p>
                                <p className="mt-2 text-lg font-bold">{formatCompact(totalScripts)}</p>
                            </div>
                        </div>
                    </div>
                </aside>

                <div className="flex min-w-0 flex-1 flex-col gap-4">
                    <header className="panel-card panel-ring flex flex-col gap-4 rounded-[28px] px-5 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <p className="panel-mono text-[11px] uppercase tracking-[0.3em] text-panel-text-muted">
                                {location.pathname === '/scripts' ? 'REGISTRY' : 'DASHBOARD'}
                            </p>
                            <h2 className="panel-title mt-2 text-[2rem] font-extrabold leading-none">
                                {location.pathname === '/scripts' ? 'Script Registry' : 'Player Connection Analytics'}
                            </h2>
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                            <div className="flex items-center gap-3 rounded-2xl border border-panel-border bg-white px-4 py-3 shadow-[0_8px_24px_rgba(91,104,136,0.06)]">
                                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#eef2fa] text-[#7f8cab]">
                                    <UserCircle2 className="h-5 w-5" />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold">Operator</p>
                                    <p className="text-xs text-panel-text-muted">Top-right profile</p>
                                </div>
                            </div>

                            <button
                                onClick={handleLogout}
                                className="inline-flex items-center gap-2 rounded-2xl border border-panel-border bg-white px-4 py-3 text-sm font-semibold text-panel-text shadow-[0_8px_24px_rgba(91,104,136,0.06)] transition hover:bg-panel-bg-soft"
                            >
                                <LogOut className="h-4 w-4" />
                                Logout
                            </button>
                        </div>
                    </header>

                    <main className="min-h-0 flex-1">
                        <Outlet context={{ sessions, stats, finder, connected, totalActive, uniqueUsers, totalScripts }} />
                    </main>
                </div>
            </div>

            <div className="fixed inset-x-3 bottom-3 z-20 rounded-2xl panel-card px-4 py-3 text-sm lg:hidden">
                <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <p className="font-semibold">Operator Panel</p>
                        <p className="truncate text-xs text-panel-text-muted">
                            {connected ? 'Analytics feed is live' : 'Waiting for backend feed'}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 rounded-full bg-white px-3 py-1.5 shadow-[0_8px_20px_rgba(91,104,136,0.08)]">
                        <LineChart className="h-4 w-4 text-panel-secondary" />
                        <Activity className="h-4 w-4 text-panel-text-dim" />
                        <span className="panel-mono text-xs">{formatCompact(totalActive)}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
