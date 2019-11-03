'use strict';

const https = require('https');

const httpsRequest = function(options, success, fail, error) {
  let reqBody = options.body;
  if (typeof reqBody === 'object') {
    reqBody = JSON.stringify(reqBody);
  }
  const reqOptions = (({ hostname,
    method,
    path,
    headers }) => ({ hostname, method, path, headers }))(options);
  const req = https.request(reqOptions, (res) => {
    let resBody = '';
    res.on('data', function (chunk) {
      resBody = resBody + chunk;
    });
    res.on('end', function () {
      const fn = res.statusCode >= 200 && res.statusCode < 300 ? success : fail;
      const isJSON = (res.headers['content-type'] || '').includes('application/json');
      fn({
        status: res.statusCode,
        body: isJSON ? JSON.parse(resBody) : resBody,
      });
    });
  });
  req.on('error', (e) => {
    error(e);
  });
  if (reqBody) {
    req.write(reqBody);
  }
  req.end();
};

module.exports = { httpsRequest };