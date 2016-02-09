var logger = (function () {
    /**
    * Print messages to the console using provided level.
    */
    var _output = function (type, msg, enabled) {
        if (true === enabled && 'object' === typeof window.console) {
            if('object' === typeof msg) {
                console[type]('CrunchmailZimlet');
                console[type](msg);
            } else {
                console[type]('CrunchmailZimlet: ' + msg);
            }
        }
    };

    self = {};

    /**
    * Log warning messages to console.
    * Always logged regardless of the 'log' setting.
    */
    self.warn = function (msg) {
        _output('warn', msg, true);
    };

    /**
    * Log information messages to console.
    * Only displayed if 'log' setting is true.
    */
    self.info = function (msg) {
        _output('info', msg, crunchmailZimlet.settings.debug);
    };

    /**
    * Log debug messages to console.
    * Only displayed if 'debug' setting is true.
    */
    self.debug = function (msg) {
        _output('log', msg, crunchmailZimlet.settings.debug);
    };

    self.hide = function(str, showChars) {
        showChars = showChars === undefined ? 5 : showChars;
        var protectedStr = "";
        var last5Chars = str.substr(str.length - showChars);
        for(var a = 0; a < str.length - 5; a++) {
            protectedStr += "*";
        }
        protectedStr += last5Chars;
        return protectedStr;
    };

    return self;

})();
