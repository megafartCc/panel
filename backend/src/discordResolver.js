const POSITIVE_CACHE_TTL_MS = 1000 * 60 * 30;
const NEGATIVE_CACHE_TTL_MS = 1000 * 60 * 5;
const lookupCache = new Map();

function trimText(value) {
    if (typeof value !== 'string') {
        if (typeof value !== 'number') {
            return '';
        }
        value = String(value);
    }
    return String(value).trim();
}

function normalizeLookupBaseUrl() {
    const value = trimText(process.env.DISCORD_PROFILE_LOOKUP_URL);
    if (!value) {
        return '';
    }
    return value.replace(/\/+$/, '');
}

function getCached(discordId) {
    const cached = lookupCache.get(discordId);
    if (!cached) {
        return null;
    }
    if (cached.expiresAt <= Date.now()) {
        lookupCache.delete(discordId);
        return null;
    }
    return cached.username || '';
}

function setCached(discordId, username) {
    const safeUsername = trimText(username);
    lookupCache.set(discordId, {
        username: safeUsername,
        expiresAt: Date.now() + (safeUsername ? POSITIVE_CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS),
    });
}

async function fetchDiscordUsername(discordId) {
    const lookupBaseUrl = normalizeLookupBaseUrl();
    const lookupKey = trimText(process.env.DISCORD_PROFILE_LOOKUP_KEY);
    if (!lookupBaseUrl || !lookupKey || !discordId) {
        return '';
    }

    try {
        const response = await fetch(`${lookupBaseUrl}/${encodeURIComponent(discordId)}`, {
            headers: {
                'x-internal-api-key': lookupKey,
            },
        });

        if (!response.ok) {
            return '';
        }

        const data = await response.json();
        const user = data && typeof data === 'object' ? data.user : null;
        const username = trimText(user && (user.username || user.globalName));
        return username;
    } catch (error) {
        console.warn('[DiscordResolver] lookup failed:', error.message);
        return '';
    }
}

async function resolveDiscordIdentity({ discordId, discordUsername }) {
    const normalizedDiscordId = trimText(discordId);
    const normalizedDiscordUsername = trimText(discordUsername);

    if (!normalizedDiscordId) {
        return {
            discordId: '',
            discordUsername: normalizedDiscordUsername,
        };
    }

    if (normalizedDiscordUsername) {
        setCached(normalizedDiscordId, normalizedDiscordUsername);
        return {
            discordId: normalizedDiscordId,
            discordUsername: normalizedDiscordUsername,
        };
    }

    const cachedUsername = getCached(normalizedDiscordId);
    if (cachedUsername !== null) {
        return {
            discordId: normalizedDiscordId,
            discordUsername: cachedUsername,
        };
    }

    const fetchedUsername = await fetchDiscordUsername(normalizedDiscordId);
    setCached(normalizedDiscordId, fetchedUsername);

    return {
        discordId: normalizedDiscordId,
        discordUsername: fetchedUsername,
    };
}

module.exports = {
    resolveDiscordIdentity,
};
