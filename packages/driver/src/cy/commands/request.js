/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const _ = require("lodash");
const whatIsCircular = require("@cypress/what-is-circular");
const Promise = require("bluebird");

const $utils = require("../../cypress/utils");
const $errUtils = require("../../cypress/error_utils");
const $Location = require("../../cypress/location");

const isOptional = function(memo, val, key) {
  if (_.isNull(val)) {
    memo.push(key);
  }
  return memo;
};

const REQUEST_DEFAULTS = {
  url: "",
  method: "GET",
  qs: null,
  body: null,
  auth: null,
  headers: null,
  json: null,
  form: null,
  gzip: true,
  timeout: null,
  followRedirect: true,
  failOnStatusCode: true,
  retryOnNetworkFailure: true,
  retryOnStatusCodeFailure: false
};

const REQUEST_PROPS = _.keys(REQUEST_DEFAULTS);

const OPTIONAL_OPTS = _.reduce(REQUEST_DEFAULTS, isOptional, []);

const hasFormUrlEncodedContentTypeHeader = function(headers) {
  const header = _.findKey(headers, _.matches("application/x-www-form-urlencoded"));

  return header && (_.toLower(header) === "content-type");
};

const isValidJsonObj = body => _.isObject(body) && !_.isFunction(body);

const whichAreOptional = (val, key) => (val === null) && OPTIONAL_OPTS.includes(key);

const needsFormSpecified = function(options = {}) {
  const { body, json, headers } = options;

  //# json isn't true, and we have an object body and the user
  //# specified that the content-type header is x-www-form-urlencoded
  return (json !== true) && _.isObject(body) && hasFormUrlEncodedContentTypeHeader(headers);
};

module.exports = (Commands, Cypress, cy, state, config) => // Cypress.extend
//   ## set defaults for all requests?
//   requestDefaults: (options = {}) ->

Commands.addAll({
  //# allow our signature to be similar to cy.route
  //# METHOD / URL / BODY
  //# or object literal with all expanded options
  request(...args) {
    let a, f, h, o, originOrBase, path;
    let options = (o = {});

    switch (false) {
      case !_.isObject(args[0]):
        _.extend(options, args[0]);
        break;

      case args.length !== 1:
        o.url = args[0];
        break;

      case args.length !== 2:
        //# if our first arg is a valid
        //# HTTP method then set method + url
        if ($utils.isValidHttpMethod(args[0])) {
          o.method = args[0];
          o.url    = args[1];
        } else {
          //# set url + body
          o.url    = args[0];
          o.body   = args[1];
        }
        break;

      case args.length !== 3:
        o.method = args[0];
        o.url    = args[1];
        o.body   = args[2];
        break;
    }

    _.defaults(options, REQUEST_DEFAULTS, {
      log: true
    });

    //# if timeout is not supplied, use the configured default
    if (!options.timeout) { options.timeout = config("responseTimeout"); }

    options.method = options.method.toUpperCase();

    if (options.retryOnStatusCodeFailure && !options.failOnStatusCode) {
      $errUtils.throwErrByPath("request.status_code_flags_invalid");
    }

    if (_.has(options, "failOnStatus")) {
      $errUtils.warnByPath("request.failonstatus_deprecated_warning");
      options.failOnStatusCode = options.failOnStatus;
    }

    //# normalize followRedirects -> followRedirect
    //# because we are nice
    if (_.has(options, "followRedirects")) {
      options.followRedirect = options.followRedirects;
    }

    if (!$utils.isValidHttpMethod(options.method)) {
      $errUtils.throwErrByPath("request.invalid_method", {
        args: { method: o.method }
      });
    }

    if (!options.url) {
      $errUtils.throwErrByPath("request.url_missing");
    }

    if (!_.isString(options.url)) {
      $errUtils.throwErrByPath("request.url_wrong_type");
    }

    //# normalize the url by prepending it with our current origin
    //# or the baseUrl
    //# or just using the options.url if its FQDN
    //# origin may return an empty string if we haven't visited anything yet
    options.url = $Location.normalize(options.url);

    if (originOrBase = config("baseUrl") || cy.getRemoteLocation("origin")) {
      options.url = $Location.qualifyWithBaseUrl(originOrBase, options.url);
    }

    //# Make sure the url unicode characters are properly escaped
    //# https://github.com/cypress-io/cypress/issues/5274
    try {
      options.url = new URL(options.url).href;
    } catch (error) {
      const err = error;
      if (!(err instanceof TypeError)) { //# unexpected, new URL should only throw TypeError
        throw err;
      }

      // The URL object cannot be constructed because of URL failure
      $errUtils.throwErrByPath("request.url_invalid", {
        args: {
          configFile: Cypress.config("configFile")
        }
      });
    }


    //# if options.url isnt FQDN then we need to throw here
    //# if we made a request prior to a visit then it needs
    //# to be filled out
    if (!$Location.isFullyQualifiedUrl(options.url)) {
      $errUtils.throwErrByPath("request.url_invalid", {
        args: {
          configFile: Cypress.config("configFile")
        }
      });
    }

    //# if a user has `x-www-form-urlencoded` content-type set
    //# with an object body, they meant to add 'form: true'
    //# so we are nice and do it for them :)
    //# https://github.com/cypress-io/cypress/issues/2923
    if (needsFormSpecified(options)) {
      options.form = true;
    }

    if (_.isObject(options.body) && (path = whatIsCircular(options.body))) {
      $errUtils.throwErrByPath("request.body_circular", { args: { path }});
    }

    //# only set json to true if form isnt true
    //# and we have a valid object for body
    if ((options.form !== true) && isValidJsonObj(options.body)) {
      options.json = true;
    }

    options = _.omitBy(options, whichAreOptional);

    if (a = options.auth) {
      if (!_.isObject(a)) {
        $errUtils.throwErrByPath("request.auth_invalid");
      }
    }

    if (h = options.headers) {
      if (_.isObject(h)) {
        options.headers = h;
      } else {
        $errUtils.throwErrByPath("request.headers_invalid");
      }
    }

    if (!_.isBoolean(options.gzip)) {
      $errUtils.throwErrByPath("request.gzip_invalid");
    }

    if (f = options.form) {
      if (!_.isBoolean(f)) {
        $errUtils.throwErrByPath("request.form_invalid");
      }
    }

    //# clone the requestOpts and reduce them down
    //# to the bare minimum to send to lib/request
    const requestOpts = _.pick(options, REQUEST_PROPS);

    if (options.log) {
      options._log = Cypress.log({
        message: "",
        consoleProps() {
          const resp = options.response != null ? options.response : {};
          let rr   = resp.allRequestResponses != null ? resp.allRequestResponses : [];

          const obj = {};

          const word = $utils.plural(rr.length, "Requests", "Request");

          //# if we have only a single request/response then
          //# flatten this to an object, else keep as array
          rr = rr.length === 1 ? rr[0] : rr;

          obj[word] = rr;
          obj["Yielded"] = _.pick(resp, "status", "duration", "body", "headers");

          return obj;
        },

        renderProps() {
          let indicator;
          const status = (() => { let r;
          switch (false) {
            case !(r = options.response):
              return r.status;
            default:
              indicator = "pending";
              return "---";
          } })();

          if (indicator == null) { indicator = (options.response != null ? options.response.isOkStatusCode : undefined) ? "successful" : "bad"; }

          return {
            message: `${options.method} ${status} ${options.url}`,
            indicator
          };
        }
      });
    }

    //# need to remove the current timeout
    //# because we're handling timeouts ourselves
    cy.clearTimeout("http:request");

    return Cypress.backend("http:request", requestOpts)
    .timeout(options.timeout)
    .then(response => {
      options.response = response;

      //# bomb if we should fail on non okay status code
      if (options.failOnStatusCode && (response.isOkStatusCode !== true)) {
        $errUtils.throwErrByPath("request.status_invalid", {
          onFail: options._log,
          args: {
            method:          requestOpts.method,
            url:             requestOpts.url,
            requestBody:     response.requestBody,
            requestHeaders:  response.requestHeaders,
            status:          response.status,
            statusText:      response.statusText,
            responseBody:    response.body,
            responseHeaders: response.headers,
            redirects:       response.redirects
          }
        });
      }

      return response;
  }).catch(Promise.TimeoutError, err => {
      return $errUtils.throwErrByPath("request.timed_out", {
        onFail: options._log,
        args: {
          url:     requestOpts.url,
          method:  requestOpts.method,
          timeout: options.timeout
        }
      });
    }).catch({ backend: true }, err => $errUtils.throwErrByPath("request.loading_failed", {
      onFail: options._log,
      args: {
        error:   err.message,
        stack:   err.stack,
        method:  requestOpts.method,
        url:     requestOpts.url
      },
      noStackTrace: true
    }));
  }
});
