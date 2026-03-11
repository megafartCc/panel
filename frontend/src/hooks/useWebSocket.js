import { useEffect, useRef, useState, useCallback } from 'react';

export function useWebSocket(onMessage) {
    const wsRef = useRef(null);
    const [connected, setConnected] = useState(false);
    const reconnectTimeoutRef = useRef(null);
    const onMessageRef = useRef(onMessage);

    onMessageRef.current = onMessage;

    const connect = useCallback(() => {
        const token = localStorage.getItem('panel_token');
        if (!token) return;

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws?token=${token}`;

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            setConnected(true);
            console.log('[WS] Connected');
        };

        ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                onMessageRef.current?.(message);
            } catch (e) {
                console.error('[WS] Failed to parse message:', e);
            }
        };

        ws.onclose = (event) => {
            setConnected(false);
            wsRef.current = null;
            console.log('[WS] Disconnected, reconnecting in 3s...');

            // Auto-reconnect
            reconnectTimeoutRef.current = setTimeout(() => {
                connect();
            }, 3000);
        };

        ws.onerror = (error) => {
            console.error('[WS] Error:', error);
            ws.close();
        };
    }, []);

    useEffect(() => {
        connect();

        return () => {
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
            if (wsRef.current) {
                wsRef.current.close();
            }
        };
    }, [connect]);

    return { connected };
}
