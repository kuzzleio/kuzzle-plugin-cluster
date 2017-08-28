-- helper - transforms a redis flat array into a hashmap
local hgetall = function (key)
    local bulk = redis.call('HGETALL', key)
    local result = {}
    local nextkey

    if bulk then
        for i,v in ipairs(bulk) do
            if i % 2 == 1 then
                nextkey = v
            else
                result[nextkey] = v
            end
        end
    end

    return result
end


local index = ARGV[1]
local collection = ARGV[2]

local state = {autorefresh = {}, filters = {}, hc = {}, debug = {}}
state.hc.customers = {}
state.hc.rooms = {}

local customer_ids
local room_ids
local filters = {}

if index == nil then
    customer_ids = redis.call('SMEMBERS', 'cluster:hc:customer_ids')
    room_ids = redis.call('SMEMBERS', 'cluster:hc:room_ids')
else
    customer_ids = redis.call('SMEMBERS', table.concat({'cluster:hc:customer_id_tree', index, collection}, ':'))
    room_ids = redis.call('SMEMBERS', table.concat({'cluster:hc:room_id_tree', index, collection}, ':'))
end

for _,customer_id in ipairs(customer_ids) do
    local customer_json = redis.call('GET', 'cluster:hc:customers:' .. customer_id)
    if customer_json then
        state.hc.customers[customer_id] = cjson.decode(redis.call('GET', 'cluster:hc:customers:' .. customer_id))
    else
        table.insert(state.debug, 'WARNING customer missing ' .. customer_id)
    end
end

for _,room_id in ipairs(room_ids) do
    local room_json = redis.call('GET', 'cluster:hc:rooms:' .. room_id)
    local filter_json = redis.call('GET', 'cluster:filters:' .. room_id)

    if room_json then
        state.hc.rooms[room_id] = cjson.decode(room_json)
    else
        table.insert(state.debug, 'WARNING room missing: ' .. room_id)
    end

    if filter_json then
        --[[
            * filters auto-expire so don't warn if missing
            * cjson float precision is lower than js JSON.
              We do a dirty trick to keep JS serialization.
        --]]
        state.filters[room_id] = '##{filter:' .. room_id .. '}##'
        filters[room_id] = filter_json
    end
end

local autorefresh = hgetall('cluster:autorefresh')
if autorefresh then
    state.autorefresh = autorefresh
end


local state_json = cjson.encode(state)
for id in pairs(filters) do
    state_json = state_json:gsub('"##{filter:' .. id .. '}##"', filters[id])
end

return state_json

