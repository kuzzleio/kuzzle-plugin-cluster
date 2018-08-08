/*
 * Kuzzle, a backend software, self-hostable and ready to use
 * to power modern apps
 *
 * Copyright 2015-2018 Kuzzle
 * mailto: support AT kuzzle.io
 * website: http://kuzzle.io
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const
  Bluebird = require('bluebird'),
  getBuiltinCommands = (require('ioredis')({lazyConnect: true})).getBuiltinCommands,
  redisCommands = getBuiltinCommands(),
  sinon = require('sinon');

const sandbox = sinon.createSandbox().usingPromise(Bluebird);

class RedisMock {
  constructor (config) {
    this.config = config;

    for (const command of redisCommands) {
      this[command] = sandbox.stub().resolves();
    }

    this.clusterReset = sandbox.stub().resolves();
    this.clusterState = sandbox.stub().resolves([null, [
      ['foo', '{}', 3],
      ['bar', '{"exists": {"foo": "bar"}}', 2]
    ]]);
    this.clusterSubOn = sandbox.stub().resolves([1, 1, {}]);
    this.clusterSubOff = sandbox.stub().resolves();
    this.defineCommand = sandbox.stub();
  }

  Cluster (config) {
    this.config = config;
  }
}

module.exports = RedisMock;
