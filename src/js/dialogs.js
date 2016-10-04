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
 * Gather pref dialog data
 */
crunchmailZimlet.prototype._popupPrefDialog = function(tplData) {
    var html = AjxTemplate.expand('com_crunchmail_zimlet.templates.settings#settings', tplData);
    var title = this.getMessage('pref_title');

    this._displayDialog(title, html, this._prefSaveBtn);

    /**
     *  We need some javascript magic to make the pref dialog nicer
     */
    that = this;
    if (!tplData.extensionOK) {
        jQuery('#pref_extension_version').hide();
        jQuery('#pref_extension_missing').show();
    }
    // contacts attrs multiselect
    jQuery.each(crunchmailConstants.CONTACTS_ATTRS, function(i, attr) {
        // Populate the multiselects
        // TODO: check if already selected (tplData.contactsAttrs)
        jQuery('<option value='+attr+'>'+that.getMessage('pref_contactsattrs_'+attr)+'</option>')
        .appendTo('#cmpref_contactsAttrs_lib').on('mousedown', function(e) {
            this.selected = !this.selected;
            e.preventDefault();
        });
    });
    jQuery('.pref_multiselect').on('mousedown',function(e) {
        // Deselect all option on click below
        var selected = jQuery(e.target).find('option:selected');
        if (selected.length) {
            selected.prop('selected', false);
        }
    });
    jQuery('#pref_attr_add').click(function() {
        // handle adding attr to selection
        return !jQuery('#cmpref_contactsAttrs_lib option:selected')
                .removeAttr('selected').hide().clone()
                .appendTo('#cmpref_contactsAttrs')
                .show().on('mousedown', function(e) {
                    this.selected = !this.selected;
                    e.preventDefault();
                });
    });
    jQuery('#pref_attr_del').click(function() {
        // handle deleting attr from selection
        return !jQuery('#cmpref_contactsAttrs option:selected').each(function() {
            var val = jQuery(this).val();
            jQuery('#cmpref_contactsAttrs_lib option[value='+val+']').show();
            jQuery(this).remove();
        });
    });
    // list member checkbox group
    var list_member = jQuery('#cmpref_contactsDlistMemberOf');
    var direct_member = jQuery('#cmpref_contactsDlistDirectMemberOnly');
    if (!list_member.prop('checked')) {
        direct_member.prop('checked', false);
        direct_member.prop('disabled', true);
    }
    list_member.change(function() {
        if(this.checked) {
            direct_member.prop('disabled', false);
        } else {
            direct_member.prop('checked', false);
            direct_member.prop('disabled', true);
        }
    });
};

/**
 * Display preferences dialog
 */
crunchmailZimlet.prototype._displayPrefDialog = function() {
    logger.debug('_displayPrefDialog');

    var tplData = crunchmailZimlet.settings;
    // Our template can't use booleans as is
    for (var key in tplData) {
        if (typeof(tplData[key]) === 'boolean') {
            tplData[key] = tplData[key] === true ? 'checked' : '';
        }
    }

    // Add the zimlet version/commit for info
    tplData.zimletVersion = this._zimletContext.getConfig('zimlet_version');
    tplData.zimletCommit = this._zimletContext.getConfig('zimlet_commit');

    // Add the extension version/commit for info
    var that = this;
    this.sendRequest('GetVersionRequest', 'crunchmail', {}, function(params, result){
        var response = result.getResponse().GetVersionResponse;
        tplData.extensionVersion = response.version;
        tplData.extensionCommit = response.commit_short;
        tplData.extensionOK = true;
        that._popupPrefDialog(tplData);
    }, {}, function() {
        tplData.extensionOK = false;
        that._popupPrefDialog(tplData);
    });
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

            if (val === 'bool') {
                crunchmailZimlet.settings[s] = that._getOrSaveSetting(humps.decamelize(s), el.checked, true, true);
            } else {
                crunchmailZimlet.settings[s] = that._getOrSaveSetting(humps.decamelize(s), val, true, true);
            }
        }
    });

    this._cancelBtn();
};
