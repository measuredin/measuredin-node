'use strict';

const http = require('http');
const https = require('https');

const clientInterceptor = function(host, callback, init) {
  // http(s)
  [http, https].forEach(function (lib) {
    const __request = lib.request;
    lib.request = function () {
      const args = arguments;
      const clientRequest = __request.apply(this, arguments);
      const __outgoingWrite = clientRequest.write;
      // starting v10.9.0, url can be passed in
      // https://nodejs.org/api/http.html#http_http_request_url_options_callback
      const reqOptions = typeof args[0] === 'string' ? args[1] : args[0];
      // monkey patch on non-API requests
      if (!reqOptions.hostname.includes(host)) {
        const chunks = [];
        // https://github.com/nodejs/node/blob/master/lib/_http_outgoing.js
        clientRequest.write = function (data) {
          chunks.push(data);
          return __outgoingWrite.apply(this, arguments);
        };
        clientRequest.on('finish', function () {
          const data = Buffer.concat(chunks);
          callback(reqOptions, data);
        });
        clientRequest.once('response', init);
      }
      return clientRequest;
    };
  });
};

const serverInterceptor = function (callback, init) {
  // http(s)
  [http, https].forEach(function (lib) {
    const __server = lib.createServer;
    lib.createServer = function () {
      const server = __server.apply(this, arguments);
      server.on('request', (request, response) => {
        const chunks = [];
        request.on('data', (chunk) => {
          chunks.push(chunk);
        }).on('end', () => {
          if (chunks.length) {
            const data = Buffer.concat(chunks).toString();
            callback({
              hostname: request.headers['host'],
              path: request.url,
            }, data);
          }
        });
        response.once('finish', init);
      });
      return server;
    };
  });
};

module.exports = {
  clientInterceptor,
  serverInterceptor,
};