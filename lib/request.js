'use strict';

const https = require('https');

const httpsRequest = function(options, success, fail, error) {
  const reqBody = options.body;
  if (reqBody) {
    if (typeof reqBody === 'object') {
      options.headers = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(JSON.stringify(reqBody)),
      }
    } else {
      options.headers = {
        'Content-Type': 'text/plain',
        'Content-Length': Buffer.byteLength(reqBody),
      }
    }
  }
  const reqOptions = (({ hostname, method, path }) => ({ hostname, method, path }))(options);
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
  req.end();
};

module.exports = { httpsRequest };