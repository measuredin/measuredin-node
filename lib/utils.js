'use strict';

const crypto = require('crypto');

const { identifyPIIs, identifyUnknowns } = require('./pii');

const SIMILARITY_COEFFICIENT = 0.8;

const paramsMaskingFn = function() {
  let id = 0;
  let uuid = 0;
  return function (str) {
    const parsed = Number.parseInt(str);
    if (Number.isInteger(parsed)) {
      return `:id${id++}`;
    }
    if (RegExp(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i).test(str)) {
      return `:uuid${uuid++}`;
    }
    return str;
  };
};

const findOrInsertRequest = function(resolvedRecords, pendingRecords, host, path) {
  // initialize if empty
  resolvedRecords[host] = resolvedRecords[host] || [];
  pendingRecords[host] = pendingRecords[host] || [];

  const resolvedPaths = resolvedRecords[host];
  const pendingPaths = pendingRecords[host];

  let match = resolvedPaths.find((resolved) => {
    return resolved.path.test(path); // path is not a PII, removed on sync
  });
  // found in resolved
  if (match) {
    return match;
  }

  // root
  if (path === '/') {
    return pendingPaths[path] = pendingPaths[path] || {};
  } else {
    path = path.split('/').map(paramsMaskingFn()).join('/');
  }
  // compute jaccard similarity coefficient
  const similarityScores = Object.keys(pendingPaths).map((pending) => {
    if (pending === '/') return 0;
    // mask number / uuids to types
    const pendings = pending.split('/').map(paramsMaskingFn());
    let current = path.split('/').map(paramsMaskingFn());
    const combined = pendings.concat(current);
    const unique = Array.from(new Set(combined));
    return (combined.length - unique.length) / unique.length;
  });
  // filter for threshold
  const similars = similarityScores.filter((score) => {
    return score >= SIMILARITY_COEFFICIENT;
  });
  // return most similar
  if (similars.length) {
    const maxScore = Math.max(similars);
    const index = similars.findIndex((score) => {
      return score === maxScore;
    });
    return pendingPaths[Object.keys(pendingPaths)[index]];
  }
  // insert into pending for inspection
  return pendingPaths[path] = {};
};

const addUnknownToSet = function(set, unknown) {
  if (!Object.keys(unknown).length) return;
  // cluster by keys
  const keys = Object.keys(unknown).sort();
  set[keys.join(',')] = unknown;
};

const parseConfigRegex = function(config) {
  const { resolved, exclusions, matchers } = config;
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
    });
  });
  return {
    matchers,
    exclusions,
    resolved
  };
};

const createRequestHandler = function(instance, entity, callback) {
  return function processRequest(options, data) {
    const { hostname, path } = options;
    const job = new Promise(function (resolve, reject) {
      try {
        const { resolved, pending, matchers, exclusions, unknowns } = instance[entity];
        const decoded = data.toString('utf8');
        const record = findOrInsertRequest(resolved, pending, hostname, path);
        const matches = identifyPIIs(matchers, decoded);
        const unknown = identifyUnknowns(exclusions, matches, decoded);
        // update record
        const pii = Object.keys(matches);
        pii.forEach((matched) => {
          // initialize
          record[matched] = record[matched] || {};
          record[matched].lastSeen = +new Date();
          record[matched].count = (record[matched].count || 0) + 1;
        });
        addUnknownToSet(unknowns, unknown);
        resolve(pii.length);
      } catch (err) {
        reject(err);
      }
    });
    callback(job);
  };
};

const encryptWithKey = async function(obj, publicKey) {
  if (!publicKey) return;
  if (typeof obj === 'object') {
    return crypto.publicEncrypt(publicKey, Buffer.from(JSON.stringify(obj))).toString('base64');
  }
  return crypto.publicEncrypt(publicKey, obj).toString('base64');
};

module.exports = {
  paramsMaskingFn,
  findOrInsertRequest,
  addUnknownToSet,
  parseConfigRegex,
  encryptWithKey,
  createRequestHandler,
};
