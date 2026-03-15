import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../lib/api';
import { Check, Copy, KeyRound, LoaderCircle, Plus, Shield, Trash2, Wrench } from 'lucide-react';

function CopyButton({ text }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
    };

    return (
        <button type="button" onClick={handleCopy} className="btn-ghost">
            {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied' : 'Copy'}
        </button>
    );
}

function IntegrationModal({ script, onClose }) {
    const snippet = `local PANEL_URL = "https://YOUR_DOMAIN.com"
local PANEL_SLUG = "${script.slug}"
local PANEL_KEY = "${script.hmac_key}"

pcall(function()
    local cacheBust = tostring(os.clock()):gsub("%.", "")
    local sdk = loadstring(game:HttpGet("https://raw.githubusercontent.com/megafartCc/panel/refs/heads/main/sdk/panel_sdk.lua?cb=" .. cacheBust))()
    sdk.init(PANEL_URL, PANEL_SLUG, PANEL_KEY)
end)`;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="panel w-full max-w-4xl p-6 sm:p-7" onClick={(event) => event.stopPropagation()}>
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <p className="section-kicker">Integration</p>
                        <h3 className="section-title mt-2 text-3xl font-semibold text-zinc-950">{script.name}</h3>
                        <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-500">
                            Embed this snippet into the script entrypoint. The heartbeat payload still uses the script slug and HMAC key below.
                        </p>
                    </div>
                    <button type="button" onClick={onClose} className="btn-ghost">Close</button>
                </div>

                <div className="mt-6 grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
                    <div className="card surface-soft space-y-4 p-4">
                        <div>
                            <p className="field-label">Slug</p>
                            <p className="break-all text-sm font-medium text-zinc-950">{script.slug}</p>
                        </div>
                        <div>
                            <p className="field-label">HMAC key</p>
                            <p className="break-all text-sm font-medium text-zinc-950">{script.hmac_key}</p>
                        </div>
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
                            Keep this key private. Anyone holding it can impersonate heartbeat traffic for this script slug.
                        </div>
                    </div>

                    <div className="card overflow-hidden border-zinc-900 bg-zinc-950 text-zinc-100">
                        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                            <p className="section-kicker text-zinc-400">Snippet</p>
                            <CopyButton text={snippet} />
                        </div>
                        <pre className="overflow-x-auto p-4 text-sm leading-7 text-zinc-100">{snippet}</pre>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function Scripts() {
    const [scripts, setScripts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [newName, setNewName] = useState('');
    const [newSlug, setNewSlug] = useState('');
    const [addError, setAddError] = useState('');
    const [addLoading, setAddLoading] = useState(false);
    const [snippetScript, setSnippetScript] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    const totalLive = useMemo(() => scripts.reduce((sum, script) => sum + (script.active_users || 0), 0), [scripts]);

    const loadScripts = async () => {
        try {
            const data = await apiFetch('/scripts');
            setScripts(data);
        } catch (error) {
            console.error('Failed to load scripts:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadScripts();
    }, []);

    const handleAdd = async (event) => {
        event.preventDefault();
        setAddError('');
        setAddLoading(true);

        try {
            await apiFetch('/scripts', {
                method: 'POST',
                body: JSON.stringify({ name: newName, slug: newSlug }),
            });
            setNewName('');
            setNewSlug('');
            setShowAdd(false);
            await loadScripts();
        } catch (error) {
            setAddError(error.message);
        } finally {
            setAddLoading(false);
        }
    };

    const handleDelete = async (id) => {
        try {
            await apiFetch(`/scripts/${id}`, { method: 'DELETE' });
            setDeleteConfirm(null);
            await loadScripts();
        } catch (error) {
            console.error('Failed to delete script:', error);
        }
    };

    const handleViewKey = async (scriptId) => {
        try {
            const data = await apiFetch(`/scripts/${scriptId}/key`);
            setSnippetScript(data);
        } catch (error) {
            console.error('Failed to load script key:', error);
        }
    };

    if (loading) {
        return (
            <div className="panel flex h-72 items-center justify-center">
                <LoaderCircle className="h-7 w-7 animate-spin text-zinc-900" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
                <article className="panel p-6">
                    <p className="section-kicker">Registry</p>
                    <h2 className="section-title mt-2 text-4xl font-semibold text-zinc-950">Manage script identities and shipping keys.</h2>
                    <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-500">
                        Each script gets its own slug and HMAC key. The panel exposes a clean integration modal instead of burying it in raw admin controls.
                    </p>

                    <div className="mt-6 grid gap-4 sm:grid-cols-3">
                        <div className="card surface-soft p-4">
                            <p className="section-kicker">Scripts</p>
                            <p className="mt-3 text-3xl font-semibold text-zinc-950">{scripts.length}</p>
                        </div>
                        <div className="card surface-soft p-4">
                            <p className="section-kicker">Live users</p>
                            <p className="mt-3 text-3xl font-semibold text-zinc-950">{totalLive}</p>
                        </div>
                        <div className="card surface-soft p-4">
                            <p className="section-kicker">Auth</p>
                            <p className="mt-3 text-3xl font-semibold text-zinc-950">HMAC</p>
                        </div>
                    </div>
                </article>

                <article className="panel p-6">
                    <p className="section-kicker">Action</p>
                    <h3 className="section-title mt-2 text-3xl font-semibold text-zinc-950">Register a new script</h3>
                    <p className="mt-3 text-sm leading-7 text-zinc-500">
                        New scripts receive a unique HMAC key immediately. Open the integration modal after creation to copy the embed snippet.
                    </p>
                    <button type="button" onClick={() => setShowAdd((value) => !value)} className="btn btn-dark mt-6 w-full sm:w-auto">
                        <Plus className="h-4 w-4" />
                        {showAdd ? 'Hide form' : 'Add script'}
                    </button>
                </article>
            </section>

            {showAdd && (
                <section className="panel p-6">
                    <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700">
                            <Wrench className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="text-2xl font-semibold text-zinc-950">Register new script</h3>
                            <p className="text-sm text-zinc-500">Keep slug short, stable, and lowercase.</p>
                        </div>
                    </div>

                    {addError && (
                        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                            {addError}
                        </div>
                    )}

                    <form onSubmit={handleAdd} className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.8fr_auto]">
                        <div>
                            <label className="field-label" htmlFor="script-name">Display name</label>
                            <input
                                id="script-name"
                                type="text"
                                placeholder="Display name"
                                value={newName}
                                onChange={(event) => setNewName(event.target.value)}
                                className="input"
                                required
                            />
                        </div>
                        <div>
                            <label className="field-label" htmlFor="script-slug">Script slug</label>
                            <input
                                id="script-slug"
                                type="text"
                                placeholder="script_slug"
                                value={newSlug}
                                onChange={(event) => setNewSlug(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                                className="input"
                                required
                            />
                        </div>
                        <div className="flex items-end">
                            <button type="submit" disabled={addLoading} className="btn w-full lg:w-auto">
                                {addLoading ? 'Creating...' : 'Create'}
                            </button>
                        </div>
                    </form>
                </section>
            )}

            <section className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
                {scripts.map((script) => (
                    <article key={script.id} className="panel p-5">
                        <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700">
                                    <Shield className="h-5 w-5" />
                                </div>
                                <h3 className="mt-4 truncate text-2xl font-semibold text-zinc-950">{script.name}</h3>
                                <p className="mt-2 text-xs uppercase tracking-[0.18em] text-zinc-400">{script.slug}</p>
                            </div>
                            <div className="card surface-soft px-4 py-3 text-right">
                                <p className="section-kicker">Live</p>
                                <p className="mt-2 text-2xl font-semibold text-zinc-950">{script.active_users || 0}</p>
                            </div>
                        </div>

                        <div className="card surface-soft mt-5 p-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="section-kicker">Auth Material</p>
                                    <p className="mt-2 text-sm text-zinc-500">Open integration to copy the embed snippet and current HMAC key.</p>
                                </div>
                                <KeyRound className="h-4 w-4 text-zinc-400" />
                            </div>
                        </div>

                        <div className="mt-5 flex flex-wrap gap-3">
                            <button type="button" onClick={() => handleViewKey(script.id)} className="btn btn-dark">
                                <KeyRound className="h-4 w-4" />
                                Integration
                            </button>
                            <button type="button" onClick={() => setDeleteConfirm(deleteConfirm === script.id ? null : script.id)} className="btn-ghost">
                                <Trash2 className="h-4 w-4" />
                                Delete
                            </button>
                        </div>

                        {deleteConfirm === script.id && (
                            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4">
                                <p className="text-sm text-red-700">
                                    Delete <span className="font-semibold">{script.name}</span>? This removes session history for the script.
                                </p>
                                <div className="mt-4 flex flex-wrap gap-3">
                                    <button type="button" onClick={() => handleDelete(script.id)} className="btn-danger">
                                        Confirm delete
                                    </button>
                                    <button type="button" onClick={() => setDeleteConfirm(null)} className="btn-ghost">
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}
                    </article>
                ))}

                {scripts.length === 0 && (
                    <div className="panel col-span-full px-5 py-14 text-center">
                        <Shield className="mx-auto h-10 w-10 text-zinc-400" />
                        <p className="mt-4 text-lg font-semibold text-zinc-950">No scripts registered yet</p>
                        <p className="mt-2 text-sm text-zinc-500">Create one and the panel will generate its HMAC key automatically.</p>
                    </div>
                )}
            </section>

            {snippetScript && <IntegrationModal script={snippetScript} onClose={() => setSnippetScript(null)} />}
        </div>
    );
}
