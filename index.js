const { DEFAULT_PII_MATCHERS : defaultMatcher, identifyPIIs } = require('./lib/pii');
const { findOrInsertRequest } = require('./lib/utils');

const API_HOST = 'measuredin.com'

const queue = [];

const resolvedPIIRecords = {};
const pendingPIIRecords = {};
let matcher = defaultMatcher;

function flush(q) {
  Promise.all(q.splice(0, q.length));
}

function processRequest(agent, options, data) {
  const { hostname, path } = options;
  const job = new Promise(function (resolve, reject) {
    try {
      const decoded = data.toString('utf8');
      const record = findOrInsertRequest(resolvedPIIRecords, pendingPIIRecords, hostname, path);
      const pii = Object.keys(identifyPIIs(matcher, decoded));
      pii.forEach((matched) => {
        // initialize
        record[matched] = record[matched] || {};
        record[matched].lastSeen = +new Date();
        record[matched].count = (record[matched].count || 0) + 1;
      });
      resolve(pii.length);
    } catch (err) {
      reject(err);
    }
  });
  queue.push(job);
}

require('./lib/interceptor')(API_HOST, processRequest);