import { useState, useEffect } from 'react'
import { apiFetch } from '../lib/api'
import { Plus, Trash2, Key, Copy, Check, Code2, Users, Loader2 } from 'lucide-react'

function CopyButton({ text }) {
    const [copied, setCopied] = useState(false)

    const handleCopy = async () => {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <button
            onClick={handleCopy}
            className="p-1.5 rounded-md hover:bg-panel-card-hover transition-colors cursor-pointer"
            title="Copy to clipboard"
        >
            {copied ? <Check className="w-3.5 h-3.5 text-panel-success" /> : <Copy className="w-3.5 h-3.5 text-panel-text-muted" />}
        </button>
    )
}

function LuaSnippetModal({ script, onClose }) {
    const snippet = `-- Add this near the top of your script
local PANEL_URL = "https://YOUR_DOMAIN.com" -- Change to your deployed URL
local PANEL_SCRIPT = "${script.slug}"
local PANEL_KEY = "${script.hmac_key}"

-- Load Panel SDK
pcall(function()
    local sdk = loadstring(game:HttpGet(PANEL_URL .. "/sdk/panel_sdk.lua"))()
    sdk.init(PANEL_URL, PANEL_SCRIPT, PANEL_KEY)
end)`

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-panel-card border border-panel-border rounded-2xl p-6 max-w-xl w-full shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-white">Integration Code</h3>
                    <button onClick={onClose} className="text-panel-text-muted hover:text-white transition-colors cursor-pointer">✕</button>
                </div>
                <p className="text-sm text-panel-text-dim mb-3">
                    Add this snippet to <span className="text-panel-accent font-mono">{script.slug}.lua</span> to start sending heartbeats:
                </p>
                <div className="relative">
                    <pre className="bg-panel-bg border border-panel-border rounded-xl p-4 text-sm text-panel-text font-mono overflow-x-auto whitespace-pre">
                        {snippet}
                    </pre>
                    <div className="absolute top-2 right-2">
                        <CopyButton text={snippet} />
                    </div>
                </div>
                <div className="mt-4 p-3 rounded-lg bg-panel-warning/10 border border-panel-warning/20">
                    <p className="text-xs text-panel-warning">
                        ⚠️ Keep the HMAC key private. Anyone with this key can send heartbeats for this script.
                    </p>
                </div>
            </div>
        </div>
    )
}

export default function Scripts() {
    const [scripts, setScripts] = useState([])
    const [loading, setLoading] = useState(true)
    const [showAdd, setShowAdd] = useState(false)
    const [newName, setNewName] = useState('')
    const [newSlug, setNewSlug] = useState('')
    const [addError, setAddError] = useState('')
    const [addLoading, setAddLoading] = useState(false)
    const [snippetScript, setSnippetScript] = useState(null)
    const [deleteConfirm, setDeleteConfirm] = useState(null)

    const loadScripts = async () => {
        try {
            const data = await apiFetch('/scripts')
            setScripts(data)
        } catch (err) {
            console.error('Failed to load scripts:', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { loadScripts() }, [])

    const handleAdd = async (e) => {
        e.preventDefault()
        setAddError('')
        setAddLoading(true)

        try {
            await apiFetch('/scripts', {
                method: 'POST',
                body: JSON.stringify({ name: newName, slug: newSlug })
            })
            setNewName('')
            setNewSlug('')
            setShowAdd(false)
            loadScripts()
        } catch (err) {
            setAddError(err.message)
        } finally {
            setAddLoading(false)
        }
    }

    const handleDelete = async (id) => {
        try {
            await apiFetch(`/scripts/${id}`, { method: 'DELETE' })
            setDeleteConfirm(null)
            loadScripts()
        } catch (err) {
            console.error('Failed to delete:', err)
        }
    }

    const handleViewKey = async (scriptId) => {
        try {
            const data = await apiFetch(`/scripts/${scriptId}/key`)
            setSnippetScript(data)
        } catch (err) {
            console.error('Failed to get key:', err)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-6 h-6 text-panel-accent animate-spin" />
            </div>
        )
    }

    return (
        <div className="p-6 space-y-6 max-w-[1200px] mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">Scripts</h1>
                    <p className="text-sm text-panel-text-muted mt-0.5">Manage your monitored scripts</p>
                </div>
                <button
                    id="add-script-btn"
                    onClick={() => setShowAdd(!showAdd)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-panel-accent to-panel-accent-dim text-white font-medium text-sm hover:opacity-90 transition-all shadow-md shadow-panel-accent/20 cursor-pointer"
                >
                    <Plus className="w-4 h-4" />
                    Add Script
                </button>
            </div>

            {/* Add Script Form */}
            {showAdd && (
                <div className="bg-panel-card border border-panel-border rounded-xl p-5 animate-pulse-glow">
                    <h3 className="text-sm font-semibold text-white mb-4">Register New Script</h3>
                    {addError && (
                        <div className="mb-3 p-2.5 rounded-lg bg-panel-danger/10 border border-panel-danger/20 text-panel-danger text-sm">
                            {addError}
                        </div>
                    )}
                    <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-3">
                        <input
                            id="script-name"
                            type="text"
                            placeholder="Display name (e.g. SAB New)"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            className="flex-1 px-4 py-2 rounded-lg bg-panel-bg border border-panel-border text-white text-sm placeholder-panel-text-muted focus:outline-none focus:border-panel-accent/50 transition-colors"
                            required
                        />
                        <input
                            id="script-slug"
                            type="text"
                            placeholder="Slug (e.g. sabnew)"
                            value={newSlug}
                            onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                            className="w-48 px-4 py-2 rounded-lg bg-panel-bg border border-panel-border text-white text-sm font-mono placeholder-panel-text-muted focus:outline-none focus:border-panel-accent/50 transition-colors"
                            required
                        />
                        <div className="flex gap-2">
                            <button
                                type="submit"
                                disabled={addLoading}
                                className="px-4 py-2 rounded-lg bg-panel-success/20 text-panel-success text-sm font-medium hover:bg-panel-success/30 transition-colors disabled:opacity-50 cursor-pointer"
                            >
                                {addLoading ? 'Creating...' : 'Create'}
                            </button>
                            <button
                                type="button"
                                onClick={() => { setShowAdd(false); setAddError('') }}
                                className="px-4 py-2 rounded-lg bg-panel-card-hover text-panel-text-dim text-sm hover:text-white transition-colors cursor-pointer"
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Scripts Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {scripts.map(script => (
                    <div key={script.id} className="bg-panel-card border border-panel-border rounded-xl p-5 hover:border-panel-accent/30 transition-all group">
                        <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-lg bg-panel-accent/15 flex items-center justify-center">
                                    <Code2 className="w-4.5 h-4.5 text-panel-accent" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-semibold text-white">{script.name}</h3>
                                    <p className="text-xs text-panel-text-muted font-mono">{script.slug}</p>
                                </div>
                            </div>
                        </div>

                        {/* Active users */}
                        <div className="flex items-center gap-1.5 mb-4">
                            <Users className="w-3.5 h-3.5 text-panel-success" />
                            <span className="text-sm font-semibold text-white">{script.active_users || 0}</span>
                            <span className="text-xs text-panel-text-muted">active</span>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 pt-3 border-t border-panel-border/50">
                            <button
                                onClick={() => handleViewKey(script.id)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-panel-accent/10 text-panel-accent text-xs font-medium hover:bg-panel-accent/20 transition-colors cursor-pointer"
                            >
                                <Key className="w-3 h-3" />
                                Integration
                            </button>
                            <button
                                onClick={() => setDeleteConfirm(script.id)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-panel-text-muted text-xs hover:bg-panel-danger/10 hover:text-panel-danger transition-all ml-auto cursor-pointer"
                            >
                                <Trash2 className="w-3 h-3" />
                            </button>
                        </div>

                        {/* Delete confirmation */}
                        {deleteConfirm === script.id && (
                            <div className="mt-3 p-3 rounded-lg bg-panel-danger/10 border border-panel-danger/20">
                                <p className="text-xs text-panel-danger mb-2">Delete "{script.name}"? This removes all session data.</p>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleDelete(script.id)}
                                        className="px-3 py-1 rounded bg-panel-danger text-white text-xs font-medium hover:bg-panel-danger/80 cursor-pointer"
                                    >
                                        Delete
                                    </button>
                                    <button
                                        onClick={() => setDeleteConfirm(null)}
                                        className="px-3 py-1 rounded bg-panel-card-hover text-panel-text-dim text-xs hover:text-white cursor-pointer"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ))}

                {scripts.length === 0 && (
                    <div className="col-span-full text-center py-12 text-panel-text-muted">
                        <Code2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p className="text-sm">No scripts registered yet</p>
                        <p className="text-xs mt-1">Click "Add Script" to get started</p>
                    </div>
                )}
            </div>

            {/* Snippet Modal */}
            {snippetScript && (
                <LuaSnippetModal script={snippetScript} onClose={() => setSnippetScript(null)} />
            )}
        </div>
    )
}
