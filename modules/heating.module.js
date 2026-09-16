/* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
   KNOP.FAMILY Consulting
   Smart Home NexGen Backend
   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ 
   Module: Heating
   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
   
class moduleHeating {

    static id           = 'heating';
    static name         = 'Heating';
    static type         = 'Module';
    
    static app          = null;
    static parent       = null;
    static scopes       = [ 'heating', 'climate', 'window' ];
    
    static devices      = null;
    static profiles     = null;
    static active       = [ ];
    
    static testMode     = false;
    static testGroups   = [ 'group/ian', 'group/living' ];

    /* Init ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */    
    static init() {
        
        /* init ==================================================
           Initialize module                                     */
        
        // INITIALIZE HEATING PROFILES
        this.getActiveHeatingProfiles();
    }

    /* Handle ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    static handle(scope, sender, payload, exceptions = [ ]) {
        
        /* handle ================================================
           Triggers action based on active heating profiles      */

        if (payload == null) {

            // GET
            if (scope == 'heating') {
                var deviceId    = sender.split('.')[0];
                var property    = sender.split('.', 2)[1];

                var device      = this.devices.filter(device => { return device.id == sender; });
                if (device.length > 0) {
                    if (property == undefined || property == null) device[0];
                    else return device[0][property];
                } else return null;
            } else return null;

        } else if (scope == 'climate' && payload.temperature != undefined) {

            // ACTIVATE / DEACTIVATE HEATING
            const master    = Boolean(this.app.getConfig('heating/master'));
            const force     = Boolean(this.app.getConfig('heating/force'));
            const devices   = this.devices.filter(device => { return device.sensor == sender; });
            devices.forEach(device => {
                this.active.filter(profile => { return profile.group == device.group; }).forEach(profile => {
                    if (!this.testMode || this.testGroups.includes(profile.group)) {
                        if (this.checkProfile(profile, payload))  {
                            // SWITCH ON
                            if (master) this.set(device, true);
                            this.print('Profile [ # ] | Switch On heating in ' + profile.group, profile);
                        } else if (payload.temperature > profile.targetTem && !force) {
                            // SWITCH OFF
                            this.print('Profile [ # ] | Switch Off heating in ' + profile.group, profile);
                            this.set(device, false);
                        }
                    }
                });
            });

        } else if (scope == 'window' && payload.contact != undefined) {

            // WINDOW TRIGGER
            const master    = Boolean(this.app.getConfig('heating/master'));
            const force     = Boolean(this.app.getConfig('heating/force'));
            const devices   = this.devices.filter(device => { return device.windows.includes(sender); });
            devices.forEach(device => {
                this.active.filter(profile => { return profile.group == device.group; }).forEach(profile => {
                    if (!this.testMode || this.testGroups.includes(profile.group)) {
                        if (profile.windowstop != undefined && profile.windowstop == true) {
                            if (payload.contact) {
                                // MIGHT SWITCH ON
                                if (this.app.isVerbose(this.id)) this.print('Windows has been Closed in group ' + profile.group, profile);

                                const status = this.app.getStatus(device.sensor);
                                if (status != null) this.handle('climate', device.sensor, status);
                            } else {
                                // SWITCH OFF DUE TO OPEN WINDOW
                                if (this.app.isVerbose(this.id)) this.print('Windows has been Opened in group ' + profile.group, profile);
                                if (!force) {
                                    this.set(device, false);
                                    this.print('Profile [ # ] | Switch Off heating in ' + profile.group, profile);
                                }
                            }
                        }
                    }
                });
            });     
        }
    }

    static checkProfile(profile, payload) {

        /* checkProfile =========================================
           Checks if heating should be switched on              */

        return payload.temperature < (profile.targetTemp - profile.tolerance) && 
               ( profile.windowstop == undefined || Boolean(profile.windowstop) == false || this.getWindowsClosed(profile.group.split('/')[1]) );
    }

    static getWindowsClosed(group) {

        /* getWindowClosed ======================================
           Checks if windows in group are all closed            */

        return this.app.getStatus('window/' + group.split('/')[1]) == undefined || 
               this.app.getStatus('window/' + group.split('/')[1]).contact == undefined ||
               this.app.getStatus('window/' + group.split('/')[1]).contact == true;
    }

    /* API ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */    
    static handleApi(req, res, scope, sender, func, url, exceptions = [ ], post)  {

        /* handleApi =============================================
           Handle module specific API responses                 */
        const fs        = require('fs');
        var results     = null;
  
        switch (func) {
            // GET
            case 'getbulk': 
            case 'getstate': 
                var deviceIds = (func == 'getbulk' ? url.searchParams.get('bindings') : [ (url.searchParams.get('deviceId') ?? url.searchParams.get('groupId')) + (func == 'getstate' ? '.state' : '') ]);
                JSON.parse(deviceIds).forEach(deviceId => {
                    if (deviceId.startsWith('heating/profile/')) {
                        var groupId = deviceId.split('/')[2] + '/' + deviceId.split('/')[3];
                        if (results == null) results = [ ];
                        results.push({ id: deviceId, val: this.profiles.filter(profile => { return profile.group == groupId; }) });
                    } else if (deviceId.startsWith('heating/') && this.app.getConfig(deviceId) != null) {
                        if (results == null) results = [ ];
                        results.push({ id: deviceId, val: this.app.getConfig(deviceId) });
                    }
                });
                break;
            
            case 'profiles': 
                const groupId   = url.searchParams.get('id') ?? null;
                results         = this.profiles.filter(profile => { return profile.group == groupId; });
                break;

            case 'profile': 
                const profileId = url.searchParams.get('id') ?? null;
                results         = this.profiles.filter(profile => { return profile.id == profileId; })[0];
                break;

            case 'setprofile':
                var newProfile  = JSON.parse(url.searchParams.get('profile')) ?? null;
                var index       = (newProfile.id == undefined ? -1 : this.profiles.findIndex(profile => { return newProfile.id == profile.id; }));

                if (index == -1) {
                    newProfile.id = this.getNextId(this.profiles);
                    this.profiles.push(newProfile);
                }
                else this.profiles[index] = newProfile;

                fs.writeFileSync('data/heating.json', JSON.stringify(this.profiles));
                this.refreshProfiles();
                results = newProfile.id;
                break;

            // DELETE
            case 'deleteprofile':
                var index = this.profiles.findIndex(profile => { return profile.id == url.searchParams.get('id'); });
                this.profiles.splice(index, 1);

                fs.writeFileSync('data/heating.json', JSON.stringify(this.profiles));
                this.refreshProfiles();
                results = true;
                break;                

            case 'toggle':
                if (scope == 'heating') {
                    var value = !this.app.getConfig(sender);
                    this.app.setConfig(sender, value);

                    if (sender == 'heating/master' && value == false) this.setAll(false);
                    if (sender == 'heating/force') this.setAll(value, false);
                }
                break;
        }

        return results;
    }

    static getNextId(profiles) {

        var last = 1;
        profiles.forEach(profile => { if (profile.id > last) last = profile.id; });
        return last + 1;

    }    

    /* Helper Functions ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    static getActiveHeatingProfiles(cancel = false, refreshRate = (5 * 60 * 1000)) {

        /* getActiveHeatingProfiles ==============================
           Gets currently active heating profiles                */

        this.refreshProfiles();

        if (this.app.isVerbose(this.id)) this.print('Refresh active heating profiles (' + this.active.length + ' profiles)');
        if (!cancel) setTimeout(() => { this.getActiveHeatingProfiles(false, refreshRate); }, refreshRate);
    }

    static refreshProfiles() {

        /* refreshProfiles =======================================
           Refreshes heating profiles                            */

        const fs            = require('fs');

        this.devices        = JSON.parse(fs.readFileSync('data/heatingDevices.json', 'utf8'));
        this.profiles       = JSON.parse(fs.readFileSync('data/heating.json', 'utf8'));
        this.active         = this.profiles.filter(profile => { return this.filterProfiles(profile); });
  
    }    

    static filterProfiles(profile) {

        /* filterProfiles ========================================
           Filters heating profiles that are active              */

        var today = new Date();
        return (profile.enabled == undefined || profile.enabled) &&
               (profile.weekdays == undefined || profile.weekdays[today.getDay()] == true) &&
               (profile.startDate == undefined || new Date(profile.startDate) <= today) &&
               (profile.endDate == undefined || new Date(profile.endDate) >= today) && 
               ((profile.timeStart == undefined && profile.timeEnd == undefined) || this.inTime(profile.timeStart, profile.timeEnd, today));
    }

    static inTime(from, to, now) {

        /* inTime ================================================
           Checks if time is in between from and to value        */

        return ((this.getTime(from) <= this.getTime(to)) && this.getTime(from) <= now && now <= this.getTime(to)) ||
               ((this.getTime(from) > this.getTime(to)) && (now >= this.getTime(from) || now <= this.getTime(to))); 
    }


    static getTime(timeString) {

        /* getTime ===============================================
           Returns time value from hh:mm:ss string               */

        const [hours, minutes, seconds] = timeString.split(':').map(Number);
        const time = new Date(); time.setHours(hours, minutes, seconds, 0);
        
        return time;
    }

    /* Actions ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    static set(deviceInfo, value) {

        /* set ===================================================
           Sets heating device                                   */

        // SET
        if (Boolean(deviceInfo.enabled) == true) {
            this.app.Modules.handle('http', deviceInfo.id, {
                url: 'http://' + deviceInfo.deviceIp + '/relay/0?turn=' + (value ? 'on' : 'off'),
            });
        }
    }

    static setAll(value, ignoreTestMode = false) {

        /* setAll ================================================
           Sets all devices to specific state                    */

        this.devices.forEach(deviceInfo => {
            if (ignoreTestMode || !this.testMode || this.testGroups.includes(deviceInfo.group))
                this.set(deviceInfo, value);
        });
    }

    static print(msg, profile = null) {
        
        /* print =================================================
           Prints log entry for heating action                */
        
        this.app.Util.print(this, (profile != null ? msg.replace('#', String(profile.id).padStart(4, '0')) : msg));
    }
}

module.exports = moduleHeating;

