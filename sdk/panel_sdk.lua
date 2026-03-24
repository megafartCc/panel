--[[
  Panel SDK v3 — Simple HTTP heartbeat (no WebSocket)
  Sends a signed POST to /api/heartbeat every 10 seconds.
  Server marks you offline if no ping in 15 seconds.

  Usage:
    local PanelSDK = loadstring(game:HttpGet("https://raw.githubusercontent.com/megafartCc/panel/refs/heads/main/sdk/panel_sdk.lua"))()
    PanelSDK.init("https://your-panel.up.railway.app", "sabnew", "your_hmac_key")
    -- alias:
    PanelSDK.monitor("https://your-panel.up.railway.app", "sabnew", "your_hmac_key")
]]

local PanelSDK = {}

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local lp = Players.LocalPlayer
local bitlib = bit32
local H0
local k

local function firstFunction(candidates)
    for _, candidate in ipairs(candidates) do
        if type(candidate) == "function" then
            return candidate
        end
    end
    return nil
end

local function buildPureHmac()
    if type(bitlib) ~= "table" then
        return nil
    end

    local band = bitlib.band
    local bnot = bitlib.bnot
    local bxor = bitlib.bxor
    local rrotate = bitlib.rrotate
    local rshift = bitlib.rshift

    local function add32(...)
        local sum = 0
        for i = 1, select("#", ...) do
            sum = (sum + select(i, ...)) % 4294967296
        end
        return sum
    end

    local function str2hexa(s)
        return (s:gsub(".", function(c)
            return string.format("%02x", string.byte(c))
        end))
    end

    local function num2s(l, n)
        local s = ""
        for _ = 1, n do
            local rem = l % 256
            s = string.char(rem) .. s
            l = (l - rem) / 256
        end
        return s
    end

    local function s232num(s, i)
        local a, b, c, d = string.byte(s, i, i + 3)
        return ((a * 256 + b) * 256 + c) * 256 + d
    end

    local function preproc(msg, len)
        local extra = 64 - ((len + 9) % 64)
        len = num2s(8 * len, 8)
        msg = msg .. "\128" .. string.rep("\0", extra) .. len
        return msg
    end

    local function digestblock(msg, i, H)
        local w = {}
        for j = 1, 16 do
            w[j] = s232num(msg, i + (j - 1) * 4)
        end
        for j = 17, 64 do
            local v = w[j - 15]
            local s0 = bxor(rrotate(v, 7), rrotate(v, 18), rshift(v, 3))
            v = w[j - 2]
            local s1 = bxor(rrotate(v, 17), rrotate(v, 19), rshift(v, 10))
            w[j] = add32(w[j - 16], s0, w[j - 7], s1)
        end

        local a, b, c, d, e, f, g, h =
            H[1], H[2], H[3], H[4], H[5], H[6], H[7], H[8]

        for j = 1, 64 do
            local s0 = bxor(rrotate(a, 2), rrotate(a, 13), rrotate(a, 22))
            local maj = bxor(band(a, b), band(a, c), band(b, c))
            local t2 = add32(s0, maj)
            local s1 = bxor(rrotate(e, 6), rrotate(e, 11), rrotate(e, 25))
            local ch = bxor(band(e, f), band(bnot(e), g))
            local t1 = add32(h, s1, ch, k[j], w[j])

            h = g
            g = f
            f = e
            e = add32(d, t1)
            d = c
            c = b
            b = a
            a = add32(t1, t2)
        end

        H[1] = add32(H[1], a)
        H[2] = add32(H[2], b)
        H[3] = add32(H[3], c)
        H[4] = add32(H[4], d)
        H[5] = add32(H[5], e)
        H[6] = add32(H[6], f)
        H[7] = add32(H[7], g)
        H[8] = add32(H[8], h)
    end

    function sha256_binary(msg)
        msg = preproc(msg, #msg)
        local H = { (table.unpack or unpack)(H0) }
        for i = 1, #msg, 64 do
            digestblock(msg, i, H)
        end
        return num2s(H[1], 4) .. num2s(H[2], 4) .. num2s(H[3], 4) .. num2s(H[4], 4)
            .. num2s(H[5], 4) .. num2s(H[6], 4) .. num2s(H[7], 4) .. num2s(H[8], 4)
    end

    local function sha256_hex(msg)
        return str2hexa(sha256_binary(msg))
    end

    local function hmac_sha256_hex(key, msg)
        if #key > 64 then
            key = sha256_binary(key)
        end
        key = key .. string.rep("\0", 64 - #key)

        local o_key_pad = key:gsub(".", function(c)
            return string.char(bxor(string.byte(c), 0x5c))
        end)
        local i_key_pad = key:gsub(".", function(c)
            return string.char(bxor(string.byte(c), 0x36))
        end)

        return sha256_hex(o_key_pad .. sha256_binary(i_key_pad .. msg))
    end

    return hmac_sha256_hex
end

H0 = {
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
}

k = {
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
}

local pureHmacHex = buildPureHmac()

local function normalizeDigestHex(value)
    if value == nil then
        return nil
    end

    local text = tostring(value):gsub("^%s+", ""):gsub("%s+$", "")
    if text == "" then
        return nil
    end

    if text:sub(1, 2) == "0x" or text:sub(1, 2) == "0X" then
        text = text:sub(3)
    end

    if string.match(text, "^[0-9a-fA-F]+$") then
        return string.lower(text)
    end

    local base64 = text:gsub("-", "+"):gsub("_", "/")
    local missing = #base64 % 4
    if missing > 0 then
        base64 = base64 .. string.rep("=", 4 - missing)
    end

    local okDecode, decoded = pcall(function()
        return HttpService:Base64Decode(base64)
    end)
    if not okDecode or type(decoded) ~= "string" or decoded == "" then
        return nil
    end

    local asHex = string.match(decoded, "^%x+$")
    if asHex and #asHex > 0 then
        return string.lower(asHex)
    end

    return (decoded:gsub(".", function(ch)
        return string.format("%02x", string.byte(ch))
    end))
end

-- HMAC helper (multi-executor compat)
local function computeHmac(key, message)
    if pureHmacHex then
        local ok, r = pcall(pureHmacHex, key, message)
        if ok and r then
            local normalized = normalizeDigestHex(r)
            if normalized then return normalized end
        end
    end

    if syn and syn.crypt and syn.crypt.hmac then
        local ok, r = pcall(syn.crypt.hmac, "sha256", message, key)
        if ok and r then
            local normalized = normalizeDigestHex(r)
            if normalized then return normalized end
        end
    end
    if crypt and crypt.hmac then
        local ok, r = pcall(crypt.hmac, key, message, "sha256")
        if ok and r then
            local normalized = normalizeDigestHex(r)
            if normalized then return normalized end
        end
        ok, r = pcall(crypt.hmac, message, key, "sha256")
        if ok and r then
            local normalized = normalizeDigestHex(r)
            if normalized then return normalized end
        end
    end
    if syn and syn.crypt and syn.crypt.custom and syn.crypt.custom.hash then
        local ok, r = pcall(syn.crypt.custom.hash, "sha256", message, key)
        if ok and r then
            local normalized = normalizeDigestHex(r)
            if normalized then return normalized end
        end
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

local function getRequestFunction()
    return firstFunction({
        request,
        http_request,
        httprequest,
        (syn and syn.request),
        (http and http.request),
        (fluxus and fluxus.request),
    })
end

local function trySendRequest(requestFn, url, body)
    local variants = {
        {
            Url = url,
            Method = "POST",
            Headers = { ["Content-Type"] = "application/json" },
            Body = body,
        },
        {
            url = url,
            method = "POST",
            headers = { ["Content-Type"] = "application/json" },
            body = body,
        },
    }

    for _, options in ipairs(variants) do
        local ok, response = pcall(requestFn, options)
        if ok and response ~= nil then
            return true, response
        end
    end

    return false, nil
end

local function extractStatusCode(response)
    if type(response) ~= "table" then
        return 0
    end
    local status = response.StatusCode or response.status or response.Status or response.code
    return tonumber(status) or 0
end

local function extractBody(response)
    if type(response) ~= "table" then
        return nil
    end
    return response.Body or response.body
end

local function debugWarn()
end

local function summarizeError(response)
    if type(response) ~= "table" then
        return tostring(response)
    end
    return tostring(response.error or response.message or response.statusCode or "unknown error")
end

local function postJson(panelUrl, path, payload)
    local requestFn = getRequestFunction()
    if not requestFn then
        return false, { error = "request function unavailable" }
    end

    local okEncode, body = pcall(function()
        return HttpService:JSONEncode(payload)
    end)
    if not okEncode then
        return false, { error = "json encode failed" }
    end

    local okRequest, response = trySendRequest(requestFn, panelUrl .. path, body)
    if not okRequest or response == nil then
        return false, { error = "request failed" }
    end

    local statusCode = extractStatusCode(response)
    local rawBody = extractBody(response)

    local decoded
    if type(rawBody) == "string" and rawBody ~= "" then
        local okDecode, parsed = pcall(function()
            return HttpService:JSONDecode(rawBody)
        end)
        if okDecode then
            decoded = parsed
        end
    end

    if statusCode >= 200 and statusCode < 300 then
        if type(decoded) == "table" then
            return true, decoded
        end
        return true, { ok = true, statusCode = statusCode }
    end

    if type(decoded) == "table" then
        decoded.statusCode = decoded.statusCode or statusCode
        return false, decoded
    end

    return false, {
        error = "HTTP " .. tostring(statusCode),
        statusCode = statusCode,
    }
end

local resolveSigningKey

local function trimRuntimeText(value)
    if value == nil then
        return ""
    end
    return tostring(value):gsub("^%s+", ""):gsub("%s+$", "")
end

local function resolveLuarmorDiscordId()
    local direct = trimRuntimeText(rawget(_G, "LRM_LinkedDiscordID"))
    if direct ~= "" then
        return direct
    end

    if type(getgenv) == "function" then
        local okEnv, envTable = pcall(getgenv)
        if okEnv and type(envTable) == "table" then
            local envValue = trimRuntimeText(envTable.LRM_LinkedDiscordID)
            if envValue ~= "" then
                return envValue
            end
        end
    end

    return ""
end

local function buildSignedPayload(scriptSlug, hmacKey, extra)
    local signingKey = resolveSigningKey(hmacKey, extra)
    local timestamp = tostring(math.floor(os.time()))
    local userid = tostring(lp.UserId)
    local signature = computeHmac(signingKey, scriptSlug .. ":" .. userid .. ":" .. timestamp)
    if not signature then
        return nil
    end

    local payload = {
        script = scriptSlug,
        user = lp.Name,
        userid = userid,
        timestamp = timestamp,
        signature = signature,
    }

    if type(extra) == "table" then
        for key, value in pairs(extra) do
            payload[key] = value
        end
    end

    local luarmorDiscordId = resolveLuarmorDiscordId()
    if luarmorDiscordId ~= "" and (payload.discord_id == nil or tostring(payload.discord_id) == "") then
        payload.discord_id = luarmorDiscordId
    end

    return payload
end

local function sendSignedRequest(panelUrl, scriptSlug, hmacKey, path, extra)
    local payload = buildSignedPayload(scriptSlug, hmacKey, extra)
    if not payload then
        return false, { error = "hmac unavailable" }
    end
    return postJson(panelUrl, path, payload)
end

local runtimeConfig = {
    panelUrl = nil,
    scriptSlug = nil,
    hmacKey = nil,
    customKey = nil,
}

local lastAutoHeartbeatAt = 0

local function publishRuntimeConfig()
    if type(getgenv) ~= "function" then
        return
    end

    local okEnv, envTable = pcall(getgenv)
    if not okEnv or type(envTable) ~= "table" then
        return
    end

    envTable.PanelSDK = PanelSDK
    envTable.panelSdk = PanelSDK
    envTable.PANEL_URL = runtimeConfig.panelUrl
    envTable.PanelUrl = runtimeConfig.panelUrl
    envTable.PANEL_SLUG = runtimeConfig.scriptSlug
    envTable.PanelSlug = runtimeConfig.scriptSlug
    envTable.PANEL_KEY = runtimeConfig.hmacKey
    envTable.PanelKey = runtimeConfig.hmacKey
    envTable.PANEL_CUSTOM_KEY = runtimeConfig.customKey
    envTable.PanelCustomKey = runtimeConfig.customKey
end

local function rememberRuntimeConfig(panelUrl, scriptSlug, hmacKey)
    runtimeConfig.panelUrl = tostring(panelUrl or ""):gsub("/$", "")
    runtimeConfig.scriptSlug = tostring(scriptSlug or "")
    runtimeConfig.hmacKey = tostring(hmacKey or "")
    publishRuntimeConfig()
end

local function resolveConfig(panelUrl, scriptSlug, hmacKey, options)
    if type(panelUrl) == "table" and scriptSlug == nil and hmacKey == nil then
        options = panelUrl
        panelUrl = nil
    end

    if panelUrl == nil and scriptSlug == nil and hmacKey == nil then
        panelUrl = runtimeConfig.panelUrl
        scriptSlug = runtimeConfig.scriptSlug
        hmacKey = runtimeConfig.hmacKey
    end

    options = type(options) == "table" and options or {}
    panelUrl = tostring(panelUrl or ""):gsub("/$", "")
    scriptSlug = tostring(scriptSlug or "")
    hmacKey = tostring(hmacKey or "")

    return panelUrl, scriptSlug, hmacKey, options
end

local function resolveScopeOption(options)
    if type(options) ~= "table" then
        return nil
    end

    local scope = options.scope or options.Scope
    if scope == nil and (options.global == true or options.global_scope == true or options.shared_scope == true) then
        scope = "global"
    end
    if scope == nil then
        return nil
    end

    local text = tostring(scope)
    if text == "" then
        return nil
    end
    return text
end

resolveSigningKey = function(defaultKey, options)
    options = type(options) == "table" and options or {}
    local fromOptions = options.customKey or options.custom_key or options.panelKey or options.key
    if type(fromOptions) == "string" and fromOptions ~= "" then
        return fromOptions
    end

    if type(runtimeConfig.customKey) == "string" and runtimeConfig.customKey ~= "" then
        return runtimeConfig.customKey
    end

    if type(getgenv) == "function" then
        local okEnv, envTable = pcall(getgenv)
        if okEnv and type(envTable) == "table" then
            local envKey = envTable.PANEL_CUSTOM_KEY or envTable.PanelCustomKey or envTable.UILIB_CHAT_KEY
            if type(envKey) == "string" and envKey ~= "" then
                return envKey
            end
        end
    end

    return defaultKey
end

local function sendPing(panelUrl, scriptSlug, hmacKey, options)
    local debugMode = type(options) == "table" and options.debug == true
    local okCall, success, response = pcall(function()
        return sendSignedRequest(panelUrl, scriptSlug, hmacKey, "/api/heartbeat", {
            executor = getExecutorName(),
            jobid = game.JobId or "",
        })
    end)

    if not okCall then
        debugWarn(debugMode, "[PanelSDK] heartbeat exception:", tostring(success))
        return false, { error = tostring(success) }
    end

    if success then
        debugWarn(
            debugMode,
            string.format(
                "[PanelSDK] heartbeat ok script=%s user=%s",
                tostring(scriptSlug),
                tostring(lp and lp.Name or "unknown")
            )
        )
    else
        debugWarn(
            debugMode,
            string.format(
                "[PanelSDK] heartbeat failed script=%s reason=%s",
                tostring(scriptSlug),
                summarizeError(response)
            )
        )
    end

    return success, response
end

local function maybeAutoHeartbeat(panelUrl, scriptSlug, hmacKey)
    local now = os.clock()
    if (now - lastAutoHeartbeatAt) < 8 then
        return
    end

    lastAutoHeartbeatAt = now
    sendPing(panelUrl, scriptSlug, hmacKey, { debug = false })
end

function PanelSDK.setCustomKey(customKey)
    runtimeConfig.customKey = tostring(customKey or "")
    if runtimeConfig.customKey == "" then
        runtimeConfig.customKey = nil
    end
    publishRuntimeConfig()
    return runtimeConfig.customKey ~= nil
end

function PanelSDK.clearCustomKey()
    runtimeConfig.customKey = nil
    publishRuntimeConfig()
end

function PanelSDK.cloudSave(panelUrl, scriptSlug, hmacKey, presetName, data)
    if not panelUrl or not scriptSlug or not hmacKey then
        return false, { error = "missing panel config" }
    end
    panelUrl = tostring(panelUrl):gsub("/$", "")
    return sendSignedRequest(panelUrl, scriptSlug, hmacKey, "/api/cloud/save", {
        preset = tostring(presetName or ""),
        data = data,
    })
end

function PanelSDK.cloudLoad(panelUrl, scriptSlug, hmacKey, presetName)
    if not panelUrl or not scriptSlug or not hmacKey then
        return false, { error = "missing panel config" }
    end
    panelUrl = tostring(panelUrl):gsub("/$", "")
    return sendSignedRequest(panelUrl, scriptSlug, hmacKey, "/api/cloud/load", {
        preset = tostring(presetName or ""),
    })
end

function PanelSDK.cloudList(panelUrl, scriptSlug, hmacKey)
    if not panelUrl or not scriptSlug or not hmacKey then
        return false, { error = "missing panel config" }
    end
    panelUrl = tostring(panelUrl):gsub("/$", "")
    return sendSignedRequest(panelUrl, scriptSlug, hmacKey, "/api/cloud/list", {})
end

function PanelSDK.cloudDelete(panelUrl, scriptSlug, hmacKey, presetName)
    if not panelUrl or not scriptSlug or not hmacKey then
        return false, { error = "missing panel config" }
    end
    panelUrl = tostring(panelUrl):gsub("/$", "")
    return sendSignedRequest(panelUrl, scriptSlug, hmacKey, "/api/cloud/delete", {
        preset = tostring(presetName or ""),
    })
end

function PanelSDK.cloudQuota(panelUrl, scriptSlug, hmacKey)
    if not panelUrl or not scriptSlug or not hmacKey then
        return false, { error = "missing panel config" }
    end
    panelUrl = tostring(panelUrl):gsub("/$", "")
    return sendSignedRequest(panelUrl, scriptSlug, hmacKey, "/api/cloud/quota", {})
end

function PanelSDK.sharedUsers(panelUrl, scriptSlug, hmacKey, options)
    panelUrl, scriptSlug, hmacKey, options = resolveConfig(panelUrl, scriptSlug, hmacKey, options)
    if panelUrl == "" or scriptSlug == "" or hmacKey == "" then
        return false, { error = "missing panel config" }
    end

    rememberRuntimeConfig(panelUrl, scriptSlug, hmacKey)
    maybeAutoHeartbeat(panelUrl, scriptSlug, hmacKey)

    return sendSignedRequest(panelUrl, scriptSlug, hmacKey, "/api/heartbeat/peers", {
        jobid = tostring(options.jobid or game.JobId or ""),
        include_self = options.includeSelf == true or options.include_self == true,
        scope = resolveScopeOption(options),
    })
end
PanelSDK.SharedUsers = PanelSDK.sharedUsers
PanelSDK.Peers = PanelSDK.sharedUsers

function PanelSDK.connectionStats(panelUrl, scriptSlug, hmacKey, options)
    panelUrl, scriptSlug, hmacKey, options = resolveConfig(panelUrl, scriptSlug, hmacKey, options)
    if panelUrl == "" or scriptSlug == "" or hmacKey == "" then
        return false, { error = "missing panel config" }
    end

    rememberRuntimeConfig(panelUrl, scriptSlug, hmacKey)
    maybeAutoHeartbeat(panelUrl, scriptSlug, hmacKey)

    return sendSignedRequest(panelUrl, scriptSlug, hmacKey, "/api/heartbeat/connections", {
        jobid = tostring(options.jobid or game.JobId or ""),
        include_self = options.includeSelf ~= false and options.include_self ~= false,
        scope = resolveScopeOption(options),
    })
end
PanelSDK.ConnectionStats = PanelSDK.connectionStats
PanelSDK.Connections = PanelSDK.connectionStats

function PanelSDK.sharedServers(panelUrl, scriptSlug, hmacKey, options)
    panelUrl, scriptSlug, hmacKey, options = resolveConfig(panelUrl, scriptSlug, hmacKey, options)
    if panelUrl == "" or scriptSlug == "" or hmacKey == "" then
        return false, { error = "missing panel config" }
    end

    rememberRuntimeConfig(panelUrl, scriptSlug, hmacKey)
    maybeAutoHeartbeat(panelUrl, scriptSlug, hmacKey)

    return sendSignedRequest(panelUrl, scriptSlug, hmacKey, "/api/heartbeat/servers", {
        include_self = options.includeSelf == true or options.include_self == true,
        scope = resolveScopeOption(options),
    })
end
PanelSDK.SharedServers = PanelSDK.sharedServers
PanelSDK.Servers = PanelSDK.sharedServers

function PanelSDK.chatSend(panelUrl, scriptSlug, hmacKey, messageText, options)
    panelUrl, scriptSlug, hmacKey, options = resolveConfig(panelUrl, scriptSlug, hmacKey, options)
    if panelUrl == "" or scriptSlug == "" or hmacKey == "" then
        return false, { error = "missing panel config" }
    end

    rememberRuntimeConfig(panelUrl, scriptSlug, hmacKey)
    maybeAutoHeartbeat(panelUrl, scriptSlug, hmacKey)

    local text = tostring(messageText or ""):gsub("^%s+", ""):gsub("%s+$", "")
    if text == "" then
        return false, { error = "empty_message" }
    end

    local reply = type(options.reply) == "table" and options.reply or nil
    local replyToId = tonumber(options.reply_to_id or options.replyToId or (reply and (reply.id or reply.message_id or reply.messageId)))
    local replyToUser = tostring(options.reply_to_user or options.replyToUser or (reply and (reply.user or reply.username or reply.name)) or "")
    local replyToUserId = tostring(options.reply_to_userid or options.replyToUserId or (reply and (reply.userid or reply.userid_str or reply.userId)) or "")
    local replyToMessage = tostring(options.reply_to_message or options.replyToMessage or (reply and (reply.message or reply.text or reply.content)) or "")

    if replyToUser ~= "" then
        replyToUser = replyToUser:sub(1, 64)
    end
    if replyToUserId ~= "" then
        replyToUserId = replyToUserId:sub(1, 32)
    end
    if replyToMessage ~= "" then
        replyToMessage = replyToMessage:gsub("\r", ""):gsub("^%s+", ""):gsub("%s+$", ""):sub(1, 240)
    end

    return sendSignedRequest(panelUrl, scriptSlug, hmacKey, "/api/chat/send", {
        room = tostring(options.room or "global"),
        message = text,
        scope = resolveScopeOption(options),
        reply_to_id = replyToId,
        reply_to_user = replyToUser,
        reply_to_userid = replyToUserId,
        reply_to_message = replyToMessage,
    })
end
PanelSDK.ChatSend = PanelSDK.chatSend

function PanelSDK.chatFeed(panelUrl, scriptSlug, hmacKey, options)
    panelUrl, scriptSlug, hmacKey, options = resolveConfig(panelUrl, scriptSlug, hmacKey, options)
    if panelUrl == "" or scriptSlug == "" or hmacKey == "" then
        return false, { error = "missing panel config" }
    end

    rememberRuntimeConfig(panelUrl, scriptSlug, hmacKey)
    maybeAutoHeartbeat(panelUrl, scriptSlug, hmacKey)

    return sendSignedRequest(panelUrl, scriptSlug, hmacKey, "/api/chat/feed", {
        room = tostring(options.room or "global"),
        after_id = tonumber(options.after_id or options.afterId or 0) or 0,
        limit = tonumber(options.limit or 60) or 60,
        scope = resolveScopeOption(options),
    })
end
PanelSDK.ChatFeed = PanelSDK.chatFeed

function PanelSDK.chatTyping(panelUrl, scriptSlug, hmacKey, options)
    panelUrl, scriptSlug, hmacKey, options = resolveConfig(panelUrl, scriptSlug, hmacKey, options)
    if panelUrl == "" or scriptSlug == "" or hmacKey == "" then
        return false, { error = "missing panel config" }
    end

    rememberRuntimeConfig(panelUrl, scriptSlug, hmacKey)
    maybeAutoHeartbeat(panelUrl, scriptSlug, hmacKey)

    local isTyping = options.is_typing == true or options.isTyping == true or options.typing == true
    return sendSignedRequest(panelUrl, scriptSlug, hmacKey, "/api/chat/typing", {
        room = tostring(options.room or "global"),
        is_typing = isTyping,
        scope = resolveScopeOption(options),
        include_self = options.include_self == true or options.includeSelf == true,
    })
end
PanelSDK.ChatTyping = PanelSDK.chatTyping

function PanelSDK.chatTypingStatus(panelUrl, scriptSlug, hmacKey, options)
    panelUrl, scriptSlug, hmacKey, options = resolveConfig(panelUrl, scriptSlug, hmacKey, options)
    if panelUrl == "" or scriptSlug == "" or hmacKey == "" then
        return false, { error = "missing panel config" }
    end

    rememberRuntimeConfig(panelUrl, scriptSlug, hmacKey)
    maybeAutoHeartbeat(panelUrl, scriptSlug, hmacKey)

    return sendSignedRequest(panelUrl, scriptSlug, hmacKey, "/api/chat/typing_status", {
        room = tostring(options.room or "global"),
        scope = resolveScopeOption(options),
        include_self = options.include_self == true or options.includeSelf == true,
    })
end
PanelSDK.ChatTypingStatus = PanelSDK.chatTypingStatus

PanelSDK.cloud = {
    save = function(...)
        return PanelSDK.cloudSave(...)
    end,
    load = function(...)
        return PanelSDK.cloudLoad(...)
    end,
    list = function(...)
        return PanelSDK.cloudList(...)
    end,
    delete = function(...)
        return PanelSDK.cloudDelete(...)
    end,
    quota = function(...)
        return PanelSDK.cloudQuota(...)
    end,
}

PanelSDK.chat = {
    send = function(...)
        return PanelSDK.chatSend(...)
    end,
    feed = function(...)
        return PanelSDK.chatFeed(...)
    end,
    typing = function(...)
        return PanelSDK.chatTyping(...)
    end,
    typingStatus = function(...)
        return PanelSDK.chatTypingStatus(...)
    end,
}

function PanelSDK.monitor(panelUrl, scriptSlug, hmacKey, options)
    if not panelUrl or not scriptSlug or not hmacKey then
        return false, "missing panel config"
    end

    rememberRuntimeConfig(panelUrl, scriptSlug, hmacKey)
    panelUrl = tostring(panelUrl):gsub("/$", "")
    options = type(options) == "table" and options or {}

    local initialDelay = tonumber(options.initialDelay or options.delay or 2) or 2
    local interval = tonumber(options.interval or options.intervalSeconds or 10) or 10
    interval = math.max(3, interval)
    local debugMode = options.debug == true

    task.spawn(function()
        debugWarn(
            debugMode,
            string.format(
                "[PanelSDK] monitor started script=%s interval=%ss",
                tostring(scriptSlug),
                tostring(interval)
            )
        )
        task.wait(math.max(0, initialDelay))
        while true do
            sendPing(panelUrl, scriptSlug, hmacKey, options)
            task.wait(interval)
        end
    end)

    return true
end

function PanelSDK.init(panelUrl, scriptSlug, hmacKey, options)
    return PanelSDK.monitor(panelUrl, scriptSlug, hmacKey, options)
end

return PanelSDK
