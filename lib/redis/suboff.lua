local room_id = KEYS[1]
local connection_id = KEYS[2]

local index
local collection

local debug = {}

local room_json = redis.call('GET', 'cluster:hc:rooms:' .. room_id)
if room_json then
    local room = cjson.decode(room_json)
    index = room.index
    collection = room.collection

    table.insert(debug, 'room found')
    table.insert(debug, 'index: ' .. index)
    table.insert(debug, 'collection ' .. collection)

    if #room.customers == 1 and room.customers[1] == connection_id then
        table.insert(debug, 'deleting room')

        -- last customer removed ont the room => destroy
        redis.call('DEL', 'cluster:hc:rooms:' .. room_id)

        redis.call('SREM', 'cluster:hc:room_ids', room_id)
        local removed = redis.call('SREM', table.concat({'cluster:hc:room_id_tree', index, collection}, ':'), room_id)
        if removed > 0 then
            local count = redis.call('DECR', table.concat({'cluster:hc:room_id_tree_count', index, collection}, ':'))
            if count <= 0 then
                redis.call('DEL', table.concat({'cluster:hc:room_id_tree', index, collection}, ':'))
                redis.call('DEL', table.concat({'cluster:hc:room_id_tree_count', index, collection}, ':'))
            end
        end
    else
        local found = false
        for i,cid in ipairs(room.customers) do
            if cid == connection_id then
                table.remove(room.customers, i)
                found = true
                break
            end
        end

        if found then
            local room_json = cjson.encode(room)
            table.insert(debug, 'room ' .. room_json)
            redis.call('SET', 'cluster:hc:rooms:' .. room_id, room_json)
            table.insert(debug, 'removing user')
        else
            table.insert(debug, 'customer not found in room')
        end
    end
end

local customer_json = redis.call('GET', 'cluster:hc:customers:' .. connection_id)
if customer_json then
    table.insert(debug, 'customer found')
    local customer = cjson.decode(customer_json)
    local count = 0
    local found = false

    for r in pairs(customer) do
        if (r == room_id) then
            customer[r] = nil
            found = true
        else
            count = count + 1
        end
    end

    if found then
        if count == 0 then
            redis.call('SREM', 'cluster:hc:customer_ids', connection_id)
            -- case where index and collection are not defined should never occur.
            -- Letting without protection to actually get Exceptions if any.
            redis.call('SREM', table.concat({'cluster:hc:customer_id_tree', index, collection}, ':'), connection_id)
            redis.call('DEL', 'cluster:hc:customers:' .. connection_id)
        else
            redis.call('SET', 'cluster:hc:customers:' .. connection_id, cjson.encode(customer))
            local removed = redis.call('SREM', table.concat({'cluster:hc:customer_id_tree', index, collection}, ':'), connection_id)
            if removed > 0 then
                count = redis.call('DECR', table.concat({'cluster:hc:customer_id_tree_count', index, collection}, ':'))
                if count <= 0 then
                    redis.call('DEL', table.concat({'cluster:hc:customer_id_tree', index, collection}, ':'))
                    redis.call('DEL', table.concat({'cluster:hc:customer_id_tree_count', index, collection}, ':'))
                end
            end
        end
    end

end

return {index, collection, cjson.encode(debug)}
