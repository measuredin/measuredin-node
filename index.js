const SIMILARITY_COEFFICIENT = 0.8;
const API_HOST = 'measuredin.com'

const queue = [];

const DEFAULT_PII_MATCHERS = {
  first_name: [],
  last_name: [],
  name: [],
  birthday: [/((?:0[1-9])|(?:1[0-2]))\/((?:0[0-9])|(?:[1-2][0-9])|(?:3[0-1]))\/(\d{4})/],
  ssn: [/\d{3}-\d{2}-\d{4}/], // US
  address: [/\d{1,5}\s\w.\s(\b\w*\b\s){1,2}\w*\./],
  zip_code: [/\d{5}([ \-]\d{4})?/],
  postal_code: [
    /[ABCEGHJKLMNPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][ ]?\d[ABCEGHJ-NPRSTV-Z]\d/
  ],
  phone: [/(\([0-9]{3}\)|[0-9]{3}-)[0-9]{3}-[0-9]{4}/],
  email: [/\S+@\S+/],
  driver_license: [],
  passport: [],
  credit_card: [],
};
const RESOLVED_PII_RECORDS = {};
const PENDING_PII_RECORDS = {};

function identifyPII(data) {
  const matches = {};

  const decoded = data.toString('utf8');
  let json;
  try {
    json = JSON.parse(decoded);
  } catch (err) {
    // not a JSON
  }

  if (json) {
    Object.keys(json).forEach((k) => {
      Object.keys(DEFAULT_PII_MATCHERS).forEach((field) => {
        const matchByField = new RegExp(field).test(k);
        const matchByValue = DEFAULT_PII_MATCHERS[field].find((valueRegex) => {
          return new RegExp(valueRegex).test(json[k]);
        });
        if (matchByField || matchByValue) {
          matches[field] = true;
        }
      });
    });
  }

  return matches;
}

function maskTypes() {
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
  }
}

function findOrInsertPath(host, path) {
  // initialize if empty
  RESOLVED_PII_RECORDS[host] = RESOLVED_PII_RECORDS[host] || [];
  PENDING_PII_RECORDS[host] = PENDING_PII_RECORDS[host] || [];

  const resolvedPaths = RESOLVED_PII_RECORDS[host];
  const pendingPaths = PENDING_PII_RECORDS[host];

  let match = resolvedPaths.find((resolved) => {
    return resolved.path.test(path);
  })
  // found in resolved
  if (match) {
    return match;
  }
  // root
  if (path === '/') {
    return pendingPaths[path] = pendingPaths[path] || {};
  } else {
    path = path.split('/').map(maskTypes()).join('/');
  }
  // compute jaccard similarity coefficient
  const similarityScores = Object.keys(pendingPaths).map((pending) => {
    if (pending === '/') return 0;
    // mask number / uuids to types
    const pendings = pending.split('/').map(maskTypes());
    let current = path.split('/').map(maskTypes());
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
}

function enqueue(agent, options, data) {
  const { hostname, path } = options
  const record = findOrInsertPath(hostname, path);
  const pii = identifyPII(data);
  Object.keys(pii).forEach((matched) => {
    // initialize
    record[matched] = record[matched] || {};
    record[matched].lastSeen = +new Date();
    record[matched].count = (record[matched].count || 0) + 1;
  });
}

// http(s)
const http = require('http');
const https = require('https');
[http, https].forEach(function(lib) {
  const __request = lib.request;
  lib.request = function () {
    const args = arguments;
    const clientRequest = __request.apply(this, arguments);
    const __outgoingWrite = clientRequest.write;
    // starting v10.9.0, url can be passed in
    // https://nodejs.org/api/http.html#http_http_request_url_options_callback
    const clientAgent = clientRequest.agent;
    const reqOptions = typeof args[0] === 'string' ? args[1] : args[0];
    // monkey patch on non-API requests
    if (!reqOptions.hostname.includes(API_HOST)) {
      const chunks = [];
      // https://github.com/nodejs/node/blob/master/lib/_http_outgoing.js
      clientRequest.write = function (data) {
        chunks.push(data);
        return __outgoingWrite.apply(this, arguments);
      }
      clientRequest.on('finish', function () {
        const data = Buffer.concat(chunks);
        enqueue(clientAgent, reqOptions, data);
      })
    }
    return clientRequest;
  };
});