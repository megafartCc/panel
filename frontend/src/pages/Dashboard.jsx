import { useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Activity, CalendarDays, CalendarRange, CalendarClock, Code2 } from 'lucide-react';
import {
    ArcElement,
    CategoryScale,
    Chart as ChartJS,
    Legend,
    LineElement,
    LinearScale,
    PointElement,
    Tooltip,
} from 'chart.js';
import { Line, Pie } from 'react-chartjs-2';

ChartJS.register(ArcElement, CategoryScale, LinearScale, PointElement, LineElement, Legend, Tooltip);

function formatDayLabel(date) {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
}

export default function Dashboard() {
    const { sessions, stats, recent } = useOutletContext();

    const now = new Date();
    const dailyCount = recent.filter((session) => new Date(session.first_seen) >= new Date(now.getTime() - 24 * 60 * 60 * 1000)).length;
    const weeklyCount = recent.filter((session) => new Date(session.first_seen) >= new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)).length;
    const monthlyCount = recent.filter((session) => new Date(session.first_seen) >= new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)).length;

    const lineConfig = useMemo(() => {
        const days = Array.from({ length: 7 }).map((_, index) => {
            const date = new Date();
            date.setDate(date.getDate() - (6 - index));
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

        return {
            data: {
                labels: days.map((d) => formatDayLabel(d)),
                datasets: [
                    {
                        label: 'Connections',
                        data: values,
                        borderColor: '#0ea5e9',
                        borderWidth: 3,
                        pointRadius: 3,
                        pointBackgroundColor: '#0ea5e9',
                        tension: 0.35,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { color: 'rgba(148,163,184,0.2)' }, ticks: { precision: 0 } },
                    x: { grid: { display: false } },
                },
            },
        };
    }, [recent]);

    const scriptsConnectedPieConfig = useMemo(() => {
        const perScript = stats?.perScript || [];
        return {
            data: {
                labels: perScript.map((item) => item.name),
                datasets: [
                    {
                        data: perScript.map((item) => item.active_users || 0),
                        backgroundColor: ['#0ea5e9', '#6366f1', '#14b8a6', '#f59e0b', '#f43f5e', '#22c55e'],
                        borderWidth: 0,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } },
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
                            <div className="rounded-xl bg-sky-100 p-2 text-sky-600">
                                <card.icon className="h-4 w-4" />
                            </div>
                        </div>
                        <p className="mt-4 text-3xl font-bold text-slate-900">{card.value}</p>
                    </article>
                ))}
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.55fr_1fr]">
                <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_15px_35px_rgba(15,23,42,0.06)]">
                    <div className="mb-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Traffic graph</p>
                            <h3 className="text-xl font-semibold">Connections (last 7 days)</h3>
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
