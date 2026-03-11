--[[
  Panel SDK — Lightweight heartbeat module for Roblox scripts
  Sends HMAC-signed heartbeats to the analytics panel every 30 seconds.
  
  Usage:
    local sdk = loadstring(game:HttpGet(PANEL_URL .. "/sdk/panel_sdk.lua"))()
    sdk.init(PANEL_URL, "script_slug", "hmac_key")
]]

local PanelSDK = {}

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local lp = Players.LocalPlayer

-- Minimal HMAC-SHA256 using bit32 ops (pure Lua, no external deps)
-- We use a simplified approach: send the message components and let
-- the server verify. For Roblox, we compute HMAC via a helper.

local function hmac_sha256(key, message)
    -- Use syn.crypt or crypt if available (most modern executors have this)
    if syn and syn.crypt and syn.crypt.custom then
        local ok, result = pcall(function()
            return syn.crypt.custom.hash("sha256", message, key)
        end)
        if ok then return result end
    end
    
    if crypt and crypt.hmac then
        local ok, result = pcall(function()
            return crypt.hmac(message, key, "sha256")
        end)
        if ok then return result end
    end
    
    -- Fallback for executors with request() that supports headers
    -- We'll send the raw components and use a simpler signing approach
    if hash and type(hash) == "function" then
        local ok, result = pcall(function()
            return hash("sha256", key .. message)
        end)
        if ok then return result end
    end
    
    -- Last resort: use the executor's built-in HMAC
    if syn and syn.crypt and syn.crypt.hmac then
        local ok, result = pcall(function()
            return syn.crypt.hmac("sha256", message, key)
        end)
        if ok then return result end
    end
    
    -- Wave/Fluxus style
    if crypt and crypt.generatekey then
        local ok, result = pcall(function()
            local h = crypt.hmac(message, key, "sha256")
            return h
        end)
        if ok then return result end
    end
    
    return nil
end

local function getExecutorName()
    local names = {
        {"identifyexecutor", identifyexecutor},
        {"getexecutorname", getexecutorname},
    }
    for _, pair in ipairs(names) do
        if type(pair[2]) == "function" then
            local ok, name = pcall(pair[2])
            if ok and name then return tostring(name) end
        end
    end
    return "Unknown"
end

local function sendHeartbeat(panelUrl, scriptSlug, hmacKey)
    local ok, err = pcall(function()
        local timestamp = tostring(math.floor(os.time()))
        local message = scriptSlug .. ":" .. tostring(lp.UserId) .. ":" .. timestamp
        local signature = hmac_sha256(hmacKey, message)
        
        if not signature then
            warn("[Panel SDK] HMAC computation failed — heartbeat skipped")
            return
        end
        
        local payload = HttpService:JSONEncode({
            script = scriptSlug,
            user = lp.Name,
            userid = tostring(lp.UserId),
            executor = getExecutorName(),
            jobid = game.JobId or "",
            timestamp = timestamp,
            signature = signature
        })
        
        -- Try multiple HTTP methods (executor compatibility)
        local sent = false
        
        -- Method 1: request() / http_request() / syn.request()
        local requestFn = request or http_request or (syn and syn.request) or httprequest
        if requestFn and not sent then
            local s, _ = pcall(function()
                requestFn({
                    Url = panelUrl .. "/api/heartbeat",
                    Method = "POST",
                    Headers = {
                        ["Content-Type"] = "application/json"
                    },
                    Body = payload
                })
            end)
            if s then sent = true end
        end
        
        -- Method 2: HttpPost if available
        if not sent then
            pcall(function()
                game:HttpPost(panelUrl .. "/api/heartbeat", payload, "application/json")
            end)
        end
    end)
    
    if not ok then
        -- Silent fail — never crash the parent script
    end
end

function PanelSDK.init(panelUrl, scriptSlug, hmacKey)
    if not panelUrl or not scriptSlug or not hmacKey then
        warn("[Panel SDK] Missing configuration — heartbeat disabled")
        return
    end
    
    -- Strip trailing slash
    panelUrl = panelUrl:gsub("/$", "")
    
    -- Send initial heartbeat
    task.spawn(function()
        task.wait(2) -- Small delay to let script initialize
        sendHeartbeat(panelUrl, scriptSlug, hmacKey)
        
        -- Then send every 30 seconds
        while task.wait(30) do
            sendHeartbeat(panelUrl, scriptSlug, hmacKey)
        end
    end)
end

return PanelSDK
