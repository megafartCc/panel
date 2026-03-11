import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
    Activity,
    BarChart3,
    Code2,
    LogOut,
    Search,
    Shield,
    UserCircle2,
    Wifi,
    WifiOff,
} from 'lucide-react';
import { usePolling } from '../hooks/useWebSocket';

function compact(value) {
    return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0);
}

export default function Layout() {
    const navigate = useNavigate();
    const location = useLocation();
    const { sessions, stats, finder, connected } = usePolling(3000);

    const navItems = [
        { to: '/', label: 'Dashboard', icon: BarChart3, hint: 'Analytics and finder feed' },
        { to: '/scripts', label: 'Scripts', icon: Code2, hint: 'Registry and keys' },
    ];

    const handleLogout = () => {
        localStorage.removeItem('panel_token');
        navigate('/login');
    };

    const routeMeta = location.pathname === '/scripts'
        ? { kicker: 'Registry', title: 'Script Registry', description: 'Manage script identities, keys, and embed snippets.' }
        : { kicker: 'Overview', title: 'Live Operations', description: 'Session telemetry, finder reports, and script distribution.' };

    const totalActive = stats?.totalActive || sessions.length || 0;
    const uniqueUsers = stats?.uniqueUsers || 0;
    const totalScripts = stats?.perScript?.length || 0;
    const finderServers = finder?.servers?.length || 0;

    return (
        <div className="app-shell lg:grid lg:min-h-screen lg:grid-cols-[264px_minmax(0,1fr)]">
            <aside className="app-sidebar hidden lg:flex lg:flex-col">
                <div className="px-6 pb-6 pt-7">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-900 text-white">
                        <Shield className="h-5 w-5" />
                    </div>
                    <p className="mt-5 text-xs font-semibold uppercase tracking-[0.22em] text-zinc-400">Panel</p>
                    <h1 className="mt-2 text-[1.9rem] font-semibold tracking-[-0.04em] text-zinc-950">Operator</h1>
                    <p className="mt-3 text-sm leading-6 text-zinc-500">
                        Clean shell patterned after FunpayAutomationV2, but still driving the panel feed.
                    </p>
                </div>

                <nav className="px-4">
                    <div className="space-y-1.5">
                        {navItems.map((item) => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                end={item.to === '/'}
                                className={({ isActive }) => `flex items-center gap-3 rounded-2xl px-4 py-3 transition ${
                                    isActive ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-950'
                                }`}
                            >
                                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                                    location.pathname === item.to ? 'bg-white/10 text-white' : 'bg-zinc-100 text-zinc-500'
                                }`}
                                >
                                    <item.icon className="h-4 w-4" />
                                </div>
                                <div className="min-w-0">
                                    <p className="font-medium">{item.label}</p>
                                    <p className={`truncate text-xs ${location.pathname === item.to ? 'text-zinc-300' : 'text-zinc-400'}`}>
                                        {item.hint}
                                    </p>
                                </div>
                            </NavLink>
                        ))}
                    </div>
                </nav>

                <div className="mt-auto px-4 pb-6">
                    <div className="card space-y-4 p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="section-kicker">Realtime</p>
                                <p className="mt-2 text-sm font-medium text-zinc-950">Polling panel feed</p>
                            </div>
                            <div className={`badge ${connected ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                                {connected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                                {connected ? 'Live' : 'Offline'}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="surface-soft rounded-2xl p-3">
                                <p className="section-kicker">Active</p>
                                <p className="mt-2 text-2xl font-semibold text-zinc-950">{compact(totalActive)}</p>
                            </div>
                            <div className="surface-soft rounded-2xl p-3">
                                <p className="section-kicker">Finder</p>
                                <p className="mt-2 text-2xl font-semibold text-zinc-950">{compact(finderServers)}</p>
                            </div>
                        </div>
                        <div className="surface-soft rounded-2xl p-3">
                            <p className="section-kicker">Coverage</p>
                            <div className="mt-2 flex items-center justify-between text-sm">
                                <span className="text-zinc-500">Scripts tracked</span>
                                <span className="font-medium text-zinc-950">{compact(totalScripts)}</span>
                            </div>
                            <div className="mt-2 flex items-center justify-between text-sm">
                                <span className="text-zinc-500">Unique users</span>
                                <span className="font-medium text-zinc-950">{compact(uniqueUsers)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </aside>

            <div className="min-w-0">
                <header className="app-topbar sticky top-0 z-30">
                    <div className="flex flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8 lg:py-5">
                        <div>
                            <p className="section-kicker">{routeMeta.kicker}</p>
                            <h2 className="section-title mt-2 text-[2rem] font-semibold text-zinc-950">{routeMeta.title}</h2>
                            <p className="mt-2 text-sm text-zinc-500">{routeMeta.description}</p>
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                            <label className="relative block w-full min-w-0 sm:w-[280px]">
                                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                                <input
                                    type="text"
                                    value={location.pathname === '/scripts' ? 'Registry view' : 'Dashboard view'}
                                    readOnly
                                    className="input bg-zinc-50 pl-10 text-zinc-500"
                                />
                            </label>

                            <div className="card flex items-center gap-3 px-4 py-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
                                    <UserCircle2 className="h-5 w-5" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-zinc-950">Operator</p>
                                    <p className="text-xs text-zinc-400">Authenticated panel session</p>
                                </div>
                            </div>

                            <button type="button" onClick={handleLogout} className="btn-ghost">
                                <LogOut className="h-4 w-4" />
                                Logout
                            </button>
                        </div>
                    </div>
                </header>

                <main className="px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
                    <div className="mx-auto max-w-[1600px]">
                        <Outlet context={{ sessions, stats, finder, connected, totalActive, uniqueUsers, totalScripts }} />
                    </div>
                </main>
            </div>

            <div className="fixed inset-x-4 bottom-4 z-40 lg:hidden">
                <div className="panel flex items-center justify-between gap-3 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className={`status-dot ${connected ? 'live' : 'offline'}`} />
                        <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-zinc-950">Panel Feed</p>
                            <p className="truncate text-xs text-zinc-400">
                                {connected ? `${compact(totalActive)} active, ${compact(finderServers)} finder servers` : 'Waiting for backend'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <NavLink
                            to="/"
                            end
                            className={({ isActive }) => `rounded-xl px-3 py-2 text-sm font-medium ${
                                isActive ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-500'
                            }`}
                        >
                            <div className="flex items-center gap-2">
                                <Activity className="h-4 w-4" />
                                Home
                            </div>
                        </NavLink>
                        <NavLink
                            to="/scripts"
                            className={({ isActive }) => `rounded-xl px-3 py-2 text-sm font-medium ${
                                isActive ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-500'
                            }`}
                        >
                            <div className="flex items-center gap-2">
                                <Code2 className="h-4 w-4" />
                                Scripts
                            </div>
                        </NavLink>
                    </div>
                </div>
            </div>
        </div>
    );
}
