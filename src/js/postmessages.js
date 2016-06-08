/**
 * Listen to messages from iframe
 */
crunchmailZimlet.prototype._messageListener = function(data) {
    that = this;
    
    var message = JSON.parse(data);
    logger.debug(message);

    if(message.content.hasOwnProperty("apiKey")) {
        // Save new apiKey in Zimbra preference
        var apiKey = message.content.apiKey;
        this._getOrSaveSetting("api_key", apiKey, true, true);
        crunchmailZimlet.settings.apiKey = apiKey;

        if(apiKey === "") {
            logger.debug("apiKey deleted");
        }
    }
    else if(message.content.hasOwnProperty("getContacts")) {
        _BETA(function() {
            var request = message.content.getContacts;
            var asTree = request.hasOwnProperty("asTree") ? request.asTree : false;
            that.fetchContacts(asTree);
        }, function() {
            // Launch requests to get all zimbra contacts (LEGACY MODE)
            that.fetchContactsLegacy();
        });
    }
    else {
        logger.warn("PostMessage type not matched.");
        logger.warn(message);
    }
};

/**
* Setup PostMessage Listener
*/
crunchmailZimlet.prototype.setupMessagesListener = function() {
    var eventMethod = window.addEventListener ? "addEventListener" : "attachEvent";
    var eventer = window[eventMethod];
    var messageEvent = eventMethod == "attachEvent" ? "onmessage" : "message";

    that = this;
    eventer("message",function(e) {
        that._messageListener(e.data);
    });

    logger.debug('PostMessage listener is set up');
};

/**
* Post a message to iframe
*/
crunchmailZimlet.prototype.postMessage = function(data) {
    var obj = {
        "source": "Zimbra",
        "content": data
    };

    var jsonToSend = JSON.stringify(obj);
    frames[0].postMessage(jsonToSend, "*");

    logger.debug('Posted message to iframe');
};
