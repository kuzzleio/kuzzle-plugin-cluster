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
  sinon = require('sinon');

class RedisMock {
  constructor (config) {
    this.config = config;

    this.clusterReset = sinon.stub().returns(Bluebird.resolve());
    this.clusterState = sinon.stub().returns(Bluebird.resolve());
    this.clusterSubOn = sinon.stub().returns(Bluebird.resolve());
    this.clusterSubOff = sinon.stub().returns(Bluebird.resolve());
    this.defineCommand = sinon.spy();
    this.hset = sinon.stub().returns(Bluebird.resolve());
    this.sadd = sinon.stub().returns(Bluebird.resolve());
  }
}

module.exports = RedisMock;
