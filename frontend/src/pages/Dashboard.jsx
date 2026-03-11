import { useState, useEffect, useMemo } from 'react'
import { useWsContext } from '../components/Layout'
import { apiFetch } from '../lib/api'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Users, Activity, Clock, TrendingUp, ArrowUpRight, ArrowDownRight, UserPlus, UserMinus, Search, Monitor } from 'lucide-react'

function StatsCard({ icon: Icon, label, value, subValue, color = 'panel-accent', trend }) {
    const colorMap = {
        'panel-accent': 'from-panel-accent/15 to-panel-accent/5 border-panel-accent/20 text-panel-accent',
        'panel-success': 'from-panel-success/15 to-panel-success/5 border-panel-success/20 text-panel-success',
        'panel-info': 'from-panel-info/15 to-panel-info/5 border-panel-info/20 text-panel-info',
        'panel-warning': 'from-panel-warning/15 to-panel-warning/5 border-panel-warning/20 text-panel-warning',
    }
    const classes = colorMap[color] || colorMap['panel-accent']

    return (
        <div className={`bg-gradient-to-br ${classes} border rounded-xl p-5 transition-all hover:scale-[1.02]`}>
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Icon className="w-4.5 h-4.5 opacity-80" />
                    <span className="text-xs font-medium uppercase tracking-wider opacity-70">{label}</span>
                </div>
                {trend && (
                    <span className={`text-xs font-semibold flex items-center gap-0.5 ${trend > 0 ? 'text-panel-success' : 'text-panel-danger'}`}>
                        {trend > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {Math.abs(trend)}%
                    </span>
                )}
            </div>
            <div className="text-3xl font-bold text-white">{value}</div>
            {subValue && <p className="text-xs text-panel-text-muted mt-1">{subValue}</p>}
        </div>
    )
}

function ActivityFeedItem({ item }) {
    const isJoin = item.type === 'join'
    const time = new Date(item.timestamp).toLocaleTimeString()

    return (
        <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-panel-card-hover/50 transition-colors">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${isJoin ? 'bg-panel-success/15 text-panel-success' : 'bg-panel-danger/15 text-panel-danger'
                }`}>
                {isJoin ? <UserPlus className="w-3.5 h-3.5" /> : <UserMinus className="w-3.5 h-3.5" />}
            </div>
            <div className="flex-1 min-w-0">
                <span className="text-sm text-white font-medium">{item.user}</span>
                <span className="text-sm text-panel-text-muted"> {isJoin ? 'joined' : 'left'} </span>
                <span className="text-sm text-panel-accent font-medium">{item.script}</span>
            </div>
            <span className="text-xs text-panel-text-muted shrink-0">{time}</span>
        </div>
    )
}

function UsersTable({ sessions, searchTerm }) {
    const filtered = useMemo(() => {
        if (!searchTerm) return sessions
        const term = searchTerm.toLowerCase()
        return sessions.filter(s =>
            s.roblox_user?.toLowerCase().includes(term) ||
            s.script_name?.toLowerCase().includes(term) ||
            s.executor?.toLowerCase().includes(term) ||
            s.server_jobid?.toLowerCase().includes(term)
        )
    }, [sessions, searchTerm])

    const getDuration = (firstSeen) => {
        const diff = Math.floor((Date.now() - new Date(firstSeen + 'Z').getTime()) / 1000)
        if (diff < 60) return `${diff}s`
        if (diff < 3600) return `${Math.floor(diff / 60)}m`
        return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-panel-border">
                        <th className="px-4 py-3 text-left font-medium text-panel-text-muted uppercase tracking-wider text-xs">User</th>
                        <th className="px-4 py-3 text-left font-medium text-panel-text-muted uppercase tracking-wider text-xs">Script</th>
                        <th className="px-4 py-3 text-left font-medium text-panel-text-muted uppercase tracking-wider text-xs">Executor</th>
                        <th className="px-4 py-3 text-left font-medium text-panel-text-muted uppercase tracking-wider text-xs">Server</th>
                        <th className="px-4 py-3 text-left font-medium text-panel-text-muted uppercase tracking-wider text-xs">Duration</th>
                    </tr>
                </thead>
                <tbody>
                    {filtered.length === 0 ? (
                        <tr>
                            <td colSpan={5} className="px-4 py-8 text-center text-panel-text-muted">
                                {searchTerm ? 'No matching sessions' : 'No active sessions'}
                            </td>
                        </tr>
                    ) : (
                        filtered.map(session => (
                            <tr key={session.id} className="border-b border-panel-border/50 hover:bg-panel-card-hover/30 transition-colors">
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-panel-success animate-live-pulse" />
                                        <span className="text-white font-medium">{session.roblox_user}</span>
                                    </div>
                                </td>
                                <td className="px-4 py-3">
                                    <span className="px-2 py-0.5 rounded-md bg-panel-accent/15 text-panel-accent text-xs font-medium">
                                        {session.script_name || session.script_slug}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-panel-text-dim">
                                    <div className="flex items-center gap-1.5">
                                        <Monitor className="w-3.5 h-3.5 text-panel-text-muted" />
                                        {session.executor || 'Unknown'}
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-panel-text-muted font-mono text-xs">
                                    {session.server_jobid ? session.server_jobid.substring(0, 8) + '...' : '—'}
                                </td>
                                <td className="px-4 py-3 text-panel-text-dim">
                                    {getDuration(session.first_seen)}
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    )
}

const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return (
        <div className="bg-panel-card border border-panel-border rounded-lg px-3 py-2 shadow-xl">
            <p className="text-xs text-panel-text-muted">{label}</p>
            <p className="text-sm font-semibold text-panel-accent">{payload[0].value} users</p>
        </div>
    )
}

export default function Dashboard() {
    const { sessions, activityFeed } = useWsContext()
    const [stats, setStats] = useState(null)
    const [searchTerm, setSearchTerm] = useState('')

    useEffect(() => {
        apiFetch('/sessions/stats').then(setStats).catch(console.error)
        const interval = setInterval(() => {
            apiFetch('/sessions/stats').then(setStats).catch(console.error)
        }, 30000)
        return () => clearInterval(interval)
    }, [])

    const chartData = useMemo(() => {
        if (!stats?.hourlyActivity) return []
        return stats.hourlyActivity.map(h => ({
            time: new Date(h.hour + 'Z').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            users: h.users
        }))
    }, [stats])

    const scriptBreakdown = useMemo(() => {
        const counts = {}
        sessions.forEach(s => {
            const name = s.script_name || s.script_slug || 'Unknown'
            counts[name] = (counts[name] || 0) + 1
        })
        return Object.entries(counts).sort((a, b) => b[1] - a[1])
    }, [sessions])

    return (
        <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">Dashboard</h1>
                    <p className="text-sm text-panel-text-muted mt-0.5">Real-time script monitoring</p>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-panel-success/10 border border-panel-success/20">
                    <div className="w-2 h-2 rounded-full bg-panel-success animate-live-pulse" />
                    <span className="text-xs font-semibold text-panel-success">LIVE</span>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatsCard
                    icon={Users}
                    label="Active Users"
                    value={sessions.length}
                    subValue="Currently online"
                    color="panel-accent"
                />
                <StatsCard
                    icon={Activity}
                    label="Total Sessions"
                    value={stats?.totalSessions || 0}
                    subValue="All time"
                    color="panel-info"
                />
                <StatsCard
                    icon={TrendingUp}
                    label="Unique Users"
                    value={stats?.uniqueUsers || 0}
                    subValue="All time"
                    color="panel-success"
                />
                <StatsCard
                    icon={Clock}
                    label="Last 24h"
                    value={stats?.last24h || 0}
                    subValue="New sessions"
                    color="panel-warning"
                />
            </div>

            {/* Charts + Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* User Activity Chart */}
                <div className="lg:col-span-2 bg-panel-card border border-panel-border rounded-xl p-5">
                    <h2 className="text-sm font-semibold text-white mb-4">User Activity (24h)</h2>
                    <div className="h-[250px]">
                        {chartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData}>
                                    <defs>
                                        <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <XAxis dataKey="time" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                                    <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Area type="monotone" dataKey="users" stroke="#8b5cf6" strokeWidth={2} fill="url(#colorUsers)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center text-panel-text-muted text-sm">
                                No activity data yet
                            </div>
                        )}
                    </div>
                </div>

                {/* Per-Script Breakdown */}
                <div className="bg-panel-card border border-panel-border rounded-xl p-5">
                    <h2 className="text-sm font-semibold text-white mb-4">Script Breakdown</h2>
                    <div className="space-y-3">
                        {scriptBreakdown.length === 0 ? (
                            <p className="text-sm text-panel-text-muted">No active scripts</p>
                        ) : (
                            scriptBreakdown.map(([name, count]) => (
                                <div key={name} className="flex items-center justify-between">
                                    <span className="text-sm text-panel-text-dim">{name}</span>
                                    <div className="flex items-center gap-2">
                                        <div className="w-20 h-1.5 rounded-full bg-panel-bg overflow-hidden">
                                            <div
                                                className="h-full rounded-full bg-gradient-to-r from-panel-accent to-panel-info"
                                                style={{ width: `${Math.min((count / Math.max(sessions.length, 1)) * 100, 100)}%` }}
                                            />
                                        </div>
                                        <span className="text-xs font-semibold text-white w-6 text-right">{count}</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Activity Feed + Users Table */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Activity Feed */}
                <div className="bg-panel-card border border-panel-border rounded-xl overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-panel-border">
                        <h2 className="text-sm font-semibold text-white">Activity Feed</h2>
                    </div>
                    <div className="max-h-[350px] overflow-y-auto">
                        {activityFeed.length === 0 ? (
                            <div className="px-5 py-8 text-center text-panel-text-muted text-sm">
                                Waiting for activity...
                            </div>
                        ) : (
                            activityFeed.map((item, i) => (
                                <ActivityFeedItem key={`${item.id}-${i}`} item={item} />
                            ))
                        )}
                    </div>
                </div>

                {/* Active Users Table */}
                <div className="lg:col-span-2 bg-panel-card border border-panel-border rounded-xl overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-panel-border flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-white">Active Users ({sessions.length})</h2>
                        <div className="relative">
                            <Search className="w-3.5 h-3.5 text-panel-text-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                id="search-users"
                                placeholder="Search..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-48 pl-8 pr-3 py-1.5 rounded-lg bg-panel-bg border border-panel-border text-sm text-white placeholder-panel-text-muted focus:outline-none focus:border-panel-accent/50 transition-colors"
                            />
                        </div>
                    </div>
                    <UsersTable sessions={sessions} searchTerm={searchTerm} />
                </div>
            </div>
        </div>
    )
}
