import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Activity, Code2, Compass, LogOut, RadioTower, ShieldCheck, Users, Wifi, WifiOff } from 'lucide-react';
import { usePolling } from '../hooks/useWebSocket';

function formatCompact(value) {
    return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0);
}

export default function Layout() {
    const navigate = useNavigate();
    const location = useLocation();
    const { sessions, stats, connected } = usePolling(3000);

    const navItems = [
        { to: '/', icon: Compass, label: 'Overview', hint: 'Live health and audience' },
        { to: '/scripts', icon: Code2, label: 'Scripts', hint: 'Keys, snippets, rollout' },
    ];

    const handleLogout = () => {
        localStorage.removeItem('panel_token');
        navigate('/login');
    };

    const totalActive = stats?.totalActive || sessions.length || 0;
    const uniqueUsers = stats?.uniqueUsers || 0;
    const totalScripts = stats?.perScript?.length || 0;

    return (
        <div className="relative min-h-screen overflow-hidden text-panel-text">
            <div className="panel-grid pointer-events-none absolute inset-0 opacity-70" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_top,_rgba(255,107,87,0.16),_transparent_58%)]" />
            <div className="pointer-events-none absolute right-[-8rem] top-20 h-72 w-72 rounded-full bg-[radial-gradient(circle,_rgba(103,184,255,0.16),_transparent_70%)] blur-3xl" />

            <div className="relative mx-auto flex min-h-screen max-w-[1600px] gap-5 px-3 py-3 sm:px-4 sm:py-4 lg:px-5">
                <aside className="panel-card panel-ring hidden w-[302px] shrink-0 rounded-[28px] p-5 lg:flex lg:flex-col">
                    <div className="mb-6 flex items-start justify-between gap-4">
                        <div>
                            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,_rgba(255,107,87,0.92),_rgba(255,186,73,0.92))] text-white shadow-[0_16px_38px_rgba(255,107,87,0.25)]">
                                <ShieldCheck className="h-7 w-7" />
                            </div>
                            <p className="panel-mono text-[11px] uppercase tracking-[0.34em] text-panel-text-muted">
                                Control Surface
                            </p>
                            <h1 className="panel-title mt-1 text-3xl font-bold">Panel HQ</h1>
                            <p className="mt-2 max-w-[18rem] text-sm leading-6 text-panel-text-dim">
                                Real-time script telemetry, sharper operator view, and less dashboard dead space.
                            </p>
                        </div>
                        <div className="rounded-full border border-panel-border px-3 py-1 panel-mono text-[11px] uppercase tracking-[0.3em] text-panel-text-muted">
                            v2
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-2xl border border-panel-border bg-white/[0.03] p-3">
                            <p className="panel-mono text-[11px] uppercase tracking-[0.26em] text-panel-text-muted">Active</p>
                            <p className="mt-2 text-2xl font-semibold">{formatCompact(totalActive)}</p>
                        </div>
                        <div className="rounded-2xl border border-panel-border bg-white/[0.03] p-3">
                            <p className="panel-mono text-[11px] uppercase tracking-[0.26em] text-panel-text-muted">Scripts</p>
                            <p className="mt-2 text-2xl font-semibold">{formatCompact(totalScripts)}</p>
                        </div>
                    </div>

                    <nav className="mt-8 space-y-2">
                        {navItems.map((item) => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                end={item.to === '/'}
                                className={({ isActive }) =>
                                    `group flex items-center gap-4 rounded-2xl border px-4 py-4 transition-all ${
                                        isActive
                                            ? 'border-white/10 bg-white/[0.07] shadow-[0_18px_40px_rgba(0,0,0,0.18)]'
                                            : 'border-transparent bg-transparent hover:border-panel-border hover:bg-white/[0.04]'
                                    }`
                                }
                            >
                                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                                    location.pathname === item.to
                                        ? 'bg-[linear-gradient(135deg,_rgba(255,107,87,0.2),_rgba(103,184,255,0.18))] text-white'
                                        : 'bg-white/[0.04] text-panel-text-dim group-hover:text-white'
                                }`}>
                                    <item.icon className="h-5 w-5" />
                                </div>
                                <div className="min-w-0">
                                    <p className="font-semibold">{item.label}</p>
                                    <p className="mt-0.5 text-xs text-panel-text-muted">{item.hint}</p>
                                </div>
                            </NavLink>
                        ))}
                    </nav>

                    <div className="mt-auto space-y-4">
                        <div className="rounded-3xl border border-panel-border bg-[linear-gradient(180deg,_rgba(255,255,255,0.04),_rgba(255,255,255,0.02))] p-4">
                            <div className="flex items-center gap-3">
                                <div className={`relative flex h-10 w-10 items-center justify-center rounded-2xl ${
                                    connected ? 'bg-emerald-400/12 text-emerald-300' : 'bg-red-400/12 text-red-300'
                                }`}>
                                    {connected ? <Wifi className="h-5 w-5" /> : <WifiOff className="h-5 w-5" />}
                                    <span className={`absolute right-1 top-1 h-2 w-2 rounded-full ${connected ? 'bg-emerald-300 animate-panel-pulse' : 'bg-red-300'}`} />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold">{connected ? 'Telemetry live' : 'Telemetry stalled'}</p>
                                    <p className="text-xs text-panel-text-muted">
                                        Refresh cadence: 3 seconds
                                    </p>
                                </div>
                            </div>
                            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                                <div className="rounded-2xl bg-white/[0.04] px-3 py-2">
                                    <p className="panel-mono text-[10px] uppercase tracking-[0.26em] text-panel-text-muted">Unique</p>
                                    <p className="mt-1 font-semibold">{formatCompact(uniqueUsers)}</p>
                                </div>
                                <div className="rounded-2xl bg-white/[0.04] px-3 py-2">
                                    <p className="panel-mono text-[10px] uppercase tracking-[0.26em] text-panel-text-muted">Clients</p>
                                    <p className="mt-1 font-semibold">{formatCompact(sessions.length)}</p>
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={handleLogout}
                            className="flex w-full items-center justify-between rounded-2xl border border-panel-border bg-white/[0.03] px-4 py-3 text-left transition hover:bg-white/[0.06]"
                        >
                            <span>
                                <span className="block font-semibold">Logout</span>
                                <span className="block text-xs text-panel-text-muted">Drop token and return to auth</span>
                            </span>
                            <LogOut className="h-5 w-5 text-panel-text-dim" />
                        </button>
                    </div>
                </aside>

                <div className="flex min-w-0 flex-1 flex-col gap-4">
                    <header className="panel-card panel-ring flex flex-col gap-4 rounded-[26px] px-5 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-start gap-4">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,_rgba(255,107,87,0.18),_rgba(103,184,255,0.18))] text-panel-accent">
                                <Activity className="h-6 w-6" />
                            </div>
                            <div>
                                <p className="panel-mono text-[11px] uppercase tracking-[0.32em] text-panel-text-muted">
                                    {location.pathname === '/scripts' ? 'Script Registry' : 'Operations Snapshot'}
                                </p>
                                <h2 className="panel-title mt-1 text-2xl font-bold">
                                    {location.pathname === '/scripts' ? 'Manage shipping keys and snippets' : 'Observe the room before you touch anything'}
                                </h2>
                                <p className="mt-2 max-w-2xl text-sm text-panel-text-dim">
                                    Clean read on live sessions, script saturation, and integration state across the panel.
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <div className="rounded-2xl border border-panel-border bg-white/[0.04] px-4 py-3">
                                <p className="panel-mono text-[10px] uppercase tracking-[0.28em] text-panel-text-muted">Live users</p>
                                <p className="mt-2 text-xl font-semibold">{formatCompact(totalActive)}</p>
                            </div>
                            <div className="rounded-2xl border border-panel-border bg-white/[0.04] px-4 py-3">
                                <p className="panel-mono text-[10px] uppercase tracking-[0.28em] text-panel-text-muted">Unique ids</p>
                                <p className="mt-2 text-xl font-semibold">{formatCompact(uniqueUsers)}</p>
                            </div>
                            <div className="rounded-2xl border border-panel-border bg-white/[0.04] px-4 py-3">
                                <p className="panel-mono text-[10px] uppercase tracking-[0.28em] text-panel-text-muted">Scripts online</p>
                                <p className="mt-2 text-xl font-semibold">{formatCompact(totalScripts)}</p>
                            </div>
                        </div>
                    </header>

                    <main className="min-h-0 flex-1">
                        <Outlet context={{ sessions, stats, connected }} />
                    </main>
                </div>
            </div>

            <div className="fixed inset-x-3 bottom-3 z-20 rounded-2xl panel-card px-4 py-3 text-sm lg:hidden">
                <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <p className="font-semibold">Panel HQ</p>
                        <p className="truncate text-xs text-panel-text-muted">
                            {connected ? 'Live telemetry flowing' : 'No heartbeat updates'}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 rounded-full border border-panel-border px-3 py-1.5">
                        <RadioTower className={`h-4 w-4 ${connected ? 'text-emerald-300' : 'text-red-300'}`} />
                        <Users className="h-4 w-4 text-panel-text-dim" />
                        <span className="panel-mono text-xs">{formatCompact(totalActive)}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
