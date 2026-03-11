import { useEffect, useRef, useState, useCallback } from 'react';

export function useWebSocket(onMessage) {
    const wsRef = useRef(null);
    const [connected, setConnected] = useState(false);
    const reconnectTimeoutRef = useRef(null);
    const onMessageRef = useRef(onMessage);
    const connectingRef = useRef(false);

    onMessageRef.current = onMessage;

    const cleanup = useCallback(() => {
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }
        if (wsRef.current) {
            wsRef.current.onopen = null;
            wsRef.current.onmessage = null;
            wsRef.current.onclose = null;
            wsRef.current.onerror = null;
            wsRef.current.close();
            wsRef.current = null;
        }
        connectingRef.current = false;
    }, []);

    const connect = useCallback(() => {
        const token = localStorage.getItem('panel_token');
        if (!token) return;

        // Prevent duplicate connections
        if (connectingRef.current) return;
        if (wsRef.current && wsRef.current.readyState <= 1) return; // CONNECTING or OPEN

        connectingRef.current = true;

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws?token=${token}`;

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            connectingRef.current = false;
            setConnected(true);
            console.log('[WS] Connected');
        };

        ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                onMessageRef.current?.(message);
            } catch (e) {
                console.error('[WS] Parse error:', e);
            }
        };

        ws.onclose = () => {
            connectingRef.current = false;
            setConnected(false);
            wsRef.current = null;

            // Auto-reconnect after 3s
            reconnectTimeoutRef.current = setTimeout(() => {
                connect();
            }, 3000);
        };

        ws.onerror = () => {
            // onclose will fire after this, no need to do anything
        };
    }, []);

    useEffect(() => {
        cleanup();
        connect();
        return cleanup;
    }, [connect, cleanup]);

    return { connected };
}
