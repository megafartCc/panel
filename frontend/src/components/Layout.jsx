import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Code2, LogOut, Activity, Wifi, WifiOff } from 'lucide-react';
import { usePolling } from '../hooks/useWebSocket';

export default function Layout() {
    const navigate = useNavigate();
    const { sessions, stats, connected } = usePolling(3000);

    const handleLogout = () => {
        localStorage.removeItem('panel_token');
        navigate('/login');
    };

    const navItems = [
        { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
        { to: '/scripts', icon: Code2, label: 'Scripts' },
    ];

    return (
        <div className="flex h-screen bg-panel-bg text-white">
            {/* Sidebar */}
            <aside className="w-64 border-r border-white/5 flex flex-col bg-panel-card/50">
                {/* Logo */}
                <div className="p-6 border-b border-white/5">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
                            <Activity className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold">Script Panel</h1>
                            <p className="text-xs text-white/40">Analytics</p>
                        </div>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="flex-1 p-4 space-y-1">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            end={item.to === '/'}
                            className={({ isActive }) =>
                                `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${isActive
                                    ? 'bg-purple-500/15 text-purple-400 shadow-lg shadow-purple-500/5'
                                    : 'text-white/50 hover:text-white/80 hover:bg-white/5'
                                }`
                            }
                        >
                            <item.icon className="w-5 h-5" />
                            <span className="font-medium">{item.label}</span>
                        </NavLink>
                    ))}
                </nav>

                {/* Status + Logout */}
                <div className="p-4 border-t border-white/5 space-y-3">
                    <div className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm ${connected ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'}`}>
                        {connected ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
                        <span className="font-medium">{connected ? 'Live' : 'Disconnected'}</span>
                        <span className="ml-auto text-xs opacity-60">polling</span>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl text-white/50 hover:text-red-400 hover:bg-red-500/5 transition-all w-full"
                    >
                        <LogOut className="w-5 h-5" />
                        <span className="font-medium">Logout</span>
                    </button>
                </div>
            </aside>

            {/* Main content */}
            <main className="flex-1 overflow-auto">
                <Outlet context={{ sessions, stats, connected }} />
            </main>
        </div>
    );
}
