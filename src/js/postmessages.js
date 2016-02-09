/**
 * Listen to messages from iframe
 */
crunchmailZimlet.prototype._messageListener = function(data) {
    var message = JSON.parse(data);

    logger.debug('PostMessage received');

    if(message.content.hasOwnProperty("apiKey")) {
        // Save new apiKey in Zimbra preference
        apiKey = message.content.apiKey;
        this.setUserProperty("crunchmail_api_key", apiKey, true);
        crunchmailZimlet.settings.apiKey = apiKey;

        if(apiKey !== "") {
            var protectedKey = logger.hide(apiKey);
            logger.debug("apiKey "+protectedKey+" saved");
        }
        else {
            logger.debug("apiKey deleted");
        }
    }
    else if(message.content.hasOwnProperty("getContacts")) {
        // Launch request to get all zimbra contacts
        crunchmailZimlet.prototype.fetchContacts();
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
