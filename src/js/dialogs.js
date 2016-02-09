/**
 * Generic dialog builder
 */
crunchmailZimlet.prototype._displayDialog = function(title, content, ok_callback) {
    var buttons = [DwtDialog.CANCEL_BUTTON];
    if (ok_callback !== undefined) {
        buttons.unshift(DwtDialog.OK_BUTTON);
    }

    this._dialog = new ZmDialog({
        title           : title,
        parent          : this.getShell(),
        standardButtons : buttons
    });
    this._dialog.setContent(content);
    if (ok_callback !== undefined) {
        this._dialog.setButtonListener(DwtDialog.OK_BUTTON, new AjxListener(this, ok_callback));
    }
    this._dialog.setButtonListener(DwtDialog.CANCEL_BUTTON, new AjxListener(this, this._cancelBtn));
    this._dialog._setAllowSelection();
    this._dialog.popup();
};

/**
 * Global cancel button callback
 */
crunchmailZimlet.prototype._cancelBtn = function() {
    try {
        this._dialog.setContent('');
        this._dialog.popdown();
    } catch (err) {
    }
};

/**
 * Display preferences dialog
 */
crunchmailZimlet.prototype._displayPrefDialog = function() {
    logger.debug("_displayPrefDialog");

    var tplData = crunchmailZimlet.settings;
    // Our template can't use booleans as is
    for (var key in tplData) {
        if (typeof(tplData[key]) === 'boolean') {
            tplData[key] = tplData[key] === true ? 'checked' : '';
        }
    }

    var html = AjxTemplate.expand('com_crunchmail_zimlet.templates.settings#settings', tplData);
    var title = this.getMessage('pref_title');

    this._displayDialog(title, html, this._prefSaveBtn);
};

/**
 * Save user preferences (ok button callback)
 */
crunchmailZimlet.prototype._prefSaveBtn = function() {
    var that = this;
    settings = Object.keys(crunchmailZimlet.settings);
    settings.forEach(function(s) {
        el = document.getElementById('cmpref_' + s);
        if (el) {
            var val = el.value;

            // Mark API URL setting as changed to reload iFrame
            if (s === 'apiUrl' && crunchmailZimlet.settings.apiUrl !== val) crunchmailZimlet.settings.apiUrlChanged = true;

            if (val === 'bool') {
                crunchmailZimlet.settings[s] = that._getOrSaveSetting('crunchmail_'+humps.decamelize(s), el.checked, true);
            } else {
                crunchmailZimlet.settings[s] = that._getOrSaveSetting('crunchmail_'+humps.decamelize(s), val, true);
            }
        }
    });

    this._cancelBtn();
};
