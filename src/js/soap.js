/**
 * Send SOAP request to Zimbra
 */
crunchmailZimlet.prototype.sendRequest = function(request, urn, args, callback, callbackArgs, errorCallback) {
    callbackArgs = undefined === callbackArgs ? {} : callbackArgs;

    var jsonObj = {};
    jsonObj[request] = { _jsns: 'urn:'+urn };

    for (var key in args) {
        if (args.hasOwnProperty(key)) {
            jsonObj[request][key] = args[key];
        }
    }

    var params = {
        jsonObj       : jsonObj,
        asyncMode     : true,
        callback      : new AjxCallback(this, callback, callbackArgs),
        errorCallback : new AjxCallback(this, this.handleRequestError, {request: request, args: callbackArgs, callback: errorCallback})
    };

    appCtxt.getAppController().sendRequest(params);
};

/**
 * Handle request errors
 */
crunchmailZimlet.prototype.handleRequestError = function(params, err) {
    logger.debug('Request error callback');

    if (this._raven !== undefined) {
        this._raven.captureException(new Error(err.msg), {extra: {request: err.request}});
    }

    statusmsg = {
        msg: this.getMessage('error_' + params.request.toLowerCase()),
        level: ZmStatusView.LEVEL_WARNING
    };
    this.displayStatusMessage(statusmsg);

    logger.debug('Request error: ' + err.msg);
    logger.debug(err.request);

    // Call requested callback if it exists
    if (undefined !== params.callback) {
        // Need to pass this otherwise context in callback is wrong
        params.callback(this);
    }

    // Return true to avoid error dialog popup
    return true;
};

/**
 * Trigger contacts fetching
 */
crunchmailZimlet.prototype.fetchContacts = function(asTree, existing) {
    var ext_debug = crunchmailZimlet.settings.debug ? '1' : '0';
    var request_base  = asTree ? 'GetContactsTree' : 'GetContacts';
    if (this._getContactsLock === undefined || this._getContactsLock !== request_base) {
        logger.debug('Sending request for contacts: ' + request_base);
        this._getContactsLock = request_base;
        this.sendRequest(
            request_base+'Request', 'crunchmail', {debug: ext_debug, existing: existing},
            this.handleContacts, {response: request_base+'Response'},
            this.handleContactsError
        );
    } else {
        logger.debug('Received duplicate ' + request_base + ' request, ignoring.');
    }
};

/**
 * Pass response from getContacts to iFrame via postmessage
 */
crunchmailZimlet.prototype.handleContacts = function(params, result) {
    var response = result.getResponse();

    logger.debug('GetContacts(Tree) response');
    logger.debug(response);

    var data = response[params.response];

    if (data.hasOwnProperty('timer')) logger.debug('Contacts fetched in: ' + data.timer);
    this.postMessage({'contacts': [data]});

    // Reset lock so we can process new requests
    this._getContactsLock = '';
};

crunchmailZimlet.prototype.handleContactsError = function(app) {
    logger.debug('handle GetContacts(Tree) request error');

    data = {error: ''};
    app.postMessage({'contacts': [data]});

    // Reset lock so we can process new requests
    app._getContactsLock = '';
};
