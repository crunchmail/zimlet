function com_crunchmail_zimlet_HandlerObject() {
    com_crunchmail_zimlet_HandlerObject.settings = {};
}

function _getQueryArgByName (name) {
    name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
    var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
    results = regex.exec(location.search);
    return results === null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
}

function _BETA (func, fallback) {
    if (crunchmailZimlet.settings.experimental) {
        if (func) {
            logger.debug('Executing Beta function: '+func.name);
            func();
        }
    } else {
        if (fallback) fallback();
    }
}

crunchmailConstants = function() {};

crunchmailConstants.UXID_SKIN_FP = 'skin_container_cmfs';
crunchmailConstants.UXID_DWT_FP = 'CM_FULLPAGE';
crunchmailConstants.CONTACTS_ATTRS = [
    'firstName',
    'lastName',
    'namePrefix',
    'middleName',
    'maidenName',
    'company',
    'jobTitle'
];

com_crunchmail_zimlet_HandlerObject.prototype = new ZmZimletBase();
com_crunchmail_zimlet_HandlerObject.prototype.constructor = com_crunchmail_zimlet_HandlerObject;
var crunchmailZimlet = com_crunchmail_zimlet_HandlerObject;

crunchmailZimlet.prototype._getOrSaveSetting = function(setting, value, save, force_save) {
    save = undefined === save ? false : save;
    force_save = undefined === force_save ? false : force_save;
    // if force_save, we need to pass save to setUserProperty anyway
    if (force_save) save = true;

    var currentSetting = this.getUserProperty(setting);

    if ((undefined === currentSetting && save) || force_save) {
        // setting does not exist or we want to override it
        var protectedValue = setting == 'api_key' ? logger.hide(value) : value;
        logger.debug('Saving user setting "' + setting + '", value: ' + protectedValue);

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

    crunchmailZimlet.settings.apiKey = this._getOrSaveSetting('crunchmail_api_key', '', true);

    // we enable debug by default for now
    crunchmailZimlet.settings.debug = this._getOrSaveSetting('debug', true, true);
    // also set debug True if the webmail is running in dev mode (ie. ?dev=1 in url)
    crunchmailZimlet.settings.debug = _getQueryArgByName('dev') === 1 ? true : crunchmailZimlet.settings.debug;

    crunchmailZimlet.settings.experimental = this._getOrSaveSetting('experimental', false, true);

    // contacts related settings
    crunchmailZimlet.settings.contactsAttrs = this._getOrSaveSetting('contacts_attrs', 'firstName,lastName', true);
    crunchmailZimlet.settings.contactsIncludeShared = this._getOrSaveSetting('contacts_include_shared', true, true);
    crunchmailZimlet.settings.contactsDlistMemberOf = this._getOrSaveSetting('contacts_dlist_member_of', true, true);
    crunchmailZimlet.settings.contactsDlistDirectMemberOnly = this._getOrSaveSetting('contacts_dlist_direct_member_only', true, true);
    crunchmailZimlet.settings.contactsDlistIncludeHideInGal = this._getOrSaveSetting('contacts_dlist_include_hide_in_gal', true, true);

    // showtime
    this._Crunchmail = this.createApp("Crunchmail", "tabIcon", "Crunchmail");
};


/**
* This method gets called when the "tab" application is opened for the first time.
*/
crunchmailZimlet.prototype.appLaunch = function(appName) {
    logger.debug("App Launch");
    switch(appName) {
        case this._Crunchmail: {
            this._setTabContent(appName);
        }
    }
};

crunchmailZimlet.prototype._setFpButton = function(appName) {
    // create the fullpage button container
    if (!this._fpContainer) {
        this._fpContainer = document.createElement('div');
        this._fpContainer.id = crunchmailConstants.UXID_SKIN_FP;
        this._fpContainer.className = 'skin_container';
        var skinContainer = document.getElementById("skin_container_global_buttons");
        skinContainer.appendChild(this._fpContainer);
    }
    // create the fullpage button.
    // we will toggle it's display in appActive()
    if (!this._fpButton) {
        var containerEl = document.getElementById(crunchmailConstants.UXID_SKIN_FP);
    	if (!containerEl) {
    		return;
    	}
        this._fpButton = new DwtToolBarButton({parent:DwtShell.getShell(window), id: crunchmailConstants.UXID_DWT_FP});
        this._fpButton.setToolTipContent(this.getMessage('ui.fullpage.title'), true);
        this._fpButton.setImage('FullPage');
        this._fpButton.reparentHtmlElement(crunchmailConstants.UXID_SKIN_FP);

        var fullpageListener = this._toggleFullpage.bind(this);
        this._fpButton.addSelectionListener(fullpageListener);
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

                window.document.title = 'Zimbra: Crunchmail';

                // Create fullpage control if necessary
                this._setFpButton();

                // Make sure fullpage control is visible
                if (this._fpButton) {
                    this._fpContainer.style.display = 'table-cell';
                    this._fpButton.setVisibility(true);
                }

                // Add a new listener to allow user to refresh iframe content
                var refresh = appCtxt.refreshButton;
                refresh.removeSelectionListeners();
                refresh.addSelectionListener(new AjxListener(this, this._refreshIframe));

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
            }else {
                // Hide fullpage control
                if (this._fpButton) {
                    this._fpButton.setVisibility(false);
                    this._fpContainer.style.display = 'none';
                }
                // Reset usual Zimbra UX elements to their defaults
                skin._showEl("skin_td_tree", true);
                skin._showEl("skin_tr_toolbar", true);
                skin._reflowApp();
                zmMenu = document.getElementById('ztb__NEW_MENU_items');
                if(zmMenu) {
                    zmMenu.style.display = '';
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
    var random = new Date().getTime();

    var iframe_url = this._zimletContext.getConfig('iframe_url');
    var api_url = this._zimletContext.getConfig('api_url');
    if (crunchmailZimlet.settings.experimental) {
        iframe_url = this._zimletContext.getConfig('beta_iframe_url');
        api_url = this._zimletContext.getConfig('beta_api_url');
    }

    logger.debug('Setting tab content');
    // create iframe ...
    app.setContent(
        '<div id="crunchmail-fullpage-control">'+
        '<img src="/service/zimlet/com_crunchmail_zimlet/img/fullpage_exit_icon.png" />' + this.getMessage('ui.fullpage.exit') +
        '</div>'+
        '<div class="cm_overlay"><div>'+
        '<div class="spinner"><div class="bounce1"></div><div class="bounce2"></div><div class="bounce3"></div></div>'+
        '</div></div>'+
        '<iframe id="crunchmail-iframe" style="border:0;" name="crunchmail-iframe" ' +
        'src="'+ iframe_url +'?r='+ random +'&apiUrl='+ api_url +'&apiKey='+ crunchmailZimlet.settings.apiKey +'" '+
        'width="100%" height="100%" /></iframe>'
    );
    // Our iFrame loads twice because of the redirect in entrypoint.html
    // use a counter to hide overlay on actual load
    this._iframeLoadCounter = 1;
    var that = this;
    jQuery('#crunchmail-iframe').on('load', function() {
        if (that._iframeLoadCounter === 2) {
            jQuery('.cm_overlay').fadeOut(500);
            // reset counter for future iframe reloads
            that._iframeLoadCounter = 1;
        } else {
            that._iframeLoadCounter++;
        }
    });
    jQuery('#crunchmail-fullpage-control').click(function() {
        that._toggleFullpage();
    });
};

/**
 * Callback function to switch iFrame to static position when user clicks fullpage button
 */
crunchmailZimlet.prototype._toggleFullpage = function(obj) {
    jQuery('#crunchmail-iframe').toggleClass('fullpage');
    jQuery('#crunchmail-fullpage-control').toggleClass('visible');
};

/**
 * Callback function to refresh iFrame when user clicks on Zimbra UX refresh button
 */
crunchmailZimlet.prototype._refreshIframe = function(obj) {
    logger.debug('Refreshing iFrame');
    var iframe = document.getElementById('crunchmail-iframe');

    // Show overlay
    jQuery('.cm_overlay').show(0);
    // Reload iFrame
    iframe.src = iframe.src;
};
