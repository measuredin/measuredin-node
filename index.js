const API_HOST = 'measuredin.com'

function flush(agent, options, data) {

}

// http
const http = require('http');
const __httpRequest = http.request;
http.request = function() {
  const args = arguments;
  const clientRequest = __httpRequest.apply(this, arguments);
  const __outgoingWrite = clientRequest.write;
  // starting v10.9.0, url can be passed in
  // https://nodejs.org/api/http.html#http_http_request_url_options_callback
  const clientAgent = clientRequest.agent;
  const reqOptions = typeof args[0] === 'string' ? args[1] : args[0];
  // monkey patch on non-API requests
  if (!reqOptions.hostname.includes(API_HOST)) {
    const chunks = [];
    clientRequest.write = function(data) {
      chunks.push(data);
      return __outgoingWrite.apply(this, arguments);
    }
    clientRequest.on('finish', function() {
      const data = Buffer.concat(chunks);
      flush(clientAgent, reqOptions, data);
    })
  }
  return clientRequest;
};