const TOKEN_KEY = 'panel_token';

function getStorage() {
    try {
        return window.localStorage;
    } catch {
        return null;
    }
}

export function getPanelToken() {
    return getStorage()?.getItem(TOKEN_KEY) || '';
}

export function setPanelToken(token) {
    const storage = getStorage();
    if (!storage) return;
    storage.setItem(TOKEN_KEY, token);
}

export function clearPanelToken() {
    const storage = getStorage();
    if (!storage) return;
    storage.removeItem(TOKEN_KEY);
}
