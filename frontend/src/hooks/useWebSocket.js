import { useEffect, useRef, useState, useCallback } from 'react';
import { apiFetch } from '../lib/api';

export function usePolling(interval = 3000) {
    const [sessions, setSessions] = useState([]);
    const [stats, setStats] = useState(null);
    const [connected, setConnected] = useState(false);
    const timerRef = useRef(null);

    const fetchData = useCallback(async () => {
        try {
            const [sessRes, statsRes] = await Promise.all([
                apiFetch('/api/sessions'),
                apiFetch('/api/sessions/stats')
            ]);

            if (sessRes.ok && statsRes.ok) {
                const sessData = await sessRes.json();
                const statsData = await statsRes.json();
                setSessions(sessData.sessions || []);
                setStats(statsData);
                setConnected(true);
            } else {
                setConnected(false);
            }
        } catch {
            setConnected(false);
        }
    }, []);

    useEffect(() => {
        // Fetch immediately
        fetchData();

        // Then poll every `interval` ms
        timerRef.current = setInterval(fetchData, interval);

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [fetchData, interval]);

    return { sessions, stats, connected };
}
