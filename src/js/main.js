function com_crunchmail_zimlet_HandlerObject() {
    com_crunchmail_zimlet_HandlerObject.settings = {};
}

function _getQueryArgByName (name) {
    name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
    var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
    results = regex.exec(location.search);
    return results === null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
}

com_crunchmail_zimlet_HandlerObject.prototype = new ZmZimletBase();
com_crunchmail_zimlet_HandlerObject.prototype.constructor = com_crunchmail_zimlet_HandlerObject;
var crunchmailZimlet = com_crunchmail_zimlet_HandlerObject;

crunchmailZimlet.prototype._getOrSaveSetting = function(setting, value, save) {
    save = undefined === save ? false : save;
    var currentSetting = this.getUserProperty(setting);

    if (undefined === currentSetting || save) {
        // setting does not exist or we want to override it
        this.setUserProperty(setting, value, save);
        return value;
    } else {
        // return current value
        if(typeof(value) === 'boolean') {
            // user settings are stored and returned as strings so we need this little trick
            return currentSetting == 'true' ? true : false;
        } else {
            return currentSetting;
        }
    }
};

crunchmailZimlet.prototype._setupRaven = function() {
    zimletList = appCtxt.getZimletMgr().getZimlets();
    zimletListData = {};
    for (i = 0, len = zimletList.length; i < len; i++) {
        zimlet = zimletList[i];
        zimletListData[zimlet.name] = {
            version: zimlet.version,
            priority: zimlet.priority
        };
    }

    if (undefined !== this._zimletContext.getConfig('sentry_dsn')) {
        // Init Raven to catch errors and send them to our Sentry
        Raven.config(this._zimletContext.getConfig('sentry_dsn'), {
            release: this._zimletContext.getConfig('zimlet_version'),
            tags: {
                git_commit: this._zimletContext.getConfig('zimlet_commit'),
                env: this._zimletContext.getConfig('zimlet_env'),
                zimbra_version: appCtxt.get(ZmSetting.CLIENT_VERSION)
            }
        });
        Raven.setUserContext({
            'email': appCtxt.getUsername(),
        });
        Raven.setExtraContext({
            'zimlets:installed': zimletListData
        });
        Raven.debug = this._zimletContext.getConfig('sentry_debug') == 'true' ? true : false;
        Raven.install();

        this._raven = Raven;
    }
};

// Init zimlet
crunchmailZimlet.prototype.init = function() {

    // First setup our error reporter
    this._setupRaven();

    // store the settings to be used throughout the application
    crunchmailZimlet.settings.iframeUrl = this._zimletContext.getConfig('iframe_url');
    crunchmailZimlet.settings.apiUrl = this._getOrSaveSetting('crunchmail_api_url', this._zimletContext.getConfig('default_api_url'));
    // simple flag to allow iframe reloading when setting is changed
    crunchmailZimlet.settings.apiUrlChanged = false;
    crunchmailZimlet.settings.apiKey = this._getOrSaveSetting('crunchmail_api_key', '');
    // we enable debug by default for now
    crunchmailZimlet.settings.debug = this._getOrSaveSetting('crunchmail_debug', true);
    // also set debug True if the webmail is running in dev mode (ie. ?dev=1 in url)
    crunchmailZimlet.settings.debug = _getQueryArgByName(dev) === 1 ? true : crunchmailZimlet.settings.debug;

    // contacts related settings
    crunchmailZimlet.settings.contactsAttrs = this._getOrSaveSetting('crunchmail_contacts_attrs', 'namePrefix,firstName,lastName');
    crunchmailZimlet.settings.contactsIncludeShared = this._getOrSaveSetting('crunchmail_contacts_include_shared', true);
    crunchmailZimlet.settings.contactsDlistMemberOf = this._getOrSaveSetting('crunchmail_contacts_dlist_member_of', true);
    crunchmailZimlet.settings.contactsDlistDirectMemberOnly = this._getOrSaveSetting('crunchmail_contacts_dlist_direct_member_only', true);
    crunchmailZimlet.settings.contactsDlistOwnerOf = this._getOrSaveSetting('crunchmail_contacts_dlist_owner_of', true);

    // showtime
    this._Crunchmail = this.createApp("Crunchmail", "tabIcon", "Crunchmail");
};


/**
* This method gets called when the "tab" application is opened for the first time.
*/
crunchmailZimlet.prototype.appLaunch = function(appName) {
    logger.debug("appLaunch");
    switch(appName) {
        case this._Crunchmail: {
            this._setTabContent(appName);
        }
    }
};


/**
* This method gets called each time the "tab" application is opened or closed.
*/
crunchmailZimlet.prototype.appActive = function(appName, active) {
    switch (appName) {
        case this._Crunchmail: {
            if (active) {
                logger.debug("App active");

                logger.debug('Starting contacts fetch');
                this.fetchContacts();

                /*
                * reload iframe if API URL has changed
                */
                if(crunchmailZimlet.settings.apiUrlChanged) {
                    // if(iframe !== null) {
                    logger.info("API URL changed, reloading iFrame");
                    this._setTabContent(appName);
                    this.postMessage({"refresh": true});
                    // }
                    crunchmailZimlet.settings.apiUrlChanged = false;
                }

                // Setup the postmessage listener on our end
                this.setupMessagesListener();

                // Get rid of the usual Zimbra UX elements since we don't use them
                skin._showEl("skin_td_tree", false);
                skin._showEl("skin_tr_toolbar", false);
                skin._reflowApp();
                zmMenu = document.getElementById('ztb__NEW_MENU_items');
                if(zmMenu) {
                    zmMenu.style.display = 'none';
                }
                zmRefresh = document.getElementById('CHECK_MAIL');
                if(zmRefresh) {
                    zmRefresh.style.display = 'none';
                }
            }else {
                // Reset usual Zimbra UX elements to their defaults
                skin._showEl("skin_td_tree", true);
                skin._showEl("skin_tr_toolbar", true);
                skin._reflowApp();
                zmMenu = document.getElementById('ztb__NEW_MENU_items');
                if(zmMenu) {
                    zmMenu.style.display = '';
                }
                zmRefresh = document.getElementById('CHECK_MAIL');
                if(zmRefresh) {
                    zmRefresh.style.display = '';
                }
            }
            break;
        }
    }
};


/**
* Events
*/

//Use singleClicked instead of double
crunchmailZimlet.prototype.doubleClicked = function(appName) {
    this.singleClicked();
};

crunchmailZimlet.prototype.singleClicked = function() {
    this._displayPrefDialog();
};

crunchmailZimlet.prototype.menuItemSelected = function(itemId) {
    switch (itemId) {
        case "crunchmail_pref":
        this._displayPrefDialog();
        break;
    }
};


/**
* Create our tab
*/
crunchmailZimlet.prototype._setTabContent = function(appName) {
    var app = appCtxt.getApp(appName);

    logger.debug('Setting tab content');
    // create iframe ...
    app.setContent(
        '<div id="overlay" class="overlay">' +
        '<div class="spinner"><div class="bounce1"></div><div class="bounce2"></div><div class="bounce3"></div></div>' +
        '</div>' +
        '<iframe id="tabiframe-app" style="border:0;" name="tabiframe-app" ' +
        'src="'+ crunchmailZimlet.settings.iframeUrl +'?apiUrl='+ crunchmailZimlet.settings.apiUrl +'&apiKey='+ crunchmailZimlet.settings.apiKey +'" ' +
        'width="100%" height="100%" /></iframe>'
    );
};
