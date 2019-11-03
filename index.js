'use strict';

const {
  DEFAULT_PII_MATCHERS : defaultMatcher,
  DEFAULT_EXCLUSION_MATCHERS: defaultExclusions,
  identifyPIIs, identifyUnknowns } = require('./lib/pii');
const { findOrInsertRequest, addUnknownToSet } = require('./lib/utils');
const { httpsRequest } = require('./lib/request');

const API_HOST = 'measuredin.com'

const initialized = false;
const queue = [];
const unknownSet = {};

const resolvedPIIRecords = {};
const pendingPIIRecords = {};

let matcher = defaultMatcher;

function flush(q) {
  Promise.all(q.splice(0, q.length));
}

function initialize() {
  if (initialized) return;
  // fetch from api resolved, exclusions, and matcher
}

function processRequest(agent, options, data) {
  const { hostname, path } = options;
  const job = new Promise(function (resolve, reject) {
    try {
      const decoded = data.toString('utf8');
      const record = findOrInsertRequest(resolvedPIIRecords, pendingPIIRecords, hostname, path);
      const matches = identifyPIIs(matcher, decoded);
      const unknown = identifyUnknowns(defaultExclusions, matches, decoded);
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