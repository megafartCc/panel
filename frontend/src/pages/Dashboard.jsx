import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Users, Activity, Clock, TrendingUp, Search } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function Dashboard() {
    const { sessions, stats } = useOutletContext();
    const [search, setSearch] = useState('');

    const activeUsers = sessions?.length || 0;
    const totalScripts = stats?.scripts?.length || 0;
    const chartData = stats?.chart || [];
    const scriptBreakdown = stats?.scripts || [];

    const filteredSessions = useMemo(() => {
        if (!sessions) return [];
        if (!search) return sessions;
        const q = search.toLowerCase();
        return sessions.filter(s =>
            s.roblox_user?.toLowerCase().includes(q) ||
            s.script_name?.toLowerCase().includes(q) ||
            s.executor?.toLowerCase().includes(q)
        );
    }, [sessions, search]);

    const statCards = [
        { label: 'Active Users', value: activeUsers, icon: Users, color: 'from-purple-500 to-blue-500', glow: 'shadow-purple-500/20' },
        { label: 'Scripts', value: totalScripts, icon: Activity, color: 'from-emerald-500 to-teal-500', glow: 'shadow-emerald-500/20' },
        { label: 'Peak Today', value: stats?.peakToday || 0, icon: TrendingUp, color: 'from-orange-500 to-amber-500', glow: 'shadow-orange-500/20' },
        { label: 'Total Sessions', value: stats?.totalSessions || 0, icon: Clock, color: 'from-pink-500 to-rose-500', glow: 'shadow-pink-500/20' },
    ];

    function timeSince(dateStr) {
        const seconds = Math.floor((new Date() - new Date(dateStr)) / 1000);
        if (seconds < 10) return 'just now';
        if (seconds < 60) return `${seconds}s ago`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        return `${Math.floor(seconds / 3600)}h ago`;
    }

    return (
        <div className="p-8 space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold">Dashboard</h1>
                <p className="text-white/40 mt-1">Real-time script analytics — polling every 3s</p>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {statCards.map((card) => (
                    <div key={card.label} className="bg-panel-card border border-white/5 rounded-2xl p-6 hover:border-white/10 transition-all">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-white/50 text-sm font-medium">{card.label}</span>
                            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center shadow-lg ${card.glow}`}>
                                <card.icon className="w-5 h-5 text-white" />
                            </div>
                        </div>
                        <div className="text-3xl font-bold">{card.value}</div>
                    </div>
                ))}
            </div>

            {/* Chart + Script Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Chart */}
                <div className="lg:col-span-2 bg-panel-card border border-white/5 rounded-2xl p-6">
                    <h2 className="text-lg font-semibold mb-4">User Activity (24h)</h2>
                    <ResponsiveContainer width="100%" height={260}>
                        <AreaChart data={chartData}>
                            <defs>
                                <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <XAxis dataKey="hour" stroke="#ffffff20" fontSize={12} tickLine={false} />
                            <YAxis stroke="#ffffff20" fontSize={12} tickLine={false} allowDecimals={false} />
                            <Tooltip
                                contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                                labelStyle={{ color: '#ffffff80' }}
                            />
                            <Area type="monotone" dataKey="count" stroke="#a855f7" fill="url(#colorUsers)" strokeWidth={2} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                {/* Script Breakdown */}
                <div className="bg-panel-card border border-white/5 rounded-2xl p-6">
                    <h2 className="text-lg font-semibold mb-4">Per Script</h2>
                    <div className="space-y-3">
                        {scriptBreakdown.length === 0 && (
                            <p className="text-white/30 text-sm">No scripts tracked yet</p>
                        )}
                        {scriptBreakdown.map((s) => (
                            <div key={s.slug} className="flex items-center justify-between p-3 rounded-xl bg-white/5">
                                <span className="font-medium">{s.name}</span>
                                <span className="text-purple-400 font-bold">{s.activeCount}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Active Users Table */}
            <div className="bg-panel-card border border-white/5 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">Active Users</h2>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                        <input
                            type="text"
                            placeholder="Search..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-9 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50 w-64"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="text-white/40 text-sm border-b border-white/5">
                                <th className="text-left py-3 px-4 font-medium">User</th>
                                <th className="text-left py-3 px-4 font-medium">Script</th>
                                <th className="text-left py-3 px-4 font-medium">Executor</th>
                                <th className="text-left py-3 px-4 font-medium">Last Seen</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredSessions.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="text-center py-8 text-white/20">
                                        {search ? 'No matching users' : 'No active users — run a script to see them here'}
                                    </td>
                                </tr>
                            )}
                            {filteredSessions.map((s) => (
                                <tr key={s.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                    <td className="py-3 px-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                            <span className="font-medium">{s.roblox_user}</span>
                                            <span className="text-xs text-white/30">#{s.roblox_userid}</span>
                                        </div>
                                    </td>
                                    <td className="py-3 px-4 text-purple-400">{s.script_name}</td>
                                    <td className="py-3 px-4 text-white/50">{s.executor}</td>
                                    <td className="py-3 px-4 text-white/50">{timeSince(s.last_heartbeat)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
