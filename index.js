const SIMILARITY_COEFFICIENT = 0.8;
const API_HOST = 'measuredin.com'

const PII_MATCHERS = {
  firstName: [],
  lastName: [],
  name: [],
  birthday: [],
  ssn: [],
  address: [],
  postalCode: [],
  phone: [],
  email: [],
  driverLicense: [],
  passport: [],
  creditCard: [],
};
const RESOLVED_PII_RECORDS = {};
const PENDING_PII_RECORDS = {};

function scanPII(data) {

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
};

function findOrInsert(host, path) {
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

function flush(agent, options, data) {
  const { hostname, path } = options
  findOrInsert(hostname, path);
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
        flush(clientAgent, reqOptions, data);
      })
    }
    return clientRequest;
  };
});