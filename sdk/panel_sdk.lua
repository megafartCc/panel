--[[
  Panel SDK v2 — WebSocket-based real-time presence
  Uses persistent WebSocket connection (zero polling overhead).
  Falls back to HTTP heartbeats if WebSocket is unavailable.
  
  Usage:
    local PanelSDK = loadstring(game:HttpGet(PANEL_URL .. "/sdk/panel_sdk.lua"))()
    PanelSDK.init(PANEL_URL, "script_slug", "hmac_key")
]]

local PanelSDK = {}

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local lp = Players.LocalPlayer

-- ============================================
-- HMAC helper (multi-executor compat)
-- ============================================
local function computeHmac(key, message)
    -- Synapse X / Synapse Z
    if syn and syn.crypt and syn.crypt.hmac then
        local ok, r = pcall(syn.crypt.hmac, "sha256", message, key)
        if ok and r then return r end
    end
    if syn and syn.crypt and syn.crypt.custom and syn.crypt.custom.hash then
        local ok, r = pcall(syn.crypt.custom.hash, "sha256", message, key)
        if ok and r then return r end
    end
    -- Fluxus / Wave / generic crypt
    if crypt and crypt.hmac then
        local ok, r = pcall(crypt.hmac, message, key, "sha256")
        if ok and r then return r end
    end
    -- Scriptware
    if hash and type(hash) == "function" then
        local ok, r = pcall(hash, "sha256", key .. message)
        if ok and r then return r end
    end
    return nil
end

local function getExecutorName()
    for _, fn in ipairs({identifyexecutor, getexecutorname}) do
        if type(fn) == "function" then
            local ok, name = pcall(fn)
            if ok and name then return tostring(name) end
        end
    end
    return "Unknown"
end

-- ============================================
-- Build the identify payload
-- ============================================
local function buildIdentifyPayload(scriptSlug, hmacKey)
    local timestamp = tostring(math.floor(os.time()))
    local userid = tostring(lp.UserId)
    local message = scriptSlug .. ":" .. userid .. ":" .. timestamp
    local signature = computeHmac(hmacKey, message)
    if not signature then return nil end
    
    return HttpService:JSONEncode({
        type = "identify",
        script = scriptSlug,
        user = lp.Name,
        userid = userid,
        executor = getExecutorName(),
        jobid = game.JobId or "",
        timestamp = timestamp,
        signature = signature
    })
end

-- ============================================
-- WebSocket connection (primary)
-- ============================================
local function connectWebSocket(panelUrl, scriptSlug, hmacKey)
    if not WebSocket or not WebSocket.connect then
        return false
    end
    
    local wsUrl = panelUrl:gsub("^http", "ws") .. "/ws/script"
    
    local ok, ws = pcall(WebSocket.connect, wsUrl)
    if not ok or not ws then
        return false
    end
    
    -- Send identify message
    local payload = buildIdentifyPayload(scriptSlug, hmacKey)
    if not payload then
        pcall(function() ws:Close() end)
        return false
    end
    
    local identified = false
    
    ws.OnMessage:Connect(function(msg)
        local s, data = pcall(HttpService.JSONDecode, HttpService, msg)
        if not s then return end
        
        if data.type == "identified" then
            identified = true
        elseif data.type == "ping" then
            -- Server keepalive ping, respond with pong + heartbeat
            pcall(function()
                ws:Send(HttpService:JSONEncode({ type = "ping" }))
            end)
        end
    end)
    
    ws.OnClose:Connect(function()
        -- Auto-reconnect after 5 seconds
        task.delay(5, function()
            pcall(connectWebSocket, panelUrl, scriptSlug, hmacKey)
        end)
    end)
    
    pcall(function() ws:Send(payload) end)
    
    -- Store reference so we can close on unload
    PanelSDK._ws = ws
    PanelSDK._connected = true
    
    return true
end

-- ============================================
-- HTTP heartbeat fallback (if no WebSocket)
-- ============================================
local function httpHeartbeatLoop(panelUrl, scriptSlug, hmacKey)
    while true do
        pcall(function()
            local timestamp = tostring(math.floor(os.time()))
            local userid = tostring(lp.UserId)
            local message = scriptSlug .. ":" .. userid .. ":" .. timestamp
            local signature = computeHmac(hmacKey, message)
            if not signature then return end
            
            local payload = HttpService:JSONEncode({
                script = scriptSlug,
                user = lp.Name,
                userid = userid,
                executor = getExecutorName(),
                jobid = game.JobId or "",
                timestamp = timestamp,
                signature = signature
            })
            
            local requestFn = request or http_request or (syn and syn.request) or httprequest
            if requestFn then
                requestFn({
                    Url = panelUrl .. "/api/heartbeat",
                    Method = "POST",
                    Headers = { ["Content-Type"] = "application/json" },
                    Body = payload
                })
            end
        end)
        task.wait(30)
    end
end

-- ============================================
-- Public API
-- ============================================
function PanelSDK.init(panelUrl, scriptSlug, hmacKey)
    if not panelUrl or not scriptSlug or not hmacKey then
        return
    end
    
    panelUrl = panelUrl:gsub("/$", "")
    
    task.spawn(function()
        task.wait(2) -- Let the script initialize first
        
        -- Try WebSocket first (much more efficient)
        local wsOk = pcall(connectWebSocket, panelUrl, scriptSlug, hmacKey)
        
        if not wsOk or not PanelSDK._connected then
            -- Fallback to HTTP heartbeats
            httpHeartbeatLoop(panelUrl, scriptSlug, hmacKey)
        end
    end)
end

return PanelSDK
