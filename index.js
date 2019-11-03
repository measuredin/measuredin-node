'use strict';

const {
  DEFAULT_PII_MATCHERS : defaultMatcher,
  DEFAULT_EXCLUSION_MATCHERS: defaultExclusions,
  identifyPIIs, identifyUnknowns } = require('./lib/pii');
const { findOrInsertRequest, addUnknownToSet } = require('./lib/utils');
const { httpsRequest } = require('./lib/request');

const API_HOST = 'api.measuredin.com'
const API_VERSION = 'v1'

const queue = [];

let initialized = false;
let unknownSet = {};

let localMatchers = defaultMatcher;
let localExclusions = defaultExclusions;
let localResolved = {};
let localPending = {};
let encryptionKey = '';

function flush(q) {
  Promise.all(q.splice(0, q.length));
}

function initialize() {
  if (initialized) return;
  httpsRequest({
    method: 'GET',
    path: `/${API_VERSION}/config`,
    hostname: API_HOST,
  }, (res) => {
    syncConfig(res.body);
    initialized = true;
  }, () => {}, () => {});
}

function syncConfig(config) {
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
    } catch (err) {
      reject(err);
    }
  });
  queue.push(job);
}

require('./lib/interceptor')(API_HOST, processRequest, initialize);