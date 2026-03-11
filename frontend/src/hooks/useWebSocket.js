import { useEffect, useRef, useState, useCallback } from 'react';
import { apiFetch } from '../lib/api';

export function usePolling(interval = 3000) {
    const [sessions, setSessions] = useState([]);
    const [stats, setStats] = useState(null);
    const [connected, setConnected] = useState(false);
    const timerRef = useRef(null);

    const fetchData = useCallback(async () => {
        try {
            // apiFetch already prepends /api and returns parsed JSON
            const [sessData, statsData] = await Promise.all([
                apiFetch('/sessions'),
                apiFetch('/sessions/stats')
            ]);

            setSessions(sessData.sessions || []);
            setStats(statsData);
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

    return { sessions, stats, connected };
}
