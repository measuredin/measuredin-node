'use strict';

const {
  DEFAULT_PII_MATCHERS : defaultMatcher,
  DEFAULT_EXCLUSION_MATCHERS: defaultExclusions,
  identifyPIIs, identifyUnknowns } = require('./lib/pii');
const { findOrInsertRequest, addUnknownToSet, encryptWithKey } = require('./lib/utils');
const { httpsRequest } = require('./lib/request');

// flush on every 5 mins or 100 requests, whichever condition met first
const FLUSH_INTERVAL = 300;
const FLUSH_THRESHOLD = 100;

const API_HOST = 'api.measuredin.com'
const API_VERSION = 'v1'
let API_KEY = '';

const queue = [];

let initialized = false;
let flushTimeoutId;

let unknownSet = {};
let localMatchers = defaultMatcher;
let localExclusions = defaultExclusions;
let localResolved = {};
let localPending = {};
let encryptionKey = '';

async function flushTimer() {
  clearTimeout(flushTimeoutId);
  flushTimeoutId = undefined;
  await Promise.all(queue.splice(0, queue.length));
  await syncConfig();
}

function initialize() {
  if (initialized) return;
  syncConfig(false);
}

async function syncConfig(refresh = true) {
  // update
  const req = {
    method: 'POST',
    path: `/${API_VERSION}/config`,
    hostname: API_HOST,
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: {
      resolved: localResolved,
      pending: localPending,
      unknowns: encryptWithKey(unknownSet, encryptionKey),
    }
  };
  // fetch only
  if (!refresh) {
    initialized = true;
    delete req.body;
    req.method = 'GET';
  }
  httpsRequest(req, (res) => {
    loadConfig(res.body);
    if (!flushTimeoutId) {
      flushTimeoutId = setTimeout(flushTimer, FLUSH_INTERVAL * 1000);
    }
  }, () => {}, () => {});
}

function loadConfig(config) {
  const { resolved, exclusions, matchers, key } = config;
  // convert string to regex
  [matchers, exclusions].forEach((set) => {
    Object.keys(set).forEach((field) => {
      set[field] = set[field].map((s) => new RegExp(s));
    });
  });
  Object.keys(resolved).forEach((host) => {
    const paths = resolved[host];
    paths.forEach((path) => {
      path.path = new RegExp(path.path);
    })
  });
  // sync from remote
  localMatchers = matchers;
  localExclusions = exclusions;
  localResolved = resolved;
  localPending = {};
  encryptionKey = key;
}

function processRequest(agent, options, data) {
  const { hostname, path } = options;
  const job = new Promise(function (resolve, reject) {
    try {
      const decoded = data.toString('utf8');
      const record = findOrInsertRequest(localResolved, localPending, hostname, path);
      const matches = identifyPIIs(localMatchers, decoded);
      const unknown = identifyUnknowns(localExclusions, matches, decoded);
      // update record
      const pii = Object.keys(matches);
      pii.forEach((matched) => {
        // initialize
        record[matched] = record[matched] || {};
        record[matched].lastSeen = +new Date();
        record[matched].count = (record[matched].count || 0) + 1;
      });
      addUnknownToSet(unknownSet, unknown);
      resolve(pii.length);
      if (queue.length >= FLUSH_THRESHOLD) flushTimer();
    } catch (err) {
      reject(err);
    }
  });
  queue.push(job);
}

require('./lib/interceptor')(API_HOST, processRequest, initialize);