/**
 * Send SOAP request to Zimbra
 */
crunchmailZimlet.prototype.sendRequest = function(request, urn, args, callback, callbackArgs) {
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
        errorCallback : new AjxCallback(this, this.requestErrorCallback, {request: request, args: callbackArgs})
    };

    appCtxt.getAppController().sendRequest(params);
};

/**
 * Handle request errors
 */
crunchmailZimlet.prototype.requestErrorCallback = function(params, err) {
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
};

/**
 * Trigger contacts fetching
 */
crunchmailZimlet.prototype.fetchContacts = function(asTree) {
    var ext_debug = crunchmailZimlet.settings.debug ? '1' : '0';
    var request_base  = asTree ? 'GetContactsTree' : 'GetContacts';
    if (this._getContactsLock === undefined || this._getContactsLock !== request_base) {
        this._getContactsLock = request_base;
        this.sendRequest(request_base+'Request', 'crunchmail', {debug: ext_debug}, this.handleContacts, {'response': request_base+'Response'});
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
