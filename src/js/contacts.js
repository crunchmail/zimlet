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
        errorCallback : new AjxCallback(this, this.requestErrorCallback, request)
    };

    appCtxt.getAppController().sendRequest(params);
};


/**
 * Handle request errors
 */
crunchmailZimlet.prototype.requestErrorCallback = function(request, err) {
    this._raven.captureException(new Error(err.msg), {extra: {request: err.request}});

    params = {
        msg: this.getMessage('error_' + request.toLowerCase()),
        level: ZmStatusView.LEVEL_WARNING
    };
    this.displayStatusMessage(params);

    logger.debug('Request error: ' + err.msg);
    logger.debug(err.request);
};


/**
 * Helper function to get contact attributes to request for from settings
 */
crunchmailZimlet.prototype._getRequestContactAttrs = function() {
    var attrs = crunchmailZimlet.settings.contactsAttrs.split(',');
    attrs.push('email');
    attrs.push('type');

    var contactAttrs = [];
    attrs.forEach(function(item) {
        contactAttrs.push({n: item});
    });

    return contactAttrs;
};

/**
 * Trigger contact fetching
 */
crunchmailZimlet.prototype.fetchContacts = function() {
    // initialize contacts objects
    this.zimbraContacts = {
        'tags'     : [],
        'contacts' : [],
        'groups'   : [],
        'dls'      : [],
    };
    this.contactsTracker = [];

    this.sendRequest('GetContactsRequest', 'zimbraMail', {a: this._getRequestContactAttrs()}, this.handleContacts);
    this.sendRequest('GetAccountDistributionListsRequest', 'zimbraAccount', {ownerOf: 1, memberOf: 'all'}, this.handleDlists);
    this.sendRequest('GetTagRequest', 'zimbraMail', {}, this.handleTags);
};


/**
 * Store retrieved contacts and send them to iFrame once done
 */
crunchmailZimlet.prototype.postContacts = function() {
    logger.debug('Processed so far: ' + this.contactsTracker.join(', '));

    // Check if we've processed all expected types of data
    var todo = Object.keys(this.zimbraContacts);
    var that = this;
    var allDone = true;
    todo.forEach(function(item) {
        if (that.contactsTracker.indexOf(item) === -1) allDone = false;
    });

    if (allDone) {
        // We collected everything, post it to iFrame
        logger.info('All contacts processed, sending !');

        // TODO: we shouldn't be touching the overlay, iFrame can do it itself
        var iframe = document.getElementById('tabiframe-app');
        if (iframe.classList.contains('iframeLoaded')) {
            logger.info("iframe has class iframeLoaded");
            this.postMessage({'contacts': [this.zimbraContacts]});
        } else {
            iframe.addEventListener('load', function() {
                logger.info("iframe loaded");
                that.postMessage({'contacts': [this.zimbraContacts]});
                iframe.classList.add('iframeLoaded');
                iframe.style.display = "block";
                overlay.classList.add("isHidden");
            });
        }
    } else {
        logger.debug('Not yet ready to post zimbraContacts...');
    }
};


/**
 * Helper functions for contacts
 */
crunchmailZimlet.prototype._createContact = function(contact, groupId) {
    var contactObj = {
        'email'      :'',
        'tags'       :[],
        'properties' : {},
        'source_type': 'zimbra',
        'source_ref' : 'contact:' + contact.id
    };

    if (undefined !== groupId) {
        contactObj.source_ref = 'group:' + groupId;
    }
    // Check if contact has tags
    if (contact.hasOwnProperty('tn')) {
        var tags = contact.tn.split(',');
        for (var t = 0; t < tags.length; t++) {
            contactObj.tags.push(tags[t]);
        }
    }

    contactObj.email = contact._attrs.email;

    // gather contact properties
    for (var a in contact._attrs) {
        if (a !== 'email') {
            contactObj.properties[a] = contact._attrs[a];
        }
    }

    return contactObj;
};

crunchmailZimlet.prototype._isSharedContact = function(id) {
    // Contact identifier can be of two types
    //     local contact: {itemId}
    //     shared contact: {zimbraAccountId}:{itemId}
    return (id.split(':').length > 1);
};

/**
 * Handle GetContacts response
 */
crunchmailZimlet.prototype.handleContacts = function(params, result) {

    var response = result.getResponse();
    var groupsArr = [];

    logger.debug('Get contacts response');
    logger.debug(response);

    if (response.GetContactsResponse.hasOwnProperty('cn')) {
        var contactsArr = response.GetContactsResponse.cn;

        for (var c = 0; c < contactsArr.length; c++) {
            var contact = contactsArr[c];

            if (contact.hasOwnProperty('l') && contact.hasOwnProperty('_attrs')) {
                // Check if contact is not in 'emailed contacts' or trash
                // see https://wiki.zimbra.com/wiki/Ajcody-Mysql-Topics#Get_folder_id_Number_And_Description
                // 13 = Emailed contacts
                // 3 = Trash
                if (contact.l !== '13' && contact.l !== '3') {
                    // Check if group or not
                    if (contact._attrs.hasOwnProperty('type') && contact._attrs.type === 'group') {
                        // Group
                        // store group ID for members request later
                        groupsArr.push(contact.id);

                    } else {
                        // Contact
                        // Check if contact has email
                        if (contact._attrs.hasOwnProperty('email')) {
                            this.zimbraContacts.contacts.push(this._createContact(contact));
                        }
                    }
                }
            } else {
                logger.debug('Contact has no folder id or no returned attributes');
                logger.debug(contact);
            }
        }
    }
    // Mark as done
    this.contactsTracker.push('contacts');

    // Now deal with groups
    if (groupsArr.length > 0) {
        // Fetch contact groups members
        var requestArgs = {
            derefGroupMember : 1,
            cn : { id : groupsArr.join(',') },
            ma : this._getRequestContactAttrs()
        };
        this.sendRequest('GetContactsRequest', 'zimbraMail', requestArgs, this.handleContactGroups);
    } else {
        // No groups, simply mark as done
        this.contactsTracker.push('groups');
        // Trigger postMessage in case we're last
        this.postContacts();
    }
};


/**
 * Handle GetContacts response (groups)
 */
crunchmailZimlet.prototype.handleContactGroups = function(params, result) {

    var response = result.getResponse();

    logger.debug('Get contact groups response');
    logger.debug(response);

    if (response.GetContactsResponse.hasOwnProperty('cn')) {
        var groupsArr = response.GetContactsResponse.cn;

        for (var g = 0; g < groupsArr.length; g++) {
            var group = groupsArr[g];

            var groupObj = {
                'name'   : group._attrs.fullName,
                'tags'   : [],
                'members': []
            };
            var mailOnlyObj = {
                'email'       : '',
                'source_type' : 'zimbra',
                'source_ref'  : 'group:' + group.id
            };

            // Check if group has tags
            if (group._attrs.hasOwnProperty('tn')) {
                var tags = group._attrs.tn.split(',');
                for (var t = 0; t < tags.length; t++) {
                    groupObj.tags.push(tags[t]);
                }
            }

            // loop through group members
            for (var m = 0; m < group.m.length; m++) {
                var member = group.m[m];

                if ((member.type === 'C' || member.type === 'G') &&
                    member.hasOwnProperty('cn')) {
                    // This is an actual contact (C) or a GAL reference (G)

                    var contact = member.cn[0];

                    if (contact.hasOwnProperty('_attrs') &&
                        contact._attrs.hasOwnProperty('email') && (
                            !this._isSharedContact(contact.id) ||
                            (this._isSharedContact(contact.id) && crunchmailZimlet.settings.contactsIncludeShared)
                        )
                    ) {
                        groupObj.members.push(this._createContact(contact, group.id));
                    }
                } else if (member.type === 'I') {

                    // This is a plain email address
                    mailOnlyObj.email = member.value;
                    groupObj.members.push(mailOnlyObj);

                } else {
                    logger.debug('Contact group member has no type or no details');
                    logger.debug(member);
                }
            }
            this.zimbraContacts.groups.push(groupObj);
        }
    }

    // Mark as done
    this.contactsTracker.push('groups');
    // Trigger postMessage in case we're last
    this.postContacts();
};


/**
 * Handle GetAccountDistributionLists response
 */
crunchmailZimlet.prototype.handleDlists = function(params, result) {

    var response = result.getResponse();
    var toFetch = [];
    this.dls = {};
    this.dlsList = [];

    logger.debug('Get distribution lists response');
    logger.debug(response);
    if (response.GetAccountDistributionListsResponse.hasOwnProperty('dl')) {
        nbrDl = response.GetAccountDistributionListsResponse.dl.length;
        for (var j = 0; j < nbrDl; j++) {
            var dl = response.GetAccountDistributionListsResponse.dl[j];

            // Only consider Dlists matching settings
            if (
                (dl.isOwner && crunchmailZimlet.settings.contactsDlistOwnerOf) || (
                    dl.isMember && crunchmailZimlet.settings.contactsDlistMemberOf && (
                        !dl.hasOwnProperty('via') ||
                        (dl.hasOwnProperty('via') && !crunchmailZimlet.settings.contactsDlistDirectMemberOnly)
                    )
                )
            ) {
                var itemDL = {
                    'name'   : '',
                    'email'  : dl.name,
                    'id'     : dl.id,
                    'members': [],
                };
                if (dl.hasOwnProperty('d')) {
                    itemDL.name = dl.d;
                }

                this.dls[dl.name] = itemDL;
                this.dlsList.push(dl.name);
            }
        }
    } else {
        // No Dlists, simply mark as done
        this.contactsTracker.push('dls');
        // Trigger postMessage in case we're last
        this.postContacts();
    }

    // Fetch all Dlists members
    var that = this;
    this.dlsList.forEach(function(item) {
        that.sendRequest('GetDistributionListMembersRequest', 'zimbraAccount', {dl: {_content: item}}, that.handleDlistsMembers, {dl: item});
    });
};


/**
 * Handle GetDistributionListMembers response
 */
crunchmailZimlet.prototype.handleDlistsMembers = function(params, result) {
    var response = result.getResponse();
    var dl = params.dl;

    logger.debug('Get distribution list members response');
    logger.debug(response);
    if (response.GetDistributionListMembersResponse.hasOwnProperty('dlm')) {
        var membersArr = response.GetDistributionListMembersResponse.dlm;

        for (var m = 0; m < membersArr.length; m++) {
            member = membersArr[m]._content;

            // We want to exclude members that are known Dlists
            if (this.dlsList.indexOf(member) === -1) {
                var memberObj = {
                    'email': member,
                    'source_type': 'zimbra',
                    'source_ref': 'dl:' + this.dls[dl].id
                };
                this.dls[dl].members.push(memberObj);
            }
        }
        this.zimbraContacts.dls.push(this.dls[dl]);
        // delete from tmp object so we can determine when we're done
        delete this.dls[dl];
    }

    if (Object.keys(this.dls).length === 0) {
        // All the DLists have been processed
        // Mark as done
        this.contactsTracker.push('dls');
        // Trigger postMessage in case we're last
        this.postContacts();
    }
};


/**
 * Handle GetTag response
 */
crunchmailZimlet.prototype.handleTags = function(params, result) {

    var response = result.getResponse();
    var tags = [];

    logger.debug('Get tags response');
    logger.debug(response);

    if (response.GetTagResponse.hasOwnProperty('tag')) {
        var tagsArr = response.GetTagResponse.tag;

        for (var t = 0; t < tagsArr.length; t++) {
            var tagObj = {
                'name': tagsArr[t].name,
                'color': ''
            };

            // Check if have rgb color or zimbra color
            if (tagsArr[t].hasOwnProperty('color')) {
                tagObj.color = tagsArr[t].color;
            } else if (tagsArr[t].hasOwnProperty('rgb')) {
                tagObj.color = tagsArr[t].rgb;
            }

            this.zimbraContacts.tags.push(tagObj);
        }
    }
    // Mark as done
    this.contactsTracker.push('tags');
    // Trigger postMessage in case we're last
    this.postContacts();
};
