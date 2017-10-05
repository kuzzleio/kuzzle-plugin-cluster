local hash_tag = KEYS[1]

local node_id = ARGV[1]

local deleted_rooms = {}
local debug = {}

for _,connection_id in ipairs(redis.call('SMEMBERS', 'cluster:node_clients:' .. hash_tag .. node_id)) do
    for _,room_id in ipairs(redis.call('SMEMBERS', 'cluster:client_rooms:' .. hash_tag .. connection_id)) do
        -- duplicate code from suboff.lua
        -- while technically possible, reusing scripts is too hackish for me
        -- cf https://stackoverflow.com/a/22599862/138305

        redis.call('SREM', 'cluster:node_clients:' .. hash_tag .. node_id, connection_id)
        if redis.call('SCARD', 'cluster:node_clients:' .. hash_tag .. node_id) <= 0 then
            redis.call('DEL', 'cluster:node_clients:' .. hash_tag .. node_id)
        end

        redis.call('SREM', 'cluster:client_rooms:' .. hash_tag .. connection_id, room_id)
        if redis.call('SCARD', 'cluster:client_rooms:' .. hash_tag .. connection_id) == 0 then
            redis.call('DEL', 'cluster:client_rooms:' .. hash_tag .. connection_id)
        end

        redis.call('SREM', 'cluster:room_clients:' .. hash_tag .. room_id, connection_id)
        local count = redis.call('SCARD', 'cluster:room_clients:' .. hash_tag .. room_id)
        if count <= 0 then
            table.insert(debug, 'delete room ' .. hash_tag .. room_id)
            table.insert(deleted_rooms, room_id)
            redis.call('DEL', 'cluster:room_clients:' .. hash_tag .. room_id)
            redis.call('DEL', 'cluster:room_counts:' .. hash_tag .. room_id)
            redis.call('DEL', 'cluster:filters:' .. hash_tag .. room_id)
            redis.call('SREM', 'cluster:filters_tree' .. hash_tag, room_id)
        else
            redis.call('SET', 'cluster:room_counts:' .. hash_tag .. room_id, count)
        end
    end
end

local version = redis.call('INCR', 'cluster:version' .. hash_tag)
-- handle signed 64 bits overflows
if version >= 9223372036854775807 then
    version = 1
    redis.call('SET', 'cluster:version' .. hash_tag, version)
end

return {version, deleted_rooms, debug}

