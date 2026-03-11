import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { logout } from '../lib/api'
import { LayoutDashboard, Code2, LogOut, Shield, Wifi, WifiOff } from 'lucide-react'
import { useWebSocket } from '../hooks/useWebSocket'
import { useState, useCallback, createContext, useContext } from 'react'

export const WebSocketContext = createContext(null)

export function useWsContext() {
    return useContext(WebSocketContext)
}

export default function Layout() {
    const [sessions, setSessions] = useState([])
    const [activityFeed, setActivityFeed] = useState([])
    const navigate = useNavigate()

    const handleMessage = useCallback((message) => {
        switch (message.type) {
            case 'init':
                setSessions(message.data.sessions || [])
                break

            case 'session:join':
                setSessions(prev => {
                    const exists = prev.find(s => s.id === message.data.sessionId)
                    if (exists) return prev
                    return [{
                        id: message.data.sessionId,
                        roblox_user: message.data.user,
                        roblox_userid: message.data.userid,
                        executor: message.data.executor,
                        server_jobid: message.data.jobid,
                        script_name: message.data.scriptName,
                        script_slug: message.data.script,
                        first_seen: message.data.timestamp,
                        last_heartbeat: message.data.timestamp,
                        is_active: 1
                    }, ...prev]
                })
                setActivityFeed(prev => [{
                    type: 'join',
                    user: message.data.user,
                    script: message.data.scriptName,
                    timestamp: message.data.timestamp,
                    id: message.data.sessionId
                }, ...prev].slice(0, 50))
                break

            case 'session:heartbeat':
                setSessions(prev => prev.map(s =>
                    s.id === message.data.sessionId
                        ? { ...s, last_heartbeat: message.data.timestamp, executor: message.data.executor }
                        : s
                ))
                break

            case 'session:leave':
                setSessions(prev => prev.filter(s => s.id !== message.data.sessionId))
                setActivityFeed(prev => [{
                    type: 'leave',
                    user: message.data.user,
                    script: message.data.scriptName,
                    timestamp: message.data.timestamp,
                    id: message.data.sessionId
                }, ...prev].slice(0, 50))
                break
        }
    }, [])

    const { connected } = useWebSocket(handleMessage)

    const navLinks = [
        { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
        { to: '/scripts', icon: Code2, label: 'Scripts' },
    ]

    return (
        <WebSocketContext.Provider value={{ sessions, activityFeed, connected }}>
            <div className="flex h-screen bg-panel-bg">
                {/* Sidebar */}
                <aside className="w-64 bg-panel-card border-r border-panel-border flex flex-col shrink-0">
                    {/* Logo */}
                    <div className="px-5 py-5 border-b border-panel-border">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-panel-accent to-panel-info flex items-center justify-center shadow-md shadow-panel-accent/20">
                                <Shield className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <h1 className="text-base font-bold text-white tracking-tight leading-none">Script Panel</h1>
                                <p className="text-xs text-panel-text-muted mt-0.5">Analytics</p>
                            </div>
                        </div>
                    </div>

                    {/* Nav */}
                    <nav className="flex-1 px-3 py-4 space-y-1">
                        {navLinks.map(({ to, icon: Icon, label, end }) => (
                            <NavLink
                                key={to}
                                to={to}
                                end={end}
                                className={({ isActive }) =>
                                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${isActive
                                        ? 'bg-panel-accent/15 text-panel-accent'
                                        : 'text-panel-text-dim hover:text-panel-text hover:bg-panel-card-hover'
                                    }`
                                }
                            >
                                <Icon className="w-4.5 h-4.5" />
                                {label}
                            </NavLink>
                        ))}
                    </nav>

                    {/* Footer */}
                    <div className="px-3 py-4 border-t border-panel-border space-y-3">
                        {/* Connection status */}
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-panel-bg/50">
                            {connected ? (
                                <>
                                    <div className="w-2 h-2 rounded-full bg-panel-success animate-live-pulse" />
                                    <Wifi className="w-3.5 h-3.5 text-panel-success" />
                                    <span className="text-xs text-panel-success font-medium">Live</span>
                                </>
                            ) : (
                                <>
                                    <div className="w-2 h-2 rounded-full bg-panel-danger" />
                                    <WifiOff className="w-3.5 h-3.5 text-panel-danger" />
                                    <span className="text-xs text-panel-danger font-medium">Disconnected</span>
                                </>
                            )}
                        </div>

                        <button
                            onClick={() => { logout(); navigate('/login') }}
                            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-panel-text-dim hover:text-panel-danger hover:bg-panel-danger/10 transition-all w-full cursor-pointer"
                        >
                            <LogOut className="w-4.5 h-4.5" />
                            Sign Out
                        </button>
                    </div>
                </aside>

                {/* Main */}
                <main className="flex-1 overflow-y-auto">
                    <Outlet />
                </main>
            </div>
        </WebSocketContext.Provider>
    )
}
