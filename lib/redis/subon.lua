local index = KEYS[1]
local collection = KEYS[2]
local room_id = KEYS[3]
local connection_id = KEYS[4]
local in_room_json = ARGV[1]
local in_customer_json = ARGV[2]
local in_filter_json = ARGV[3]

local debug = {table.concat({index, collection, room_id}, '/')}

if in_filter_json ~= 'none' then
    table.insert(debug, 'inserting filters')
    redis.call('SET', 'cluster:filters:' .. room_id, in_filter_json, 'EX', 15)
end

local room_json = redis.call('GET', 'cluster:hc:rooms:' .. room_id)
if room_json then
    table.insert(debug, 'room found')

    local redis_room = cjson.decode(room_json)
    local in_room = cjson.decode(in_room_json)

    -- make sure new channels are populated
    for channel in pairs(in_room.channels) do
        redis_room.channels[channel] = in_room.channels[channel]
    end

    local found = false
    for _,cid in ipairs(redis_room.customers) do
        if cid == connection_id then
            found = true
            break
        end
    end

    if found == false then
        table.insert(debug, 'adding connection ' .. connection_id)
        table.insert(redis_room.customers, connection_id)
    end

    local room_json = cjson.encode(redis_room)
    table.insert(debug, 'updating room: ' .. room_json)
    redis.call('SET', 'cluster:hc:rooms:' .. room_id, room_json)
else
    table.insert(debug, 'creating room ' .. in_room_json)
    redis.call('SET', 'cluster:hc:rooms:' .. room_id, in_room_json)
end

local customer_json = redis.call('GET', 'cluster:hc:customers:' .. connection_id)
if customer_json then
    table.insert(debug, 'customer found ' .. connection_id)
    local redis_customer = cjson.decode(customer_json)

    if redis_customer[room_id] == nil then
        local in_customer = cjson.decode(in_customer_json)
        redis_customer[room_id] = in_customer[room_id]

        local redis_customer_json = cjson.encode(redis_customer)
        redis.call('SET', 'cluster:hc:customers:' .. connection_id, redis_customer_json)
    end
else
    redis.call('SET', 'cluster:hc:customers:' .. connection_id, in_customer_json)
end

redis.call('SADD', 'cluster:hc:room_ids', room_id)
local added = redis.call('SADD', table.concat({'cluster:hc:room_id_tree', index, collection}, ':'), room_id)
if added > 0 then
    redis.call('INCR', table.concat({'cluster:hc:room_id_tree_count', index, collection}, ':'))
end
redis.call('SADD', 'cluster:hc:customer_ids', connection_id)
added = redis.call('SADD', table.concat({'cluster:hc:customer_id_tree', index, collection}, ':'), connection_id)
if added > 0 then
    redis.call('INCR', table.concat({'cluster:hc:customer_id_tree_count', index, collection}, ':'))
end

return debug
