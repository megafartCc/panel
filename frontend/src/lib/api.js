import { clearPanelToken, getPanelToken, setPanelToken } from './storage';

const API_BASE = '/api';

export async function apiFetch(path, options = {}) {
    const token = getPanelToken();
    const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers
    };

    const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers
    });

    if (res.status === 401) {
        clearPanelToken();
        window.location.href = '/login';
        throw new Error('Unauthorized');
    }

    const data = await res.json();

    if (!res.ok) {
        throw new Error(data.error || 'Request failed');
    }

    return data;
}

export async function login(username, password) {
    const data = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
    });
    setPanelToken(data.token);
    return data;
}

export function logout() {
    clearPanelToken();
    window.location.href = '/login';
}
