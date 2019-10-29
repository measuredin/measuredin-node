// axios
try {
  require.resolve('axios');
  const __axios = require('axios');
  const axiosInterceptor = function(config) {
    // TODO log request
    return config;
  }
  // TODO - handle interceptor ejection
  const defaultInterceptor = __axios.interceptors.request.use(axiosInterceptor, function (error) {
    return Promise.reject(error);
  });
  const axiosFactory = __axios.create;
  __axios.create = function (instanceConfig) {
    const instance = axiosFactory(instanceConfig);
    // TODO - handle interceptor ejection
    const instanceInterceptor = instance.interceptors.request.use(axiosInterceptor, function (error) {
      return Promise.reject(error);
    });
    return instance;
  }
} catch (error) {
  // axios not present
}
