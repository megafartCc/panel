import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
    CalendarDays,
    Clock3,
    ExternalLink,
    Radar,
    Search,
    SignalHigh,
    UsersRound,
} from 'lucide-react';
import {
    ArcElement,
    CategoryScale,
    Chart as ChartJS,
    Filler,
    Legend,
    LineElement,
    LinearScale,
    PointElement,
    Tooltip as ChartTooltip,
} from 'chart.js';
import { Doughnut, Line } from 'react-chartjs-2';

ChartJS.register(
    ArcElement,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Filler,
    Legend,
    ChartTooltip,
);

function compact(value) {
    return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0);
}

function timeSince(dateStr) {
    if (!dateStr) return 'never';
    const seconds = Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000));
    if (seconds < 10) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

function formatHourLabel(hour) {
    if (!hour) return '--';
    const date = new Date(hour);
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric' }).format(date);
}

function formatMoneyPerSec(value) {
    return `$${compact(value)}/s`;
}

function openRobloxJoin(server) {
    if (!server?.placeId || !server?.serverJobId) return;
    window.location.href = `roblox://placeID=${server.placeId}&gameInstanceId=${server.serverJobId}`;
}

export default function Dashboard() {
    const { sessions, stats, finder, connected, totalActive } = useOutletContext();
    const [search, setSearch] = useState('');
    const [windowHours, setWindowHours] = useState(24);

    const activeSessions = sessions || [];
    const perScript = stats?.perScript || [];
    const totalSessions = stats?.totalSessions || 0;
    const uniqueUsers = stats?.uniqueUsers || 0;
    const last24h = stats?.last24h || 0;
    const activePerScript = perScript.filter((script) => (script.active_users || 0) > 0);
    const finderServers = finder?.servers || [];

    const filteredActivity = useMemo(() => {
        const hourlyActivity = stats?.hourlyActivity || [];
        const cutoff = Date.now() - (windowHours * 60 * 60 * 1000);
        const narrowed = hourlyActivity.filter((entry) => {
            const parsed = new Date(entry.hour).getTime();
            return Number.isFinite(parsed) && parsed >= cutoff;
        });
        return narrowed.length > 0 ? narrowed : hourlyActivity;
    }, [stats?.hourlyActivity, windowHours]);

    const peakHour = filteredActivity.reduce((best, current) => {
        if (!best || (current.users || 0) > (best.users || 0)) return current;
        return best;
    }, null);

    const filteredSessions = useMemo(() => {
        if (!search) return activeSessions;
        const query = search.toLowerCase();
        return activeSessions.filter((session) =>
            session.roblox_user?.toLowerCase().includes(query)
            || session.roblox_userid?.toLowerCase().includes(query)
            || session.script_name?.toLowerCase().includes(query)
            || session.executor?.toLowerCase().includes(query));
    }, [activeSessions, search]);

    const hottestFinderServer = useMemo(() => finderServers.reduce((best, current) => {
        const bestValue = best?.brainrots?.[0]?.moneyPerSec || 0;
        const currentValue = current?.brainrots?.[0]?.moneyPerSec || 0;
        return currentValue > bestValue ? current : best;
    }, null), [finderServers]);

    const lineChartConfig = useMemo(() => {
        const labels = filteredActivity.map((entry) => formatHourLabel(entry.hour));
        const values = filteredActivity.map((entry) => entry.users || 0);
        const maxValue = values.length ? Math.max(...values) : 0;

        return {
            data: {
                labels,
                datasets: [
                    {
                        label: 'Connections',
                        data: values,
                        borderColor: '#111827',
                        backgroundColor: (context) => {
                            const chart = context.chart;
                            const { ctx, chartArea } = chart;
                            if (!chartArea) return 'rgba(17, 24, 39, 0.08)';
                            const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                            gradient.addColorStop(0, 'rgba(17, 24, 39, 0.16)');
                            gradient.addColorStop(1, 'rgba(17, 24, 39, 0.02)');
                            return gradient;
                        },
                        fill: true,
                        tension: 0.35,
                        pointRadius: 0,
                        pointHoverRadius: 4,
                        pointBackgroundColor: '#111827',
                        pointBorderWidth: 0,
                        borderWidth: 2.5,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(17, 24, 39, 0.96)',
                        titleColor: '#ffffff',
                        bodyColor: '#ffffff',
                        padding: 12,
                        displayColors: false,
                        callbacks: {
                            label: (context) => `Players: ${context.parsed.y}`,
                        },
                    },
                },
                scales: {
                    x: {
                        grid: { display: false },
                        border: { display: false },
                        ticks: {
                            color: '#9ca3af',
                            maxTicksLimit: 7,
                            font: { size: 11 },
                        },
                    },
                    y: {
                        beginAtZero: true,
                        border: { display: false },
                        suggestedMax: maxValue ? Math.ceil(maxValue * 1.2) : 4,
                        ticks: {
                            color: '#9ca3af',
                            precision: 0,
                            font: { size: 11 },
                        },
                        grid: {
                            color: 'rgba(229, 231, 235, 1)',
                        },
                    },
                },
            },
        };
    }, [filteredActivity]);

    const doughnutConfig = useMemo(() => {
        const topScripts = activePerScript.slice(0, 5);
        return {
            data: {
                labels: topScripts.map((script) => script.name),
                datasets: [
                    {
                        data: topScripts.map((script) => script.active_users || 0),
                        backgroundColor: ['#18181b', '#52525b', '#a1a1aa', '#f59e0b', '#fcd34d'],
                        borderColor: '#ffffff',
                        borderWidth: 3,
                        hoverOffset: 4,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '58%',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(17, 24, 39, 0.96)',
                        titleColor: '#ffffff',
                        bodyColor: '#ffffff',
                        padding: 12,
                    },
                },
            },
        };
    }, [activePerScript]);

    const statCards = [
        { label: 'Current players connected', value: totalActive, icon: SignalHigh },
        { label: 'Daily connections', value: last24h, icon: CalendarDays },
        { label: 'Unique users', value: uniqueUsers, icon: UsersRound },
        { label: 'Total sessions', value: totalSessions, icon: Clock3 },
    ];

    const rangeButtons = [
        { label: '6H', value: 6 },
        { label: '12H', value: 12 },
        { label: '24H', value: 24 },
    ];

    return (
        <div className="space-y-6">
            <section className="grid gap-4 xl:grid-cols-4">
                {statCards.map((card) => (
                    <article key={card.label} className="panel p-5">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="section-kicker">{card.label}</p>
                                <p className="mt-4 text-[2.2rem] font-semibold tracking-[-0.05em] text-zinc-950">{compact(card.value)}</p>
                            </div>
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700">
                                <card.icon className="h-5 w-5" />
                            </div>
                        </div>
                    </article>
                ))}
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.55fr_0.95fr]">
                <article className="panel p-5 sm:p-6">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                            <p className="section-kicker">Connections</p>
                            <h3 className="section-title mt-2 text-3xl font-semibold text-zinc-950">Realtime trend</h3>
                            <p className="mt-2 text-sm text-zinc-500">Hourly connection buckets from the panel backend.</p>
                        </div>
                        <div className="inline-flex rounded-2xl border border-zinc-200 bg-zinc-50 p-1">
                            {rangeButtons.map((button) => (
                                <button
                                    key={button.value}
                                    type="button"
                                    onClick={() => setWindowHours(button.value)}
                                    className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                                        windowHours === button.value ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-950'
                                    }`}
                                >
                                    {button.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="mt-6 h-[320px]">
                        <Line data={lineChartConfig.data} options={lineChartConfig.options} />
                    </div>
                </article>

                <article className="panel p-5 sm:p-6">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <p className="section-kicker">Script Share</p>
                            <h3 className="section-title mt-2 text-3xl font-semibold text-zinc-950">Users by script</h3>
                        </div>
                        <div className="badge">{activePerScript.length} active scripts</div>
                    </div>

                    <div className="mt-6 grid gap-5 lg:grid-cols-[230px_minmax(0,1fr)] xl:grid-cols-1 2xl:grid-cols-[230px_minmax(0,1fr)]">
                        <div className="mx-auto h-[230px] w-full max-w-[230px]">
                            {activePerScript.length > 0 ? (
                                <Doughnut data={doughnutConfig.data} options={doughnutConfig.options} />
                            ) : (
                                <div className="card flex h-full items-center justify-center border-dashed text-center text-sm text-zinc-500">
                                    Waiting for script activity
                                </div>
                            )}
                        </div>

                        <div className="space-y-3">
                            {activePerScript.slice(0, 5).map((script) => (
                                <div key={script.slug} className="card surface-soft px-4 py-3">
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="min-w-0">
                                            <p className="truncate font-medium text-zinc-950">{script.name}</p>
                                            <p className="mt-1 truncate text-xs text-zinc-400">{script.slug}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xl font-semibold text-zinc-950">{script.active_users || 0}</p>
                                            <p className="text-xs text-zinc-400">active</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {activePerScript.length === 0 && (
                                <div className="card border-dashed px-4 py-6 text-sm text-zinc-500">
                                    Script distribution appears once clients start posting heartbeats.
                                </div>
                            )}
                        </div>
                    </div>
                </article>
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                <article className="panel p-5 sm:p-6">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <p className="section-kicker">Finder</p>
                            <h3 className="section-title mt-2 text-3xl font-semibold text-zinc-950">Active under-7 servers</h3>
                            <p className="mt-2 text-sm text-zinc-500">Entries expire after 25 seconds unless a new report lands.</p>
                        </div>
                        <div className="flex items-center gap-2 rounded-2xl bg-zinc-100 px-4 py-2 text-sm text-zinc-500">
                            <Radar className="h-4 w-4" />
                            {finderServers.length} visible
                        </div>
                    </div>

                    <div className="mt-6 space-y-4">
                        {finderServers.length === 0 && (
                            <div className="card border-dashed px-4 py-6 text-sm text-zinc-500">
                                No eligible finder servers have reported fresh brainrots in the last 25 seconds.
                            </div>
                        )}

                        {finderServers.map((server) => (
                            <div key={`${server.script}-${server.serverJobId}`} className="card p-4">
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="badge">{server.playerCount || 0}/7 threshold</span>
                                            <span className="badge">{timeSince(server.lastSeen)}</span>
                                            <span className="badge">{server.reportedByUser || 'Anonymous scout'}</span>
                                        </div>
                                        <p className="mt-4 text-lg font-medium text-zinc-950">{server.serverJobId}</p>
                                        <p className="mt-1 text-sm text-zinc-400">Place {server.placeId || '--'}</p>
                                    </div>

                                    <button type="button" onClick={() => openRobloxJoin(server)} className="btn btn-dark">
                                        <ExternalLink className="h-4 w-4" />
                                        Join
                                    </button>
                                </div>

                                <div className="mt-4 flex flex-wrap gap-2">
                                    {server.brainrots.map((brainrot) => (
                                        <span key={brainrot.key} className="finder-chip">
                                            <span className="font-medium text-zinc-950">{brainrot.name}</span>
                                            <span className="text-zinc-400">{formatMoneyPerSec(brainrot.moneyPerSec)}</span>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </article>

                <article className="panel p-5 sm:p-6">
                    <p className="section-kicker">Snapshot</p>
                    <h3 className="section-title mt-2 text-3xl font-semibold text-zinc-950">Finder pulse</h3>

                    <div className="mt-6 space-y-4">
                        <div className="card surface-soft p-4">
                            <p className="text-sm text-zinc-500">Servers visible</p>
                            <p className="mt-2 text-3xl font-semibold text-zinc-950">{finderServers.length}</p>
                        </div>
                        <div className="card surface-soft p-4">
                            <p className="text-sm text-zinc-500">Best reported brainrot</p>
                            <p className="mt-2 text-xl font-semibold text-zinc-950">{hottestFinderServer?.brainrots?.[0]?.name || 'None'}</p>
                            <p className="mt-2 text-sm text-zinc-400">
                                {hottestFinderServer?.brainrots?.[0]
                                    ? formatMoneyPerSec(hottestFinderServer.brainrots[0].moneyPerSec)
                                    : 'Waiting for feed'}
                            </p>
                        </div>
                        <div className="card surface-soft p-4">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-zinc-500">Feed state</span>
                                <div className={`badge ${connected ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                                    <div className={`status-dot ${connected ? 'live' : 'offline'}`} />
                                    {connected ? 'Live' : 'Offline'}
                                </div>
                            </div>
                            <p className="mt-4 text-xl font-semibold text-zinc-950">{finderServers[0]?.reportedByUser || '--'}</p>
                            <p className="mt-2 text-sm text-zinc-400">
                                {finderServers[0] ? `${finderServers[0].playerCount || 0}/7 threshold` : 'No active scout'}
                            </p>
                        </div>
                        <div className="card surface-soft p-4">
                            <p className="text-sm text-zinc-500">Peak bucket</p>
                            <p className="mt-2 text-xl font-semibold text-zinc-950">{peakHour ? compact(peakHour.users) : '--'}</p>
                            <p className="mt-2 text-sm text-zinc-400">{peakHour ? formatHourLabel(peakHour.hour) : 'No data'}</p>
                        </div>
                    </div>
                </article>
            </section>

            <section className="panel p-5 sm:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <p className="section-kicker">Live Roster</p>
                        <h3 className="section-title mt-2 text-3xl font-semibold text-zinc-950">Active players</h3>
                    </div>
                    <label className="relative block w-full max-w-sm">
                        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                        <input
                            type="text"
                            placeholder="Search username, id, script, executor"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            className="input pl-10"
                        />
                    </label>
                </div>

                <div className="list-scroll mt-6 overflow-auto rounded-[20px] border border-zinc-200 bg-white">
                    <table className="table min-w-[860px]">
                        <thead>
                            <tr>
                                <th>User</th>
                                <th>Script</th>
                                <th>Executor</th>
                                <th>Last seen</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredSessions.length === 0 ? (
                                <tr>
                                    <td colSpan="4" className="px-4 py-12 text-center text-zinc-500">
                                        {search ? 'No active session matched that query.' : 'No active users are reporting yet.'}
                                    </td>
                                </tr>
                            ) : (
                                filteredSessions.map((session) => (
                                    <tr key={session.id}>
                                        <td>
                                            <div className="flex items-center gap-3">
                                                <div className="status-dot live" />
                                                <div className="min-w-0">
                                                    <p className="truncate font-medium text-zinc-950">{session.roblox_user}</p>
                                                    <p className="mt-1 text-xs text-zinc-400">#{session.roblox_userid}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <p className="font-medium text-zinc-950">{session.script_name}</p>
                                            <p className="mt-1 text-xs text-zinc-400">{session.script_slug}</p>
                                        </td>
                                        <td>
                                            <span className="badge">{session.executor || 'Unknown'}</span>
                                        </td>
                                        <td className="text-zinc-500">{timeSince(session.last_heartbeat)}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}
