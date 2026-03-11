import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Activity, CalendarDays, CalendarRange, CalendarClock, Code2 } from 'lucide-react';
import {
    ArcElement,
    CategoryScale,
    Chart as ChartJS,
    Filler,
    Legend,
    LineElement,
    LinearScale,
    PointElement,
    Tooltip,
} from 'chart.js';
import { Line, Pie } from 'react-chartjs-2';

ChartJS.register(ArcElement, CategoryScale, LinearScale, PointElement, LineElement, Filler, Legend, Tooltip);

const RANGE_OPTIONS = [7, 14, 30];
const EMPTY_LIST = [];

function formatDayLabel(date) {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
}

export default function Dashboard() {
    const outlet = useOutletContext() || {};
    const sessions = Array.isArray(outlet.sessions) ? outlet.sessions : EMPTY_LIST;
    const recent = Array.isArray(outlet.recent) ? outlet.recent : EMPTY_LIST;
    const stats = outlet.stats || null;
    const [rangeDays, setRangeDays] = useState(7);

    const now = new Date();
    const dailyCount = recent.filter((session) => new Date(session.first_seen) >= new Date(now.getTime() - 24 * 60 * 60 * 1000)).length;
    const weeklyCount = recent.filter((session) => new Date(session.first_seen) >= new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)).length;
    const monthlyCount = recent.filter((session) => new Date(session.first_seen) >= new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)).length;

    const lineConfig = useMemo(() => {
        const days = Array.from({ length: rangeDays }).map((_, index) => {
            const date = new Date();
            date.setDate(date.getDate() - (rangeDays - 1 - index));
            return date;
        });

        const values = days.map((day) => {
            const dayStart = new Date(day);
            dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(dayStart);
            dayEnd.setDate(dayEnd.getDate() + 1);
            return recent.filter((session) => {
                const seen = new Date(session.first_seen);
                return seen >= dayStart && seen < dayEnd;
            }).length;
        });

        const maxValue = values.length ? Math.max(...values) : 0;

        return {
            data: {
                labels: days.map((d) => formatDayLabel(d)),
                datasets: [
                    {
                        label: 'Current connections',
                        data: values,
                        borderColor: '#22c55e',
                        backgroundColor: (context) => {
                            const { chart } = context;
                            const { ctx, chartArea } = chart;
                            if (!chartArea) return 'rgba(34, 197, 94, 0.2)';
                            const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                            gradient.addColorStop(0, 'rgba(34, 197, 94, 0.36)');
                            gradient.addColorStop(0.5, 'rgba(74, 222, 128, 0.18)');
                            gradient.addColorStop(1, 'rgba(34, 197, 94, 0.02)');
                            return gradient;
                        },
                        fill: true,
                        borderWidth: 3,
                        pointRadius: 0,
                        pointHoverRadius: 5,
                        pointBackgroundColor: '#22c55e',
                        pointBorderColor: '#ffffff',
                        pointBorderWidth: 2,
                        tension: 0.35,
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
                        displayColors: false,
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        titleColor: '#dcfce7',
                        bodyColor: '#ffffff',
                        borderColor: 'rgba(34, 197, 94, 0.35)',
                        borderWidth: 1,
                        callbacks: {
                            label: (ctx) => `Connections: ${ctx.parsed.y}`,
                        },
                    },
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        suggestedMax: maxValue ? Math.ceil(maxValue * 1.25) : 5,
                        grid: { color: 'rgba(148,163,184,0.2)' },
                        ticks: { precision: 0 },
                    },
                    x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } },
                },
            },
        };
    }, [recent, rangeDays]);

    const scriptsConnectedPieConfig = useMemo(() => {
        const perScript = stats?.perScript || [];
        return {
            data: {
                labels: perScript.map((item) => item.name),
                datasets: [
                    {
                        label: 'Players',
                        data: perScript.map((item) => item.active_users || 0),
                        backgroundColor: ['#22c55e', '#14b8a6', '#84cc16', '#0ea5e9', '#f59e0b', '#f43f5e'],
                        borderColor: '#ffffff',
                        borderWidth: 2,
                        hoverOffset: 8,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { boxWidth: 12, boxHeight: 12 } },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => `${ctx.label}: ${ctx.parsed}`,
                        },
                    },
                },
            },
        };
    }, [stats]);

    const cards = [
        { label: 'Current players connected', value: stats?.totalActive || sessions.length, icon: Activity },
        { label: 'Daily connections', value: dailyCount, icon: CalendarDays },
        { label: 'Weekly connections', value: weeklyCount, icon: CalendarRange },
        { label: 'Monthly connections', value: monthlyCount, icon: CalendarClock },
    ];

    return (
        <div className="space-y-6">
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {cards.map((card) => (
                    <article key={card.label} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_15px_35px_rgba(15,23,42,0.06)]">
                        <div className="flex items-center justify-between">
                            <p className="text-sm text-slate-500">{card.label}</p>
                            <div className="rounded-xl bg-emerald-100 p-2 text-emerald-600">
                                <card.icon className="h-4 w-4" />
                            </div>
                        </div>
                        <p className="mt-4 text-3xl font-bold text-slate-900">{card.value}</p>
                    </article>
                ))}
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.55fr_1fr]">
                <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_15px_35px_rgba(15,23,42,0.06)]">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Current connection graph</p>
                            <h3 className="text-xl font-semibold">Connections trend</h3>
                        </div>
                        <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-1">
                            {RANGE_OPTIONS.map((value) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => setRangeDays(value)}
                                    className={`rounded px-3 py-1.5 text-xs font-semibold transition ${
                                        rangeDays === value ? 'bg-emerald-500 text-white' : 'text-slate-600 hover:bg-slate-200'
                                    }`}
                                >
                                    {value}D
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="h-[320px]">
                        <Line data={lineConfig.data} options={lineConfig.options} />
                    </div>
                </article>

                <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_15px_35px_rgba(15,23,42,0.06)]">
                    <div className="mb-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Scripts connected</p>
                            <h3 className="text-xl font-semibold">Players by script</h3>
                        </div>
                        <Code2 className="h-5 w-5 text-slate-400" />
                    </div>
                    <div className="h-[320px]">
                        <Pie data={scriptsConnectedPieConfig.data} options={scriptsConnectedPieConfig.options} />
                    </div>
                </article>
            </section>
        </div>
    );
}
