--
-- Kuzzle, a backend software, self-hostable and ready to use
-- to power modern apps
--
-- Copyright 2015-2018 Kuzzle
-- mailto: support AT kuzzle.io
-- website: http://kuzzle.io
--
-- Licensed under the Apache License, Version 2.0 (the "License");
-- you may not use this file except in compliance with the License.
-- You may obtain a copy of the License at
--
-- https://www.apache.org/licenses/LICENSE-2.0
--
-- Unless required by applicable law or agreed to in writing, software
-- distributed under the License is distributed on an "AS IS" BASIS,
-- WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
-- See the License for the specific language governing permissions and
-- limitations under the License.
--


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
