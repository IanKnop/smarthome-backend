/* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
   KNOP.FAMILY Consulting
   Smart Home NexGen Backend
   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ 
   Module: Automation
   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
   
class moduleAutomation {

    static id               = 'automation';
    static name             = 'Automation';
    static type             = 'Module';
    
    static app              = null;
    static parent           = null;
    static scopes           = [ 'virtual', 'motion', 'switch', 'sensor' ];
    static testMode         = false;
    static testSenders      = [ 'group/ian', 'switch/ian', 'motion/ian', 'motion/hallway_2', 'group/hallway_2' ];
    static killMode         = false;

    static automations      = null;
    static active           = [ ];
    static timeouts         = [ ];
    static relations        = [ ];

    /* Init ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */    
    static init() {
        
        /* init ==================================================
           Initialize module                                     */

        // INITIALIZE AUTOMATIONS
        this.getRelations();
        this.getActiveAutomations();
    }

    /* Handle ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    static handle(scope, sender, payload, exceptions = [ ], topic = null, requirementsIgnore = false) {
        
        /* handle ================================================
           Triggers action based on active automations           */

        if (payload != null && (!this.testMode || (this.testSenders != null && this.testSenders.includes(sender)))) {

            var groups = [ ];
            this.active.filter(automation => { return (sender == undefined || automation.sensor == sender); }).forEach(automation => {


                // SAVE GROUP (i.e. 'group/living') THAT IS INVOKED BY THIS AUTOMATION (EVEN IF AUTOMATION IS NOT EXECUTED) 
                if (!groups.includes(automation.group)) groups.push(automation.group);

                // GET CONDITIONAL OR MULTIPLE AUTOMATIONS
                var conditionAutomations = this.getConditionalAutomations(automation, payload);
                if (this.app.isVerbose(this.id)) this.print('Checking for automations triggered by "' + sender + '" (found: ' + conditionAutomations.length + ')');

                conditionAutomations.forEach(item => {

                    // IGNORE REQUIREMENTS FOR RE-TRIGGERING SAME AUTOMATION
                    var retriggerIgnore = false;    
                    if (this.isReTriggered(item)) {
                        retriggerIgnore = (scope != 'motion' || payload.occupancy == undefined || payload.occupancy == true);
                        if (this.app.isVerbose(this.id) && retriggerIgnore) this.print('Automation [ # ]: Skip requirements check for re-triggered automation: scope=' + scope + '; occupancy=' + payload.occupancy, item);
                    }

                    if ((retriggerIgnore || requirementsIgnore || item.requirements == undefined || this.app.Util.checkRequirements(item.requirements))) {
                        /* TRIGGER OTHER SENSOR */
                        if (item.trigger != undefined) {
                            this.handle(item.trigger.sensor.split('/')[0], item.trigger.sensor, payload, [ ...exceptions ], topic, item.trigger.requirementsIgnore ?? false);
                        }
                        else if (sender != 'virtual/time') {
                            // ANY SENSOR EXCEPT VIRTUAL TIME SENSOR (= SCHEDULED AUTOMATIONS)
                            if (this.app.isVerbose(this.id)) this.print('Automation [ # ]: Triggered by "' + sender + '" (ignore requirements: ' + requirementsIgnore.toString() + ') in group "' + item.group + (this.app.isVerbose(this.id) ? '" with payload:\n\n' + JSON.stringify(payload) + '\n' : '"') ?? 'unknown', automation);
                            this.handleAutomation(item);
                        }
                    }
                });
            });
            
            // KILL PREVIOUS
            if (this.killMode && scope == 'motion' && payload.occupancy != undefined && payload.occupancy) this.killPrevious(sender, groups, payload);
        }
    }

    static isReTriggered(automation) {

        /* isReTriggered ========================================
           Checks if this automation is currently running       */

        return this.app.Global.GroupState[automation.group] != undefined && 
               this.app.Global.GroupState[automation.group].automation != undefined &&
               this.app.Global.GroupState[automation.group].automation == automation.id &&
               this.app.Global.GroupState[automation.group].status != undefined &&
               (this.app.Global.GroupState[automation.group].status == 'RUN' ||
               this.app.Global.GroupState[automation.group].status == 'FADE')
    }

 /* Conditions ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    static getConditionalAutomations(automation, payload) {

        /* getConditionalAutomations =============================
           Returns automations meeting conditional requirements  */

        if (automation.conditions == undefined) return [ automation ];
        else {
            var conditionAutomations = this.getMatching(automation, this.getConditionKey(automation, payload));

            if (!Array.isArray(conditionAutomations) && conditionAutomations != null) conditionAutomations = [ conditionAutomations ];
            else if (conditionAutomations == null) conditionAutomations = [ ];
            
            conditionAutomations.forEach(condition => {
                if (condition.id == undefined)      condition.id      = automation.id;
                if (condition.sensor == undefined)  condition.sensor  = automation.sensor;
                if (condition.group == undefined)   condition.group   = automation.group;
            })

            return conditionAutomations;
        }
    }

    static getMatching(automation, search) {

        /* getMatching ===========================================
           Returns condition that is true                        */

        var result = Object.getOwnPropertyNames(automation.conditions).filter(condition => { 
            if (condition.indexOf('|') > -1) {

                // CONDITION WITH OPERATOR (i.e. ">=|20")
                if (this.app.isVerbose(this.id)) this.print('Automation [ # ]: Found operator in condition "' + condition + '" for search "' + search + '"', automation);
            
                var operator    = condition.split("|")[0];
                var compare     = condition.split("|")[1];

                var returnValue = false;

                if (!isNaN(search) && !isNaN(compare)) {
                    returnValue = eval('Number(search) ' + operator + ' Number(compare);');
                } else {
                    returnValue = eval('search ' + operator + ' compare;');
                }
                
            } else {
                
                // CONDITION WITHOUT OPERATOR (i.e. "on")
                returnValue = (search == condition); 
            }

            if (this.app.isVerbose(this.id)) this.print('Automation [ # ]: Condition "' + (search == '' ? '[empty]' : search) + ' ' + (operator != undefined ? operator : '==') + ' ' + (compare != undefined ? compare : condition) + '" checked with result: ' + returnValue, automation);
            return returnValue;

        });
        
        return result.length > 0 ? automation.conditions[result[0].toString()] : null;
    }

    static getConditionKey(automation, payload) {

        /* getConditionKey =======================================
           Returns condition key that can have multiple sources  */

        if (automation.conditionProvider == undefined) return null;
        const providers = automation.conditionProvider.split(';');

        var returnValue = [ ];
        providers.forEach(provider => { returnValue.push(payload[provider]); });

        return returnValue.join(';');
    }

    /* API ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */    
    static handleApi(req, res, scope, sender, func, url, exceptions = [ ], post) {

        /* handleApi =============================================
           Handle module specific API responses                 */

        const fs        = require('fs');

        var automations = JSON.parse(fs.readFileSync('data/automations.json', 'utf8'));
        var results     = null;
        switch (func) {
            // GET
            case 'automations': 
                const sensorId  = url.searchParams.get('sensorId') ?? null;
                results         = automations.filter(automation => { return (sensorId == null || (automation.sensor != undefined && automation.sensor == sensorId)); });
                break;

            // SET
            case 'setautomation':
                const targets   = JSON.parse(url.searchParams.get('target'));
                const values    = JSON.parse(url.searchParams.get('value'));

                var newAutomation   = { };
                for (var index = 0; index < targets.length; index++) newAutomation[targets[index]] = values[index];

                var index   = (newAutomation.id == undefined ? -1 : automations.findIndex(automation => { return automation.id == newAutomation.id; }));

                if (index == -1) {
                    newAutomation.id = this.getNextId(automations);
                    automations.push(newAutomation);
                }
                else automations[index] = newAutomation;

                // WRITE CHANGED AUTOMATIONS TO FILE AND REFRESH ACTIVE AUTOMATIONS
                fs.writeFileSync('data/automations.json', JSON.stringify(automations));
                this.refreshAutomations();
                
                // RETURN NEW AUTOMATION ID 
                results = newAutomation.id;
                break;

            // DELETE
            case 'deleteautomation':
                var index = automations.findIndex(automation => { return automation.id == url.searchParams.get('id'); });
                automations.splice(index, 1);

                fs.writeFileSync('data/automations.json', JSON.stringify(automations));
                this.refreshAutomations();
                results = true;
                break;
        }

        return results;
    }

    static getNextId(automations) {

        var last = 1;
        automations.forEach(automation => { if (automation.id > last) last = automation.id; });
        return last + 1;

    }
    
    /* Virtual Time Adapter ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    static setTimecodeAutomation(automation, timecode) {

        /* setTimecodeAutomation =================================
           Sets timecode based on timecode-coding                */

        const suncalc   = require('suncalc');
        const latitude  = 49.8728; const longitude = 8.6512;
        const times     = suncalc.getTimes(new Date(), latitude, longitude);
        const set       = new Date();

        const action    = automation.conditions[timecode];

        set.setHours(Number(timecode.substr(2, 2)), Number(timecode.substr(4, 2)), Number(timecode.substr(6, 2)), 0);

        if (timecode.startsWith('AA'))      var targetTime   = set;
        else if (timecode.startsWith('XS')) var targetTime   = this.timeDiff(times.sunset, timecode, -1);
        else if (timecode.startsWith('YS')) var targetTime   = this.timeDiff(times.sunset, timecode, 1);
        else if (timecode.startsWith('XR')) var targetTime   = this.timeDiff(times.sunrise, timecode, -1);
        else if (timecode.startsWith('YR')) var targetTime   = this.timeDiff(times.sunrise, timecode, 1);
        
        // IF IN PAST ADD 24 HOURS FOR FOLLOWING DAY
        if (targetTime.getTime() < (new Date()).getTime()) targetTime = new Date(targetTime.getTime() + 24 * 60 * 60 * 1000);

        this.print('Schedule automation for ' + targetTime.toLocaleDateString('de-DE', { day: "2-digit", month: "2-digit", year: "numeric" }) + ' at ' + targetTime.toLocaleTimeString('de-DE') + ' ("' + automation.description + '")');
        
        return {
            id:             automation.id,
            description:    automation.description,
            timecode:       timecode,
            automation:     automation.conditions[timecode],
            time:           targetTime.toLocaleTimeString(),               
            timeout:        this.setTimeoutAt(() => { this.handleAutomation(action) }, targetTime)
        };
    }

    static timeDiff(time, timecode, direction = 1) {

        /* timeDiff ==============================================
           Gets time difference to timecode                      */

        return new Date(time.getTime() + (direction * ((timecode.substr(2, 2) * 60 * 60 * 1000) + (timecode.substr(4, 2) * 60 * 1000) + (timecode.substr(6, 2) * 1000))));
    }

    static initVirtualTime() {

        /* initVirtualTime =======================================
           Finds relevant timecodes in active automations        */

        var count = 0;
        this.clearTimeouts();
        this.active.filter(automation => { return automation.sensor == 'virtual/time'; })
            .forEach(automation => {
                if (automation.conditions != undefined) 
                    Object.getOwnPropertyNames(automation.conditions)
                        .forEach(timecode => {
                            var timeout = this.setTimecodeAutomation(automation, timecode)
                            if (timeout != null) {
                                count++;
                                this.timeouts.push(timeout);
                            }
                        });
            });

        if (this.app.isVerbose(this.id)) this.print('Initialized ' + count + ' virtual/time automations');
        
    }

    static clearTimeouts() {

        /* clearTimeouts =========================================
           Clears all current virtual/time timeouts              */

        this.timeouts.forEach(timeout => { clearTimeout(timeout.timeout); });
    }

    static setTimeoutAt(callback, targetTime) {

        /* setTimeoutAt ==========================================
           Sets timeout to specified target time                 */

        const now   = Date.now();
        const diff  = targetTime - now;

        if (diff <= 0) return null;
        else return setTimeout(callback, diff);
    }

    static handleAutomation(automation) {

        /* handleAutomation ======================================
           Invoke Item based on its information                  */

        if (!Array.isArray(automation)) automation = [ automation ];

        automation.forEach(item => {
            if (item.scene != undefined)        return this.setScene(item);
            else if (item.set != undefined)     return this.set(item);
            else if (item.http != undefined)    {
                this.print('Execute http request for automation #' + item.id + ' in group ' + item.group);
                return this.parent.handle('http', 'http', item.http);
            }
        });
    }

    static getRelations(cancel = false, refreshRate = (60 * 60 * 1000)) {

        /* getRelations ==========================================
           Gets relations between motion sensors and rooms       */

        const fs            = require('fs');
        const data          = fs.readFileSync('data/automationRelations.json', 'utf8');

        this.relations      = JSON.parse(data);

        if (!cancel) setTimeout(() => { this.getRelations(false, refreshRate); }, refreshRate);
    }


    static getActiveAutomations(cancel = false, refreshRate = (5 * 60 * 1000)) {

        /* getActiveAutomations ==================================
           Gets currently active automations                     */

        this.refreshAutomations();

        if (this.app.isVerbose(this.id)) this.print('Refresh active automations and virtual/time timeouts. ' + this.active.length + ' automations are active.');
        if (!cancel) setTimeout(() => { this.getActiveAutomations(false, refreshRate); }, refreshRate);
    }

    static refreshAutomations() {

        /* refreshAutomations ====================================
           Refreshes automations                                 */

        const fs            = require('fs');
        const data          = fs.readFileSync('data/automations.json', 'utf8');
        const automations   = this.app.Util.parseExp(data);

        // SAVED PARSED AUTOMATIONS TO FILE FOR DEBUGGING
        if (this.app.isVerbose(this.id)) this.print('Write parsed automations to data/automations_parsed.json for debugging');
        fs.writeFileSync('data/automations.parsed.json', automations);

        this.automations    = JSON.parse(automations);
        this.active         = this.automations.filter(automation => { return this.filterAutomations(automation); });
        this.initVirtualTime();
  
    }

    static filterAutomations(automation) {

        /* filterAutomations =====================================
           Filters animations that are active                    */

        var today = new Date();
        return (automation.enabled == undefined || automation.enabled == true || automation.enabled == '1') &&
               (automation.weekdays == undefined || automation.weekdays[today.getDay()] == true) &&
               (automation.startDate == undefined || new Date(automation.startDate) <= today) &&
               (automation.endDate == undefined || new Date(automation.endDate) >= today) && 
               ((automation.timeStart == undefined && automation.timeEnd == undefined) || this.inTime(automation.timeStart, automation.timeEnd, today));
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
    static set(automation) {

        /* set ===================================================
           Send set command to MQTT                              */

        // SET
        var setAutomation   = this.checkSetToggle(JSON.parse(JSON.stringify(automation)));
        var sessionId       = Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(8, '0');

        if (setAutomation.set.scene_recall != undefined && setAutomation.set.state == undefined) setAutomation.set.state = 'on';
        
        if (this.app.isVerbose(this.id)) this.print('Automation [ # ] executed in group ' + automation.group + ' with payload:\n\n' + JSON.stringify(setAutomation) + '\n', setAutomation);
        this.send(setAutomation, setAutomation.set, sessionId, 'Automation [ # ]: Run automation (set)', 'PERMANENT')
    }

    static checkSetToggle(automation) {

        /* checkSetToggle ========================================
           Support toggle + scene mode not natively supported    */        
        
        if (automation.set.toggle != undefined && automation.set.scene_recall != undefined) {
            // SPECIAL TOGGLE-SCENE-MODE
            var current = this.parent.handle(automation.group.split('/')[0], automation.group);

            delete automation.set.toggle;
            if (current.scene_recall != undefined || (current.state != undefined && (current.state == true || (typeof current.state === 'string' && current.state.toLowerCase() == 'on')))) {
                automation.set.state = 'off';
                delete automation.set.scene_recall;
            }
        }

        return automation;
    }

    static setScene(automation, fadingOnly = false) {

        /* setScene ==============================================
           Sets scene with fading and auto-switch-off            */

        var sessionId = Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(8, '0');

        // SCENE RECALL
        this.send(automation, { scene_recall: Number(automation.scene) }, sessionId, 'Automation [ # ]: Run ' + (automation.group.startsWith('K') ? 'kill ' : '') + 'automation in group ' + automation.group + ' (scene)', automation.duration != undefined ? 'RUN' : 'PERMANENT', fadingOnly);

        // FADING
        if (automation.fading != undefined) {
            setTimeout(() => {
                if (this.app.Global.GroupState[automation.group].session == sessionId) this.send(automation, { brightness_move: -1 * automation.fading }, sessionId, 'Automation [ # ]: Start fading in group ' + automation.group + '', 'FADE');
                else if (this.app.isVerbose(this.id)) this.print('Automation [ # ]: Interrupted fading in group ' + automation.group, automation, this.app.Global.GroupState[automation.group].session, sessionId);
            }, automation.duration * 1000);
        }

        // AUTO SWITCH OFF
        if (automation.duration != undefined) {
            setTimeout(() => {
                if (this.app.Global.GroupState[automation.group].session == sessionId) this.send(automation, { state: 'off' }, sessionId, 'Automation [ # ]: Switch-off automation in group ' + automation.group, 'STOP');
                else if (this.app.isVerbose(this.id)) this.print('Automation [ # ]: Interrupted switch-off in group ' + automation.group, automation, this.app.Global.GroupState[automation.group].session, sessionId);
            }, (automation.duration + (automation.fadingDuration ?? 0)) * 1000);
        }
    }

    /* Kill Previous ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    static killPrevious(sender, groups, payload) {

        /* killPrevious ==========================================
           Shuts off light caused by motion automations in
           rooms that are close                                  */

        groups.forEach(group => {
            if (this.relations[group] != undefined) {
                this.relations[group].forEach(relation => {
                    var status = this.app.Global.GroupState[relation.group] != undefined ? this.app.Global.GroupState[relation.group].status : null;
                    if (status == 'RUN' || (this.app.getConfig('kill_permanent') && status == 'PERMANENT')) {
                        if (this.app.isVerbose(this.id)) this.print('Automation [ # ]: Kill previous group ' + relation.group + ' due to activation of ' + sender, relation);
                        this.fadeOut(relation.group, 30);
                    }
                });
            }
        });
    }

    static fadeOut(group, duration = 0) {

        /* fadeOut ===============================================
           Fades out light in given group                        */
        
        var genericId   = 'K' + this.app.Util.randomId(3);
        this.setScene({ id: genericId, group: group, fading: this.app.getConfig('light_default_fading_value'), fadingDuration: this.app.getConfig('light_default_fading_duration'), duration: duration }, true);

    }

    /* Helper Functions ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    static send(automation, payload, sessionId, message, status, registerOnly = false) {
        
        /* send ==================================================
           Send MQTT message to Zigbee2Mqtt server               */

        this.print(message, automation, sessionId);
        this.app.Global.GroupState[automation.group] = { automation: automation.id, session: sessionId, status: status };
        if (!registerOnly) this.app.Modules.send({ topic: 'zigbee/' + automation.group + '/set', payload: payload }, [ 'mqtt' ]);     
    }

    static print(msg, automation = null, sessionId = null, oldSessionId = null) {
        
        /* print =================================================
           Prints log entry for automation action                */
        
        this.app.Util.print(this, (automation != null ? msg.replace('#', String(automation.id).padStart(4, '0')) : msg) + (sessionId != null ? ' as session: ' + sessionId + (oldSessionId != null ? ' (formerly: ' + oldSessionId + ')' : '') : ''));
    }
    
}

module.exports = moduleAutomation;

