import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { CalendarDays, Clock3, ExternalLink, Search, SignalHigh, UsersRound, Waves, CodeXml, Radar } from 'lucide-react';
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
            || session.executor?.toLowerCase().includes(query)
        );
    }, [activeSessions, search]);

    const hottestFinderServer = useMemo(() => {
        return finderServers.reduce((best, current) => {
            const bestValue = best?.brainrots?.[0]?.moneyPerSec || 0;
            const currentValue = current?.brainrots?.[0]?.moneyPerSec || 0;
            return currentValue > bestValue ? current : best;
        }, null);
    }, [finderServers]);

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
                        borderColor: '#26c281',
                        backgroundColor: (context) => {
                            const chart = context.chart;
                            const { ctx, chartArea } = chart;
                            if (!chartArea) return 'rgba(38, 194, 129, 0.15)';
                            const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                            gradient.addColorStop(0, 'rgba(38, 194, 129, 0.26)');
                            gradient.addColorStop(1, 'rgba(38, 194, 129, 0.02)');
                            return gradient;
                        },
                        fill: true,
                        tension: 0.35,
                        pointRadius: 0,
                        pointHoverRadius: 4,
                        pointBackgroundColor: '#26c281',
                        pointBorderWidth: 0,
                        borderWidth: 3,
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
                        backgroundColor: 'rgba(18, 26, 45, 0.96)',
                        borderColor: 'rgba(255, 255, 255, 0.08)',
                        borderWidth: 1,
                        titleColor: '#f6f8ff',
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
                            color: '#9aa4b7',
                            maxTicksLimit: 7,
                            font: { size: 11, family: 'JetBrains Mono' },
                        },
                    },
                    y: {
                        beginAtZero: true,
                        border: { display: false },
                        suggestedMax: maxValue ? Math.ceil(maxValue * 1.2) : 4,
                        ticks: {
                            color: '#9aa4b7',
                            precision: 0,
                            font: { size: 11, family: 'JetBrains Mono' },
                        },
                        grid: {
                            color: 'rgba(18, 26, 45, 0.06)',
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
                        backgroundColor: ['#2ac25f', '#21b6a8', '#7cc80d', '#5f85ff', '#f4b740'],
                        borderColor: '#ffffff',
                        borderWidth: 2,
                        hoverOffset: 4,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '0%',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(18, 26, 45, 0.96)',
                        borderColor: 'rgba(255, 255, 255, 0.08)',
                        borderWidth: 1,
                        titleColor: '#f6f8ff',
                        bodyColor: '#ffffff',
                        padding: 12,
                    },
                },
            },
        };
    }, [activePerScript]);

    const statCards = [
        {
            label: 'Current players connected',
            value: totalActive,
            icon: SignalHigh,
            accent: 'bg-emerald-100 text-emerald-600',
        },
        {
            label: 'Daily connections',
            value: last24h,
            icon: CalendarDays,
            accent: 'bg-emerald-100 text-emerald-600',
        },
        {
            label: 'Unique users',
            value: uniqueUsers,
            icon: UsersRound,
            accent: 'bg-emerald-100 text-emerald-600',
        },
        {
            label: 'Total sessions',
            value: totalSessions,
            icon: Clock3,
            accent: 'bg-emerald-100 text-emerald-600',
        },
    ];

    const rangeButtons = [
        { label: '6H', value: 6 },
        { label: '12H', value: 12 },
        { label: '24H', value: 24 },
    ];

    return (
        <div className="space-y-5">
            <section className="grid gap-4 xl:grid-cols-4">
                {statCards.map((card) => (
                    <div key={card.label} className="panel-card panel-ring rounded-[26px] p-4 sm:p-5">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-sm text-panel-text-dim">{card.label}</p>
                                <p className="mt-5 text-[2.2rem] font-extrabold leading-none">{compact(card.value)}</p>
                            </div>
                            <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${card.accent}`}>
                                <card.icon className="h-5 w-5" />
                            </div>
                        </div>
                    </div>
                ))}
            </section>

            <section className="grid gap-5 xl:grid-cols-[1.55fr_0.95fr]">
                <div className="panel-card panel-ring rounded-[28px] p-5 sm:p-6">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                            <p className="panel-mono text-[11px] uppercase tracking-[0.28em] text-panel-text-muted">Current Connection Graph</p>
                            <h2 className="panel-title mt-2 text-[2rem] font-extrabold leading-none">Connections trend</h2>
                        </div>
                        <div className="inline-flex rounded-2xl border border-panel-border bg-panel-bg-soft p-1">
                            {rangeButtons.map((button) => (
                                <button
                                    key={button.value}
                                    type="button"
                                    onClick={() => setWindowHours(button.value)}
                                    className={`rounded-xl px-3 py-2 panel-mono text-xs font-semibold transition ${
                                        windowHours === button.value
                                            ? 'bg-panel-secondary text-white shadow-[0_10px_24px_rgba(38,194,129,0.24)]'
                                            : 'text-panel-text-dim hover:text-panel-text'
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
                </div>

                <div className="panel-card panel-ring rounded-[28px] p-5 sm:p-6">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <p className="panel-mono text-[11px] uppercase tracking-[0.28em] text-panel-text-muted">Scripts Connected</p>
                            <h2 className="panel-title mt-2 text-[2rem] font-extrabold leading-none">Players by script</h2>
                        </div>
                        <CodeXml className="h-4 w-4 text-panel-text-muted" />
                    </div>

                    <div className="mt-6 grid gap-5 lg:grid-cols-[0.95fr_1.05fr] xl:grid-cols-1 2xl:grid-cols-[0.95fr_1.05fr]">
                        <div className="mx-auto h-[230px] w-full max-w-[230px]">
                            {activePerScript.length > 0 ? (
                                <Doughnut data={doughnutConfig.data} options={doughnutConfig.options} />
                            ) : (
                                <div className="flex h-full items-center justify-center rounded-[22px] border border-dashed border-panel-border text-center text-sm text-panel-text-muted">
                                    Waiting for script activity
                                </div>
                            )}
                        </div>

                        <div className="space-y-3">
                            {activePerScript.slice(0, 4).map((script, index) => (
                                <div key={script.slug} className="rounded-[22px] border border-panel-border bg-panel-bg-soft px-4 py-3">
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="min-w-0">
                                            <p className="font-semibold">{script.name}</p>
                                            <p className="panel-mono mt-1 text-xs text-panel-text-muted">{script.slug}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-lg font-bold">{script.active_users || 0}</p>
                                            <p className="text-xs text-panel-text-muted">active</p>
                                        </div>
                                    </div>
                                    <div className="mt-3 flex items-center gap-2 text-xs text-panel-text-muted">
                                        <span className="panel-mono">0{index + 1}</span>
                                        <div className="h-px flex-1 bg-panel-border" />
                                        <span>{totalActive ? `${Math.round(((script.active_users || 0) / totalActive) * 100)}% of live load` : 'No live load'}</span>
                                    </div>
                                </div>
                            ))}
                            {activePerScript.length === 0 && (
                                <div className="rounded-[22px] border border-dashed border-panel-border px-4 py-6 text-sm text-panel-text-muted">
                                    Script composition will appear once clients start posting heartbeats.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </section>

            <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
                <div className="panel-card panel-ring rounded-[28px] p-5 sm:p-6">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <p className="panel-mono text-[11px] uppercase tracking-[0.28em] text-panel-text-muted">SAB Finder</p>
                            <h2 className="panel-title mt-2 text-[2rem] font-extrabold leading-none">Active under-6 servers</h2>
                        </div>
                        <Radar className="h-4 w-4 text-panel-text-muted" />
                    </div>

                    <div className="mt-6 space-y-4">
                        {finderServers.length === 0 && (
                            <div className="rounded-[22px] border border-dashed border-panel-border px-4 py-6 text-sm text-panel-text-muted">
                                No eligible finder servers have reported fresh brainrots in the last 30 seconds.
                            </div>
                        )}

                        {finderServers.map((server) => (
                            <div key={`${server.script}-${server.serverJobId}`} className="rounded-[24px] border border-panel-border bg-panel-bg-soft p-4">
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="rounded-full bg-white px-3 py-1 panel-mono text-[11px] text-panel-text-muted shadow-[0_8px_20px_rgba(91,104,136,0.08)]">
                                                {server.playerCount || 0}/6 players
                                            </span>
                                            <span className="rounded-full bg-white px-3 py-1 panel-mono text-[11px] text-panel-text-muted shadow-[0_8px_20px_rgba(91,104,136,0.08)]">
                                                {timeSince(server.lastSeen)}
                                            </span>
                                        </div>
                                        <p className="mt-3 text-lg font-bold">{server.reportedByUser || 'Anonymous scout'}</p>
                                        <p className="panel-mono mt-1 truncate text-xs text-panel-text-muted">{server.serverJobId}</p>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => openRobloxJoin(server)}
                                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#0d1833] px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_34px_rgba(13,24,51,0.18)] transition hover:translate-y-[-1px]"
                                    >
                                        <ExternalLink className="h-4 w-4" />
                                        Join
                                    </button>
                                </div>

                                <div className="mt-4 flex flex-wrap gap-2">
                                    {server.brainrots.map((brainrot) => (
                                        <span
                                            key={brainrot.key}
                                            className="inline-flex items-center gap-2 rounded-full border border-panel-border bg-white px-3 py-2 text-xs text-panel-text shadow-[0_8px_20px_rgba(91,104,136,0.05)]"
                                        >
                                            <span className="font-semibold">{brainrot.name}</span>
                                            <span className="panel-mono text-panel-text-muted">{formatMoneyPerSec(brainrot.moneyPerSec)}</span>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="panel-card panel-ring rounded-[28px] p-5 sm:p-6">
                    <p className="panel-mono text-[11px] uppercase tracking-[0.28em] text-panel-text-muted">Finder Pulse</p>
                    <h2 className="panel-title mt-2 text-[2rem] font-extrabold leading-none">Hot server snapshot</h2>

                    <div className="mt-6 space-y-4">
                        <div className="rounded-[22px] bg-panel-bg-soft p-4">
                            <p className="text-sm text-panel-text-dim">Servers visible</p>
                            <p className="mt-2 text-3xl font-extrabold">{finderServers.length}</p>
                        </div>

                        <div className="rounded-[22px] bg-panel-bg-soft p-4">
                            <p className="text-sm text-panel-text-dim">Best currently reported brainrot</p>
                            <p className="mt-2 text-xl font-extrabold">
                                {hottestFinderServer?.brainrots?.[0]?.name || 'None'}
                            </p>
                            <p className="mt-2 text-sm text-panel-text-muted">
                                {hottestFinderServer?.brainrots?.[0]
                                    ? formatMoneyPerSec(hottestFinderServer.brainrots[0].moneyPerSec)
                                    : 'Waiting for feed'}
                            </p>
                        </div>

                        <div className="rounded-[22px] bg-panel-bg-soft p-4">
                            <p className="text-sm text-panel-text-dim">Latest scout</p>
                            <p className="mt-2 text-xl font-extrabold">{finderServers[0]?.reportedByUser || '--'}</p>
                            <p className="mt-2 text-sm text-panel-text-muted">
                                {finderServers[0] ? `${finderServers[0].playerCount || 0}/6 players` : 'No active scout'}
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            <section className="grid gap-5 xl:grid-cols-[1.18fr_0.82fr]">
                <div className="panel-card panel-ring rounded-[28px] p-5 sm:p-6">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                            <p className="panel-mono text-[11px] uppercase tracking-[0.28em] text-panel-text-muted">Live Roster</p>
                            <h2 className="panel-title mt-2 text-[2rem] font-extrabold leading-none">Active players</h2>
                        </div>
                        <label className="relative block w-full max-w-sm">
                            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-panel-text-muted" />
                            <input
                                type="text"
                                placeholder="Search..."
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                className="w-full rounded-2xl border border-panel-border bg-panel-bg-soft py-3 pl-11 pr-4 text-sm text-panel-text outline-none transition focus:border-[#0d1833]/14"
                            />
                        </label>
                    </div>

                    <div className="mt-6 max-h-[540px] overflow-auto rounded-[22px] border border-panel-border bg-white">
                        <div className="min-w-[860px]">
                            <div className="sticky top-0 z-10 grid grid-cols-[2fr_1.1fr_0.8fr_0.8fr] gap-4 border-b border-panel-border bg-white px-4 py-3 panel-mono text-[11px] uppercase tracking-[0.22em] text-panel-text-muted">
                                <span>User</span>
                                <span>Script</span>
                                <span>Executor</span>
                                <span>Last seen</span>
                            </div>

                            {filteredSessions.length === 0 ? (
                                <div className="px-4 py-12 text-center text-panel-text-muted">
                                    {search ? 'No active session matched that query.' : 'No active users are reporting yet.'}
                                </div>
                            ) : (
                                filteredSessions.map((session) => (
                                    <div
                                        key={session.id}
                                        className="grid grid-cols-[2fr_1.1fr_0.8fr_0.8fr] gap-4 border-b border-panel-border/80 px-4 py-4 transition hover:bg-panel-bg-soft"
                                    >
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-3">
                                                <span className="relative flex h-2.5 w-2.5">
                                                    <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-40 animate-panel-pulse" />
                                                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                                                </span>
                                                <div className="min-w-0">
                                                    <p className="truncate font-semibold">{session.roblox_user}</p>
                                                    <p className="panel-mono truncate text-xs text-panel-text-muted">#{session.roblox_userid}</p>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="min-w-0">
                                            <p className="truncate font-semibold text-[#6c3cff]">{session.script_name}</p>
                                            <p className="panel-mono truncate text-xs text-panel-text-muted">{session.script_slug}</p>
                                        </div>
                                        <div className="min-w-0">
                                            <span className="inline-flex rounded-full bg-panel-bg-soft px-3 py-1 text-xs font-medium text-panel-text-dim">
                                                {session.executor || 'Unknown'}
                                            </span>
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-medium">{timeSince(session.last_heartbeat)}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                <div className="panel-card panel-ring rounded-[28px] p-5 sm:p-6">
                    <p className="panel-mono text-[11px] uppercase tracking-[0.28em] text-panel-text-muted">Snapshot</p>
                    <h2 className="panel-title mt-2 text-[2rem] font-extrabold leading-none">Room health</h2>

                    <div className="mt-6 space-y-4">
                        <div className="rounded-[22px] bg-panel-bg-soft p-4">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-panel-text-dim">Socket state</span>
                                <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                                    connected ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                                }`}>
                                    <Waves className="h-3.5 w-3.5" />
                                    {connected ? 'Live' : 'Offline'}
                                </div>
                            </div>
                        </div>

                        <div className="rounded-[22px] bg-panel-bg-soft p-4">
                            <div className="flex items-center justify-between gap-4">
                                <div>
                                    <p className="text-sm text-panel-text-dim">Peak today</p>
                                    <p className="mt-2 text-3xl font-extrabold">{peakHour ? compact(peakHour.users) : '--'}</p>
                                </div>
                                <div className="text-right">
                                    <p className="panel-mono text-[11px] uppercase tracking-[0.18em] text-panel-text-muted">Peak bucket</p>
                                    <p className="mt-2 text-sm font-semibold">{peakHour ? formatHourLabel(peakHour.hour) : 'No data'}</p>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-[22px] bg-panel-bg-soft p-4">
                            <p className="text-sm text-panel-text-dim">Connected scripts</p>
                            <div className="mt-4 space-y-3">
                                {activePerScript.slice(0, 6).map((script) => (
                                    <div key={script.slug} className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 shadow-[0_10px_24px_rgba(91,104,136,0.05)]">
                                        <div>
                                            <p className="font-semibold">{script.name}</p>
                                            <p className="panel-mono text-xs text-panel-text-muted">{script.slug}</p>
                                        </div>
                                        <span className="text-sm font-bold">{script.active_users || 0}</span>
                                    </div>
                                ))}
                                {activePerScript.length === 0 && (
                                    <div className="rounded-2xl border border-dashed border-panel-border px-4 py-6 text-sm text-panel-text-muted">
                                        No script activity yet.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
