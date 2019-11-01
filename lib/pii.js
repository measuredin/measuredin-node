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
  ip: [],
};

const DEFAULT_EXCLUSION_MATCHERS = {
  amount: [],
  balance: [],
  currency: [],
  created: [],
  type: [],
};

const identifyPIIs = function (matchers, data) {
  const matches = {};

  let json;
  try {
    json = JSON.parse(data);
  } catch (err) {
    // not a JSON
  }

  if (json) {
    Object.keys(json).forEach((k) => {
      Object.keys(matchers).forEach((field) => {
        const matchByField = new RegExp(field).test(k);
        const matchByValue = matchers[field].find((valueRegex) => {
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

const identifyUnknowns = function (exclusions, matched, data) {

  let json;
  try {
    json = JSON.parse(data);
  } catch (err) {
    // not a JSON
  }

  if (json) {
    // remove matched
    matched.forEach((m) => {
      delete json[m];
    });
    // remove exclusions
    Object.keys(json).forEach((k) => {
      Object.keys(exclusions).forEach((field) => {
        const matchByField = new RegExp(field).test(k);
        const matchByValue = exclusions[field].find((valueRegex) => {
          return new RegExp(valueRegex).test(json[k]);
        });
        if (matchByField || matchByValue) {
          delete json[k];
        }
      });
    });
    // remains are unknowns
    return json;
  }

  return {};
}

module.exports = {
  DEFAULT_PII_MATCHERS,
  DEFAULT_EXCLUSION_MATCHERS,
  identifyPIIs,
  identifyUnknowns,
};
