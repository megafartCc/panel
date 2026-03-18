import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api';
import { Brain, User, Clock, ArrowRight, Check, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';

function formatNumber(n) {
    if (typeof n !== 'number') return '0';
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return Math.floor(n).toLocaleString();
}

function timeAgo(dateStr) {
    if (!dateStr) return 'Unknown';
    const now = new Date();
    const then = new Date(dateStr + 'Z');
    const diffS = Math.floor((now - then) / 1000);
    if (diffS < 10) return 'just now';
    if (diffS < 60) return `${diffS}s ago`;
    if (diffS < 3600) return `${Math.floor(diffS / 60)}m ago`;
    if (diffS < 86400) return `${Math.floor(diffS / 3600)}h ago`;
    return `${Math.floor(diffS / 86400)}d ago`;
}

function PlayerCard({ player, onTrade }) {
    const [expanded, setExpanded] = useState(false);
    const { username, userid, brainrots, brainrotCount, updatedAt } = player;

    const sorted = [...(brainrots || [])].sort((a, b) => (b.moneyPerSec || 0) - (a.moneyPerSec || 0));

    return (
        <div className="card overflow-hidden">
            <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-zinc-50/60"
            >
                <div className="flex items-center gap-4 min-w-0">
                    <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
                        <User className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-zinc-950">{username || `User ${userid}`}</p>
                        <p className="mt-0.5 text-xs text-zinc-400">ID: {userid}</p>
                    </div>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0">
                    <div className="text-right">
                        <p className="text-sm font-medium text-zinc-950">{brainrotCount} brainrots</p>
                        <p className="text-xs text-zinc-400">{timeAgo(updatedAt)}</p>
                    </div>
                    {expanded
                        ? <ChevronDown className="h-4 w-4 text-zinc-400" />
                        : <ChevronRight className="h-4 w-4 text-zinc-400" />
                    }
                </div>
            </button>

            {expanded && (
                <div className="border-t border-zinc-100">
                    {sorted.length === 0 ? (
                        <p className="px-5 py-6 text-center text-sm text-zinc-400">No brainrots reported</p>
                    ) : (
                        <div className="divide-y divide-zinc-50">
                            {sorted.map((br, i) => (
                                <div key={br.key || br.name + i} className="flex items-center justify-between gap-3 px-5 py-3 transition hover:bg-zinc-50/80">
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium text-zinc-900">{br.name}</p>
                                        <p className="mt-0.5 text-xs text-zinc-400">
                                            ${formatNumber(br.moneyPerSec || 0)}/s
                                            {typeof br.slot === 'number' && <span className="ml-2">Slot {br.slot}</span>}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => onTrade(player, br)}
                                        className="flex items-center gap-1.5 rounded-xl bg-zinc-900 px-3.5 py-2 text-xs font-medium text-white transition hover:bg-zinc-800"
                                    >
                                        Trade
                                        <ArrowRight className="h-3 w-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default function BrainrotsInfo() {
    const [players, setPlayers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [toast, setToast] = useState(null);

    const fetchInventory = useCallback(async () => {
        try {
            const data = await apiFetch('/trade/inventory');
            setPlayers(data.players || []);
            setError(null);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchInventory();
        const interval = setInterval(fetchInventory, 10000);
        return () => clearInterval(interval);
    }, [fetchInventory]);

    const handleTrade = async (player, brainrot) => {
        try {
            const data = await apiFetch('/trade/command', {
                method: 'POST',
                body: JSON.stringify({
                    targetUserid: player.userid,
                    targetUsername: player.username,
                    brainrotSlot: brainrot.slot,
                    brainrotKey: brainrot.key || brainrot.name,
                    brainrotName: brainrot.name,
                    script: player.script || 'sabnew',
                }),
            });

            setToast({
                type: 'success',
                message: `Trade command queued: ${brainrot.name} from ${player.username}`,
            });
        } catch (err) {
            setToast({ type: 'error', message: err.message });
        }

        setTimeout(() => setToast(null), 4000);
    };

    const totalBrainrots = players.reduce((sum, p) => sum + (p.brainrotCount || 0), 0);

    return (
        <div className="space-y-6">
            {/* Stats row */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="card px-5 py-4">
                    <p className="section-kicker">Players Online</p>
                    <p className="mt-2 text-3xl font-semibold text-zinc-950">{players.length}</p>
                </div>
                <div className="card px-5 py-4">
                    <p className="section-kicker">Total Brainrots</p>
                    <p className="mt-2 text-3xl font-semibold text-zinc-950">{totalBrainrots}</p>
                </div>
                <div className="card px-5 py-4">
                    <p className="section-kicker">Status</p>
                    <p className="mt-2 text-3xl font-semibold text-emerald-600">{loading ? 'Loading...' : 'Live'}</p>
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="card flex items-center gap-3 border-red-200 bg-red-50 px-5 py-4 text-red-700 text-sm">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    {error}
                </div>
            )}

            {/* Players */}
            <div className="space-y-3">
                {players.length === 0 && !loading ? (
                    <div className="card px-5 py-12 text-center">
                        <Brain className="mx-auto h-10 w-10 text-zinc-300" />
                        <p className="mt-4 text-sm text-zinc-500">No player inventories reported yet.</p>
                        <p className="mt-1 text-xs text-zinc-400">Players running sabv3 will appear here.</p>
                    </div>
                ) : (
                    players.map((player) => (
                        <PlayerCard key={player.userid} player={player} onTrade={handleTrade} />
                    ))
                )}
            </div>

            {/* Toast */}
            {toast && (
                <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl px-5 py-3.5 shadow-lg text-sm font-medium
                    ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
                    {toast.type === 'success' ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                    {toast.message}
                </div>
            )}
        </div>
    );
}
