-- helper - transforms a redis flat array into a hashmap
local hash_tag = KEYS[1]

local result = {}

table.insert(result, redis.call('GET', 'cluster:version' .. hash_tag))
table.insert(result, {})

do
    local ids_source

    if hash_tag == '{undefined/undefined}' then
        ids_source = 'cluster:room_ids'
    else
        ids_source = 'cluster:filters_tree' .. hash_tag
    end

    -- cannot use SORT .. GET in cluster mode (T_T)..
    for _,room_id in ipairs(redis.call('SMEMBERS', ids_source)) do
        table.insert(result[2], {
            room_id,
            redis.call('GET', 'cluster:filters:' .. hash_tag .. room_id),
            redis.call('GET', 'cluster:room_counts:' .. hash_tag .. room_id)
        })
    end
end

return result
