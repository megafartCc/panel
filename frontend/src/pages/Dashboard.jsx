import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Activity, Clock3, Search, Shield, Sparkles, TrendingUp, UserRound, Radar } from 'lucide-react';
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
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric' }).format(date);
}

export default function Dashboard() {
    const { sessions, stats, connected } = useOutletContext();
    const [search, setSearch] = useState('');

    const activeSessions = sessions || [];
    const perScript = stats?.perScript || [];
    const hourlyActivity = stats?.hourlyActivity || [];
    const totalActive = stats?.totalActive || activeSessions.length || 0;
    const totalSessions = stats?.totalSessions || 0;
    const uniqueUsers = stats?.uniqueUsers || 0;
    const last24h = stats?.last24h || 0;
    const activePerScript = perScript.filter((script) => (script.active_users || 0) > 0);
    const peakHour = hourlyActivity.reduce((best, current) => {
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

    const lineChartConfig = useMemo(() => {
        const labels = hourlyActivity.map((entry) => formatHourLabel(entry.hour));
        const values = hourlyActivity.map((entry) => entry.users || 0);
        const maxValue = values.length ? Math.max(...values) : 0;

        return {
            data: {
                labels,
                datasets: [
                    {
                        label: 'Distinct active sessions',
                        data: values,
                        borderColor: '#ff7b61',
                        backgroundColor: (context) => {
                            const chart = context.chart;
                            const { ctx, chartArea } = chart;
                            if (!chartArea) return 'rgba(255, 123, 97, 0.18)';
                            const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                            gradient.addColorStop(0, 'rgba(255, 123, 97, 0.35)');
                            gradient.addColorStop(0.45, 'rgba(103, 184, 255, 0.18)');
                            gradient.addColorStop(1, 'rgba(103, 184, 255, 0.02)');
                            return gradient;
                        },
                        fill: true,
                        tension: 0.34,
                        pointRadius: 0,
                        pointHoverRadius: 5,
                        pointBackgroundColor: '#fff2e8',
                        pointBorderWidth: 2,
                        pointBorderColor: '#ff7b61',
                        borderWidth: 2.4,
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
                        backgroundColor: 'rgba(7, 17, 31, 0.96)',
                        borderColor: 'rgba(173, 192, 255, 0.18)',
                        borderWidth: 1,
                        titleColor: '#dfe9ff',
                        bodyColor: '#ffffff',
                        padding: 12,
                        displayColors: false,
                        callbacks: {
                            label: (context) => `Users: ${context.parsed.y}`,
                        },
                    },
                },
                scales: {
                    x: {
                        grid: { display: false },
                        border: { display: false },
                        ticks: {
                            color: '#7f95b8',
                            maxTicksLimit: 8,
                            font: { size: 11, family: 'IBM Plex Mono' },
                        },
                    },
                    y: {
                        beginAtZero: true,
                        border: { display: false },
                        suggestedMax: maxValue ? Math.ceil(maxValue * 1.2) : 4,
                        ticks: {
                            color: '#7f95b8',
                            precision: 0,
                            font: { size: 11, family: 'IBM Plex Mono' },
                        },
                        grid: {
                            color: 'rgba(173, 192, 255, 0.08)',
                        },
                    },
                },
            },
        };
    }, [hourlyActivity]);

    const doughnutConfig = useMemo(() => {
        const topScripts = activePerScript.slice(0, 5);
        return {
            data: {
                labels: topScripts.map((script) => script.name),
                datasets: [
                    {
                        data: topScripts.map((script) => script.active_users || 0),
                        backgroundColor: ['#ff7b61', '#67b8ff', '#6ee7d8', '#ffba49', '#9ea9ff'],
                        borderColor: '#08111f',
                        borderWidth: 4,
                        hoverOffset: 6,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '72%',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(7, 17, 31, 0.96)',
                        borderColor: 'rgba(173, 192, 255, 0.18)',
                        borderWidth: 1,
                        titleColor: '#dfe9ff',
                        bodyColor: '#ffffff',
                        padding: 12,
                    },
                },
            },
        };
    }, [activePerScript]);

    const statCards = [
        {
            label: 'Live sessions',
            value: totalActive,
            helper: connected ? 'Current heartbeat responders' : 'Backend currently disconnected',
            icon: Radar,
            tone: 'from-[#ff7b61]/25 to-[#ffba49]/10',
        },
        {
            label: 'Unique users',
            value: uniqueUsers,
            helper: 'Distinct Roblox ids observed',
            icon: UserRound,
            tone: 'from-[#67b8ff]/24 to-[#67b8ff]/4',
        },
        {
            label: '24h joins',
            value: last24h,
            helper: 'Sessions first seen in the last day',
            icon: Sparkles,
            tone: 'from-[#6ee7d8]/24 to-[#6ee7d8]/4',
        },
        {
            label: 'Total sessions',
            value: totalSessions,
            helper: peakHour ? `Peak hour ${formatHourLabel(peakHour.hour)} with ${peakHour.users}` : 'No peak yet',
            icon: TrendingUp,
            tone: 'from-[#9ea9ff]/20 to-[#9ea9ff]/4',
        },
    ];

    return (
        <div className="space-y-5">
            <section className="panel-card panel-ring overflow-hidden rounded-[28px]">
                <div className="grid gap-6 px-5 py-6 sm:px-6 xl:grid-cols-[1.35fr_0.95fr] xl:px-8 xl:py-8">
                    <div className="space-y-6">
                        <div className="space-y-3">
                            <p className="panel-mono text-[11px] uppercase tracking-[0.34em] text-panel-text-muted">
                                Mission feed
                            </p>
                            <h1 className="panel-title max-w-3xl text-3xl font-bold sm:text-4xl">
                                Watch live clients, script spread, and operator health from one surface.
                            </h1>
                            <p className="max-w-2xl text-sm leading-7 text-panel-text-dim sm:text-base">
                                The backend is already feeding enough signal. This view turns it into a usable control room instead
                                of a pile of cards and a lonely line graph.
                            </p>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
                            {statCards.map((card) => (
                                <div key={card.label} className="rounded-[24px] border border-panel-border bg-white/[0.035] p-4">
                                    <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${card.tone}`}>
                                        <card.icon className="h-5 w-5 text-white" />
                                    </div>
                                    <p className="text-sm text-panel-text-dim">{card.label}</p>
                                    <p className="mt-2 text-3xl font-semibold">{compact(card.value)}</p>
                                    <p className="mt-2 text-xs leading-5 text-panel-text-muted">{card.helper}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="panel-card-strong animate-panel-float rounded-[28px] px-5 py-5 sm:px-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="panel-mono text-[11px] uppercase tracking-[0.3em] text-panel-text-muted">Operator summary</p>
                                <h2 className="mt-2 text-xl font-semibold">Live pressure</h2>
                            </div>
                            <div className={`rounded-full border px-3 py-1.5 panel-mono text-[11px] uppercase tracking-[0.22em] ${
                                connected ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' : 'border-red-400/25 bg-red-400/10 text-red-300'
                            }`}>
                                {connected ? 'Live' : 'Offline'}
                            </div>
                        </div>

                        <div className="mt-6 space-y-4">
                            <div className="rounded-[22px] border border-panel-border bg-white/[0.04] p-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-panel-text-dim">Peak activity hour</span>
                                    <Clock3 className="h-4 w-4 text-panel-text-muted" />
                                </div>
                                <div className="mt-3 flex items-end justify-between gap-4">
                                    <div>
                                        <p className="text-3xl font-semibold">{peakHour ? formatHourLabel(peakHour.hour) : '--'}</p>
                                        <p className="mt-1 text-xs text-panel-text-muted">
                                            {peakHour ? `${peakHour.users} active sessions in that hour bucket` : 'Waiting for more signal'}
                                        </p>
                                    </div>
                                    <div className="rounded-2xl bg-[linear-gradient(135deg,_rgba(255,107,87,0.16),_rgba(103,184,255,0.12))] px-3 py-2 panel-mono text-xs text-panel-text-dim">
                                        24h feed
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-[22px] border border-panel-border bg-white/[0.04] p-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-panel-text-dim">Top script saturation</span>
                                    <Shield className="h-4 w-4 text-panel-text-muted" />
                                </div>
                                <div className="mt-4 space-y-3">
                                    {activePerScript.slice(0, 4).map((script, index) => (
                                        <div key={script.slug} className="flex items-center gap-3">
                                            <div className="panel-mono flex h-8 w-8 items-center justify-center rounded-xl border border-panel-border bg-white/[0.04] text-[11px] text-panel-text-muted">
                                                0{index + 1}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center justify-between gap-3">
                                                    <span className="truncate font-medium">{script.name}</span>
                                                    <span className="panel-mono text-xs text-panel-text-muted">{script.active_users || 0}</span>
                                                </div>
                                                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                                                    <div
                                                        className="h-full rounded-full bg-[linear-gradient(90deg,_#ff7b61,_#67b8ff)]"
                                                        style={{
                                                            width: `${Math.max(8, totalActive ? ((script.active_users || 0) / totalActive) * 100 : 0)}%`,
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {activePerScript.length === 0 && (
                                        <p className="text-sm text-panel-text-muted">No scripts are reporting yet.</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section className="grid gap-5 xl:grid-cols-[1.45fr_0.95fr]">
                <div className="panel-card panel-ring rounded-[28px] p-5 sm:p-6">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <p className="panel-mono text-[11px] uppercase tracking-[0.3em] text-panel-text-muted">Traffic arc</p>
                            <h2 className="mt-2 text-xl font-semibold">Distinct active sessions over the last 24 hours</h2>
                        </div>
                        <div className="rounded-2xl border border-panel-border bg-white/[0.04] px-4 py-2">
                            <p className="panel-mono text-[10px] uppercase tracking-[0.26em] text-panel-text-muted">Current</p>
                            <p className="mt-1 text-lg font-semibold">{compact(totalActive)}</p>
                        </div>
                    </div>
                    <div className="mt-6 h-[320px]">
                        <Line data={lineChartConfig.data} options={lineChartConfig.options} />
                    </div>
                </div>

                <div className="panel-card panel-ring rounded-[28px] p-5 sm:p-6">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <p className="panel-mono text-[11px] uppercase tracking-[0.3em] text-panel-text-muted">Composition</p>
                            <h2 className="mt-2 text-xl font-semibold">Session load by script</h2>
                        </div>
                        <div className="rounded-full border border-panel-border px-3 py-1 panel-mono text-[11px] uppercase tracking-[0.22em] text-panel-text-muted">
                            Top 5
                        </div>
                    </div>
                    <div className="mt-6 grid gap-6 lg:grid-cols-[0.88fr_1.12fr] xl:grid-cols-1 2xl:grid-cols-[0.88fr_1.12fr]">
                        <div className="mx-auto h-[220px] w-full max-w-[220px]">
                            {activePerScript.length > 0 ? (
                                <Doughnut data={doughnutConfig.data} options={doughnutConfig.options} />
                            ) : (
                                <div className="flex h-full items-center justify-center rounded-[22px] border border-dashed border-panel-border text-center text-sm text-panel-text-muted">
                                    Waiting for script activity
                                </div>
                            )}
                        </div>
                        <div className="max-h-[320px] space-y-3 overflow-y-auto pr-1">
                            {activePerScript.slice(0, 5).map((script, index) => (
                                <div key={script.slug} className="rounded-[22px] border border-panel-border bg-white/[0.04] px-4 py-3">
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="min-w-0">
                                            <p className="font-semibold">{script.name}</p>
                                            <p className="panel-mono mt-1 text-xs uppercase tracking-[0.2em] text-panel-text-muted">
                                                {script.slug}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-lg font-semibold">{script.active_users || 0}</p>
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

            <section className="panel-card panel-ring rounded-[28px] p-5 sm:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <p className="panel-mono text-[11px] uppercase tracking-[0.3em] text-panel-text-muted">Live roster</p>
                        <h2 className="mt-2 text-xl font-semibold">Sessions currently reporting into the panel</h2>
                        <p className="mt-2 text-sm text-panel-text-dim">
                            Search by Roblox name, user id, script, or executor. This uses the active session feed directly.
                        </p>
                    </div>
                    <label className="relative block w-full max-w-sm">
                        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-panel-text-muted" />
                        <input
                            type="text"
                            placeholder="Find a session"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            className="w-full rounded-2xl border border-panel-border bg-white/[0.04] py-3 pl-11 pr-4 text-sm text-white outline-none transition focus:border-white/20"
                        />
                    </label>
                </div>

                <div className="mt-6 max-h-[560px] overflow-auto rounded-[22px] border border-panel-border/70">
                    <div className="min-w-[860px]">
                        <div className="sticky top-0 z-10 grid grid-cols-[2fr_1.2fr_1fr_1fr] gap-4 border-b border-panel-border bg-[#0a1020] px-4 py-3 panel-mono text-[11px] uppercase tracking-[0.24em] text-panel-text-muted">
                            <span>User</span>
                            <span>Script</span>
                            <span>Executor</span>
                            <span>Last heartbeat</span>
                        </div>

                        {filteredSessions.length === 0 ? (
                            <div className="px-4 py-12 text-center text-panel-text-muted">
                                {search ? 'No active session matched that query.' : 'No active users are reporting yet.'}
                            </div>
                        ) : (
                            filteredSessions.map((session) => (
                                <div
                                    key={session.id}
                                    className="grid grid-cols-[2fr_1.2fr_1fr_1fr] gap-4 border-b border-panel-border/70 px-4 py-4 transition hover:bg-white/[0.03]"
                                >
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-3">
                                            <span className="relative flex h-3 w-3">
                                                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-40 animate-panel-pulse" />
                                                <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-300" />
                                            </span>
                                            <div className="min-w-0">
                                                <p className="truncate font-semibold">{session.roblox_user}</p>
                                                <p className="panel-mono truncate text-xs text-panel-text-muted">
                                                    #{session.roblox_userid}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="min-w-0">
                                        <p className="truncate font-medium text-[#ffb099]">{session.script_name}</p>
                                        <p className="panel-mono truncate text-xs text-panel-text-muted">{session.script_slug}</p>
                                    </div>
                                    <div className="min-w-0">
                                        <span className="inline-flex rounded-full border border-panel-border bg-white/[0.04] px-3 py-1 panel-mono text-xs text-panel-text-dim">
                                            {session.executor || 'Unknown'}
                                        </span>
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-medium">{timeSince(session.last_heartbeat)}</p>
                                        <p className="text-xs text-panel-text-muted">
                                            first seen {timeSince(session.first_seen)}
                                        </p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </section>
        </div>
    );
}
