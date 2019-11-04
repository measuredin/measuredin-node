'use strict';

const {
  DEFAULT_PII_MATCHERS,
  DEFAULT_EXCLUSION_MATCHERS
} = require('./lib/pii');
const { encryptWithKey, parseConfigRegex, createRequestHandler } = require('./lib/utils');
const { httpsRequest } = require('./lib/request');

MeasuredIn.DEFAULT_EXCLUSION_MATCHERS = DEFAULT_EXCLUSION_MATCHERS;
MeasuredIn.DEFAULT_PII_MATCHERS = DEFAULT_PII_MATCHERS;

// flush on every 5 mins or 100 requests, whichever condition met first
MeasuredIn.DEFAULT_FLUSH_INTERVAL_SEC = 10;
MeasuredIn.DEFAULT_FLUSH_REQUEST_THRESHOLD = 3;

MeasuredIn.DEFAULT_API_HOST = 'api.measuredin.com';
MeasuredIn.DEFAULT_API_VERSION = 'v1';

function MeasuredIn(key) {

  if (!(this instanceof MeasuredIn)) {
    const instance = new MeasuredIn(key);
    const requestHandler = createRequestHandler(
      instance.localResolved,
      instance.localPending,
      instance.localMatchers,
      instance.localExclusions,
      instance.unknownSet,
      instance.enqueueJob.bind(instance),
    );
    require('./lib/interceptor')(instance.apiHost, requestHandler, instance.initialize.bind(instance));
    return instance;
  }

  this.queue = [];

  this.initialized = false;
  this.flushTimeoutId;

  this.unknownSet = {};
  this.localMatchers = MeasuredIn.DEFAULT_PII_MATCHERS;
  this.localExclusions = MeasuredIn.DEFAULT_EXCLUSION_MATCHERS;
  this.localResolved = {};
  this.localPending = {};
  this.encryptionKey = '';

  this.apiHost = MeasuredIn.DEFAULT_API_HOST;
  this.apiVersion = MeasuredIn.DEFAULT_API_VERSION;
  this.apiKey = key;

  this.flushRequestThreshold = MeasuredIn.DEFAULT_FLUSH_REQUEST_THRESHOLD;
  this.flushIntervalSec = MeasuredIn.DEFAULT_FLUSH_INTERVAL_SEC;
}

MeasuredIn.prototype = {
  initialize() {
    if (this.initialized) return;
    this.syncConfig(false);
  },
  enqueueJob(job) {
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
    const req = {
      method: 'POST',
      path: `/${this.apiVersion}/config`,
      hostname: this.apiHost,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: {
        resolved: this.localResolved,
        pending: this.localPending,
        unknowns: encryptWithKey(this.unknownSet, this.encryptionKey),
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
      if (!this.flushTimeoutId) {
        this.flushTimeoutId = setTimeout(this.flushTimer.bind(this), this.flushIntervalSec * 1000);
      }
    }, () => { }, () => { });
  },
  loadConfig(config) {
    const { resolved, matchers, exclusions } = parseConfigRegex(config);
    // sync from remote
    this.localMatchers = matchers;
    this.localExclusions = exclusions;
    this.localResolved = resolved;
    this.localPending = {};
    this.encryptionKey = config.key;
  },
};

module.exports = MeasuredIn;
module.exports.MeasuredIn = MeasuredIn;