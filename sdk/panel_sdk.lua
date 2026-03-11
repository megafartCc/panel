--[[
  Panel SDK v3 — Simple HTTP heartbeat (no WebSocket)
  Sends a signed POST to /api/heartbeat every 10 seconds.
  Server marks you offline if no ping in 15 seconds.

  Usage:
    local PanelSDK = loadstring(game:HttpGet("https://raw.githubusercontent.com/megafartCc/panel/refs/heads/main/sdk/panel_sdk.lua"))()
    PanelSDK.init("https://your-panel.up.railway.app", "sabnew", "your_hmac_key")
]]

local PanelSDK = {}

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local lp = Players.LocalPlayer

-- HMAC helper (multi-executor compat)
local function computeHmac(key, message)
    if syn and syn.crypt and syn.crypt.hmac then
        local ok, r = pcall(syn.crypt.hmac, "sha256", message, key)
        if ok and r then return r end
    end
    if crypt and crypt.hmac then
        local ok, r = pcall(crypt.hmac, message, key, "sha256")
        if ok and r then return r end
    end
    if syn and syn.crypt and syn.crypt.custom and syn.crypt.custom.hash then
        local ok, r = pcall(syn.crypt.custom.hash, "sha256", message, key)
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

local function sendPing(panelUrl, scriptSlug, hmacKey)
    pcall(function()
        local timestamp = tostring(math.floor(os.time()))
        local userid = tostring(lp.UserId)
        local sig = computeHmac(hmacKey, scriptSlug .. ":" .. userid .. ":" .. timestamp)
        if not sig then return end

        local body = HttpService:JSONEncode({
            script = scriptSlug,
            user = lp.Name,
            userid = userid,
            executor = getExecutorName(),
            jobid = game.JobId or "",
            timestamp = timestamp,
            signature = sig
        })

        local requestFn = request or http_request or (syn and syn.request) or httprequest
        if requestFn then
            requestFn({
                Url = panelUrl .. "/api/heartbeat",
                Method = "POST",
                Headers = { ["Content-Type"] = "application/json" },
                Body = body
            })
        end
    end)
end

function PanelSDK.init(panelUrl, scriptSlug, hmacKey)
    if not panelUrl or not scriptSlug or not hmacKey then return end
    panelUrl = panelUrl:gsub("/$", "")

    task.spawn(function()
        task.wait(2)
        while true do
            sendPing(panelUrl, scriptSlug, hmacKey)
            task.wait(10) -- ping every 10 seconds
        end
    end)
end

return PanelSDK
