const API_BASE = '/api';

export async function apiFetch(path, options = {}) {
    const token = localStorage.getItem('panel_token');
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
        localStorage.removeItem('panel_token');
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
    localStorage.setItem('panel_token', data.token);
    return data;
}

export function logout() {
    localStorage.removeItem('panel_token');
    window.location.href = '/login';
}
