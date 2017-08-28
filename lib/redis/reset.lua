for _,k in ipairs(redis.call('KEYS', 'cluster*')) do
    if k ~= 'cluster:discovery' then
        redis.call('DEL', k)
    end
end

return 'ok'
