import { useEffect, useRef, useState, useCallback } from 'react';
import { apiFetch } from '../lib/api';

export function usePolling(interval = 3000) {
    const [sessions, setSessions] = useState([]);
    const [stats, setStats] = useState(null);
    const [recent, setRecent] = useState([]);
    const [connected, setConnected] = useState(false);
    const timerRef = useRef(null);

    const fetchData = useCallback(async () => {
        try {
            const [sessData, statsData, recentData] = await Promise.all([
                apiFetch('/sessions'),
                apiFetch('/sessions/stats'),
                apiFetch('/sessions/recent?limit=250'),
            ]);

            setSessions(sessData.sessions || []);
            setStats(statsData);
            setRecent(recentData || []);
            setConnected(true);
        } catch {
            setConnected(false);
        }
    }, []);

    useEffect(() => {
        const initialTimer = setTimeout(fetchData, 0);
        timerRef.current = setInterval(fetchData, interval);
        return () => {
            clearTimeout(initialTimer);
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [fetchData, interval]);

    return { sessions, stats, recent, connected };
}
