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
  }
}

const findOrInsertRequest = function(resolvedRecords, pendingRecords, host, path) {
  // initialize if empty
  resolvedRecords[host] = resolvedRecords[host] || [];
  pendingRecords[host] = pendingRecords[host] || [];

  const resolvedPaths = resolvedRecords[host];
  const pendingPaths = pendingRecords[host];

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
}

const addUnknownToSet = function(set, unknown) {
  // cluster by keys
  const keys = Object.keys(unknown).sort();
  set[keys.join(',')] = unknown;
}

module.exports = {
  paramsMaskingFn,
  findOrInsertRequest,
  addUnknownToSet,
}