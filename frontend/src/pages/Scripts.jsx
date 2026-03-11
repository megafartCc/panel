import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../lib/api';
import { Check, Copy, KeyRound, LoaderCircle, Plus, ShieldCheck, Sparkles, Trash2, Wrench } from 'lucide-react';

function CopyButton({ text }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
    };

    return (
        <button
            onClick={handleCopy}
            className="inline-flex items-center gap-2 rounded-xl border border-panel-border bg-white/[0.04] px-3 py-2 text-xs text-panel-text-dim transition hover:bg-white/[0.08] hover:text-white"
        >
            {copied ? <Check className="h-3.5 w-3.5 text-panel-success" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy'}
        </button>
    );
}

function IntegrationModal({ script, onClose }) {
    const snippet = `local PANEL_URL = "https://YOUR_DOMAIN.com"
local PANEL_SCRIPT = "${script.slug}"
local PANEL_KEY = "${script.hmac_key}"

pcall(function()
    local sdk = loadstring(game:HttpGet(PANEL_URL .. "/sdk/panel_sdk.lua"))()
    sdk.init(PANEL_URL, PANEL_SCRIPT, PANEL_KEY)
end)`;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/72 p-4 backdrop-blur-md"
            onClick={onClose}
        >
            <div
                className="panel-card-strong panel-ring w-full max-w-3xl rounded-[30px] p-5 sm:p-6"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <p className="panel-mono text-[11px] uppercase tracking-[0.3em] text-panel-text-muted">Integration</p>
                        <h3 className="mt-2 text-2xl font-semibold">{script.name}</h3>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-panel-text-dim">
                            Embed this snippet into the script entrypoint. The heartbeat payload uses the script slug and HMAC key below.
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-2xl border border-panel-border bg-white/[0.04] px-4 py-2 text-sm text-panel-text-dim transition hover:bg-white/[0.08] hover:text-white"
                    >
                        Close
                    </button>
                </div>

                <div className="mt-6 grid gap-4 lg:grid-cols-[0.88fr_1.12fr]">
                    <div className="space-y-4 rounded-[24px] border border-panel-border bg-white/[0.04] p-4">
                        <div>
                            <p className="panel-mono text-[11px] uppercase tracking-[0.26em] text-panel-text-muted">Slug</p>
                            <p className="panel-mono mt-2 text-sm text-white">{script.slug}</p>
                        </div>
                        <div>
                            <p className="panel-mono text-[11px] uppercase tracking-[0.26em] text-panel-text-muted">HMAC key</p>
                            <p className="panel-mono mt-2 break-all text-sm text-white">{script.hmac_key}</p>
                        </div>
                        <div className="rounded-2xl border border-panel-border bg-[linear-gradient(135deg,_rgba(255,107,87,0.12),_rgba(103,184,255,0.08))] p-4 text-sm text-panel-text-dim">
                            Keep this key private. Anyone holding it can impersonate heartbeat traffic for this script slug.
                        </div>
                    </div>

                    <div className="rounded-[24px] border border-panel-border bg-[#050b15] p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <p className="panel-mono text-[11px] uppercase tracking-[0.26em] text-panel-text-muted">Snippet</p>
                            <CopyButton text={snippet} />
                        </div>
                        <pre className="panel-mono overflow-x-auto whitespace-pre rounded-[18px] border border-panel-border bg-black/20 p-4 text-sm leading-7 text-[#dbe7ff]">
                            {snippet}
                        </pre>
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

    const totalLive = useMemo(
        () => scripts.reduce((sum, script) => sum + (script.active_users || 0), 0),
        [scripts],
    );

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
            <div className="panel-card panel-ring flex h-72 items-center justify-center rounded-[28px]">
                <LoaderCircle className="h-7 w-7 animate-spin text-panel-accent" />
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
                <div className="panel-card panel-ring rounded-[28px] px-5 py-6 sm:px-6">
                    <p className="panel-mono text-[11px] uppercase tracking-[0.3em] text-panel-text-muted">Registry</p>
                    <h1 className="panel-title mt-3 text-3xl font-bold">Manage script identities, shipping keys, and embed snippets.</h1>
                    <p className="mt-3 max-w-3xl text-sm leading-7 text-panel-text-dim">
                        Each script gets its own slug and HMAC key. This page should feel like a deployment registry, not a debug panel.
                    </p>

                    <div className="mt-6 grid gap-4 sm:grid-cols-3">
                        <div className="rounded-[24px] border border-panel-border bg-white/[0.04] p-4">
                            <p className="panel-mono text-[11px] uppercase tracking-[0.26em] text-panel-text-muted">Scripts</p>
                            <p className="mt-3 text-3xl font-semibold">{scripts.length}</p>
                        </div>
                        <div className="rounded-[24px] border border-panel-border bg-white/[0.04] p-4">
                            <p className="panel-mono text-[11px] uppercase tracking-[0.26em] text-panel-text-muted">Live users</p>
                            <p className="mt-3 text-3xl font-semibold">{totalLive}</p>
                        </div>
                        <div className="rounded-[24px] border border-panel-border bg-white/[0.04] p-4">
                            <p className="panel-mono text-[11px] uppercase tracking-[0.26em] text-panel-text-muted">Managed auth</p>
                            <p className="mt-3 text-3xl font-semibold">HMAC</p>
                        </div>
                    </div>
                </div>

                <div className="panel-card panel-ring rounded-[28px] p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="panel-mono text-[11px] uppercase tracking-[0.3em] text-panel-text-muted">Action</p>
                            <h2 className="mt-2 text-xl font-semibold">Register a new script target</h2>
                            <p className="mt-2 text-sm leading-6 text-panel-text-dim">
                                New scripts get a unique HMAC key immediately. The integration modal exposes the embed snippet.
                            </p>
                        </div>
                        <button
                            onClick={() => setShowAdd((value) => !value)}
                            className="inline-flex items-center gap-2 rounded-2xl bg-[linear-gradient(135deg,_rgba(255,107,87,0.94),_rgba(245,158,11,0.88))] px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(255,107,87,0.24)] transition hover:translate-y-[-1px]"
                        >
                            <Plus className="h-4 w-4" />
                            {showAdd ? 'Hide form' : 'Add script'}
                        </button>
                    </div>
                </div>
            </section>

            {showAdd && (
                <section className="panel-card panel-ring rounded-[28px] p-5 sm:p-6">
                    <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,_rgba(255,107,87,0.16),_rgba(103,184,255,0.14))]">
                            <Wrench className="h-5 w-5 text-panel-accent" />
                        </div>
                        <div>
                            <h3 className="text-xl font-semibold">Register new script</h3>
                            <p className="text-sm text-panel-text-dim">Keep slug short, stable, and lowercase.</p>
                        </div>
                    </div>

                    {addError && (
                        <div className="mt-5 rounded-2xl border border-panel-danger/25 bg-panel-danger/10 px-4 py-3 text-sm text-panel-danger">
                            {addError}
                        </div>
                    )}

                    <form onSubmit={handleAdd} className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.8fr_auto]">
                        <input
                            type="text"
                            placeholder="Display name"
                            value={newName}
                            onChange={(event) => setNewName(event.target.value)}
                            className="rounded-2xl border border-panel-border bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition focus:border-white/20"
                            required
                        />
                        <input
                            type="text"
                            placeholder="script_slug"
                            value={newSlug}
                            onChange={(event) => setNewSlug(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                            className="panel-mono rounded-2xl border border-panel-border bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition focus:border-white/20"
                            required
                        />
                        <button
                            type="submit"
                            disabled={addLoading}
                            className="rounded-2xl bg-[linear-gradient(135deg,_rgba(87,217,130,0.9),_rgba(110,231,216,0.84))] px-5 py-3 text-sm font-semibold text-slate-950 transition hover:opacity-95 disabled:opacity-60"
                        >
                            {addLoading ? 'Creating...' : 'Create'}
                        </button>
                    </form>
                </section>
            )}

            <section className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
                {scripts.map((script) => (
                    <article key={script.id} className="panel-card panel-ring rounded-[28px] p-5 sm:p-6">
                        <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,_rgba(255,107,87,0.16),_rgba(103,184,255,0.14))]">
                                    <ShieldCheck className="h-5 w-5 text-panel-accent" />
                                </div>
                                <h3 className="truncate text-xl font-semibold">{script.name}</h3>
                                <p className="panel-mono mt-2 text-xs uppercase tracking-[0.24em] text-panel-text-muted">{script.slug}</p>
                            </div>
                            <div className="rounded-2xl border border-panel-border bg-white/[0.04] px-4 py-3 text-right">
                                <p className="panel-mono text-[10px] uppercase tracking-[0.26em] text-panel-text-muted">Live</p>
                                <p className="mt-2 text-2xl font-semibold">{script.active_users || 0}</p>
                            </div>
                        </div>

                        <div className="mt-5 rounded-[24px] border border-panel-border bg-white/[0.04] p-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="panel-mono text-[11px] uppercase tracking-[0.26em] text-panel-text-muted">Auth material</p>
                                    <p className="mt-2 text-sm text-panel-text-dim">Use the integration modal to copy the embed snippet and HMAC key.</p>
                                </div>
                                <Sparkles className="h-4 w-4 text-panel-secondary" />
                            </div>
                        </div>

                        <div className="mt-5 flex flex-wrap items-center gap-3">
                            <button
                                onClick={() => handleViewKey(script.id)}
                                className="inline-flex items-center gap-2 rounded-2xl bg-[linear-gradient(135deg,_rgba(255,107,87,0.92),_rgba(245,158,11,0.84))] px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(255,107,87,0.2)]"
                            >
                                <KeyRound className="h-4 w-4" />
                                Integration
                            </button>
                            <button
                                onClick={() => setDeleteConfirm(deleteConfirm === script.id ? null : script.id)}
                                className="inline-flex items-center gap-2 rounded-2xl border border-panel-border bg-white/[0.04] px-4 py-3 text-sm text-panel-text-dim transition hover:bg-panel-danger/10 hover:text-panel-danger"
                            >
                                <Trash2 className="h-4 w-4" />
                                Delete
                            </button>
                        </div>

                        {deleteConfirm === script.id && (
                            <div className="mt-4 rounded-[22px] border border-panel-danger/25 bg-panel-danger/10 p-4">
                                <p className="text-sm text-panel-danger">
                                    Delete <span className="font-semibold">{script.name}</span>? This removes session history for the script.
                                </p>
                                <div className="mt-4 flex gap-3">
                                    <button
                                        onClick={() => handleDelete(script.id)}
                                        className="rounded-xl bg-panel-danger px-4 py-2 text-sm font-semibold text-white"
                                    >
                                        Confirm delete
                                    </button>
                                    <button
                                        onClick={() => setDeleteConfirm(null)}
                                        className="rounded-xl border border-panel-border bg-white/[0.04] px-4 py-2 text-sm text-panel-text-dim"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}
                    </article>
                ))}

                {scripts.length === 0 && (
                    <div className="panel-card panel-ring col-span-full rounded-[28px] px-5 py-14 text-center">
                        <ShieldCheck className="mx-auto h-10 w-10 text-panel-text-muted" />
                        <p className="mt-4 text-lg font-semibold">No scripts registered yet</p>
                        <p className="mt-2 text-sm text-panel-text-muted">Create one and the panel will generate its HMAC key automatically.</p>
                    </div>
                )}
            </section>

            {snippetScript && (
                <IntegrationModal script={snippetScript} onClose={() => setSnippetScript(null)} />
            )}
        </div>
    );
}
