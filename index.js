'use strict';

const {
  DEFAULT_PII_MATCHERS,
  DEFAULT_EXCLUSION_MATCHERS
} = require('./lib/pii');
const { encryptWithKey, parseConfigRegex, createRequestHandler } = require('./lib/utils');
const { httpsRequest } = require('./lib/request');
const { serverInterceptor, clientInterceptor } = require('./lib/interceptor');

MeasuredIn.DEFAULT_EXCLUSION_MATCHERS = DEFAULT_EXCLUSION_MATCHERS;
MeasuredIn.DEFAULT_PII_MATCHERS = DEFAULT_PII_MATCHERS;

// flush on every 5 mins or 100 requests, whichever condition met first
MeasuredIn.DEFAULT_FLUSH_INTERVAL_SEC = 300;
MeasuredIn.DEFAULT_FLUSH_REQUEST_THRESHOLD = 100;

MeasuredIn.DEFAULT_API_HOST = 'api.measuredin.com';
MeasuredIn.DEFAULT_API_VERSION = 'v1';

function MeasuredIn(key) {

  if (!(this instanceof MeasuredIn)) {
    const instance = new MeasuredIn(key);

    const requestCallback = instance.addToQueue.bind(instance);
    const initCallback = instance.initialize.bind(instance);
    const clientHandler = createRequestHandler(instance, 'client', requestCallback);
    const serverHandler = createRequestHandler(instance, 'server', requestCallback);

    clientInterceptor(instance.apiHost, clientHandler, initCallback);
    serverInterceptor(serverHandler, initCallback);

    return instance;
  }

  this.queue = [];

  this.initialized = false;
  this.flushTimeoutId;

  this.client = this.defaultConfig();
  this.server = this.defaultConfig();

  this.encryptionKey = '';

  this.apiHost = MeasuredIn.DEFAULT_API_HOST;
  this.apiVersion = MeasuredIn.DEFAULT_API_VERSION;
  this.apiKey = key;

  this.flushRequestThreshold = MeasuredIn.DEFAULT_FLUSH_REQUEST_THRESHOLD;
  this.flushIntervalSec = MeasuredIn.DEFAULT_FLUSH_INTERVAL_SEC;
}

MeasuredIn.prototype = {
  defaultConfig() {
    return {
      unknowns: {},
      matchers: MeasuredIn.DEFAULT_PII_MATCHERS,
      exclusions: MeasuredIn.DEFAULT_EXCLUSION_MATCHERS,
      resolved: {},
      pending: {},
    };
  },
  initialize() {
    if (this.initialized) return;
    this.syncConfig(false);
  },
  addToQueue(job) {
    if (this.queue.length >= this.flushRequestThreshold) this.flushTimer();
    this.queue.push(job);
  },
  async flushTimer() {
    clearTimeout(this.flushTimeoutId);
    this.flushTimeoutId = undefined;
    await Promise.all(this.queue.splice(0, this.queue.length));
    await this.syncConfig();
  },
  async syncConfig(refresh = true) {
    // update
    const encryptionKey = this.encryptionKey;
    const requestBodyFor = function(entity) {
      return {
        resolved: entity.resolved,
        pending: entity.pending,
        unknowns: encryptWithKey(entity.unknowns, encryptionKey),
      };
    };
    const req = {
      method: 'POST',
      path: `/${this.apiVersion}/config`,
      hostname: this.apiHost,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: {
        client: requestBodyFor(this.client),
        server: requestBodyFor(this.server),
      }
    };
    // fetch only
    if (!refresh) {
      this.initialized = true;
      delete req.body;
      req.method = 'GET';
    }
    httpsRequest(req, (res) => {
      this.loadConfig(res.body);
      this.encryptionKey = res.body.key;
      if (!this.flushTimeoutId) {
        this.flushTimeoutId = setTimeout(this.flushTimer.bind(this), this.flushIntervalSec * 1000);
      }
    }, () => { }, () => { });
  },
  loadConfig(res) {
    const { client, server } = res;
    // redirect references
    // client
    parseConfigRegex(client);
    this.client.resolved = client.resolved;
    this.client.matchers = client.matchers;
    this.client.exclusions = client.exclusions;
    this.client.pending = {};
    // server
    parseConfigRegex(server);
    this.server.resolved = server.resolved;
    this.server.matchers = server.matchers;
    this.server.exclusions = server.exclusions;
    this.server.pending = {};
  },
};

module.exports = MeasuredIn;
module.exports.MeasuredIn = MeasuredIn;