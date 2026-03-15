import { useEffect, useRef, useState, useCallback } from 'react';
import { apiFetch } from '../lib/api';

export function usePolling(interval = 3000) {
    const [sessions, setSessions] = useState([]);
    const [stats, setStats] = useState(null);
    const [finder, setFinder] = useState(null);
    const [connected, setConnected] = useState(false);
    const timerRef = useRef(null);

    const fetchData = useCallback(async () => {
        try {
            const scriptFilter = typeof window !== 'undefined'
                ? (window.localStorage.getItem('panel_finder_script') || '').trim()
                : '';
            const finderPath = scriptFilter
                ? `/finder/public?script=${encodeURIComponent(scriptFilter)}`
                : '/finder/public';

            // apiFetch already prepends /api and returns parsed JSON
            const [sessData, statsData, finderData] = await Promise.all([
                apiFetch('/sessions'),
                apiFetch('/sessions/stats'),
                apiFetch(finderPath),
            ]);

            setSessions(sessData.sessions || []);
            setStats(statsData);
            setFinder(finderData || null);
            setConnected(true);
        } catch {
            setConnected(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
        timerRef.current = setInterval(fetchData, interval);
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [fetchData, interval]);

    return { sessions, stats, finder, connected };
}
