/* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
   KNOP.FAMILY Consulting
   Smart Home NexGen Backend
   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ 
   Module: Zigbee
   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */

class moduleZigbee {

    static id           = 'zigbee';
    static name         = 'Zigbee';
    static type         = 'Module';
    
    static app          = null;
    static parent       = null;
    static scopes       = [ 'devices', 'group', 'light', 'climate', 'motion', 'switch', 'plug', 'valve', 'window', 'sensor' ];
    static status       = { };

    /* Init ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    static init() {

        /* init ==================================================
           Initialize module                                     */

    }

    /* Handle ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    static handle(scope, sender, payload = null, exceptions = [ ]) {

        /* handle ================================================
           Handle Zigbee device information                      */

        if (payload == null) {
            
            // EMPTY PAYLOAD RETURNS CURRENT STATUS
            var deviceId    = sender.split('.')[0];
            var properties  = sender.split('.', 2)[1];
           
            try {
                if (properties == undefined && deviceId.startsWith('group')) return { state: eval('this.app.Global.Status[\'' + deviceId + '\'].state') };
                else if (deviceId.startsWith('devices')) {
                    // RETREIVE ALL DEVICES
                    var returnObject = [ ];
                    Object.getOwnPropertyNames(this.app.Global.Status).forEach(id => {
                        returnObject.push(id);
                    });
                    return returnObject;
                }
                else return this.app.getStatus(deviceId, properties); 
            } catch (err) { return null; }

        } else if (this.scopes.includes(scope)) {

            // RECEIVE DEVICE INFORMATION
            // GROUPS
            if (scope == 'group') {
                if (payload.state == undefined) payload.state = (payload.scene_recall != undefined ? 'on' : 'off');
                if (payload.scene_recall != undefined) payload.scene = payload.scene_recall;
            }

            // SENSOR LOG
            if ([ 'motion', 'climate' ].includes(scope)) {
                // SHORT TIME LOG
                this.logSensors(scope, sender, payload);

                // LONG TIME LOG
                if (scope == 'climate' && payload.temperature != undefined && payload.temperature != null)
                    this.app.log('climatelog', {
                        sensor:         sender,
                        temperature:    payload.temperature,
                        humidity:       payload.humidity,
                        pressure:       payload.pressure
                    });
                
                if (scope == 'motion' && payload.occupancy != undefined && payload.occupancy == true)
                    this.app.log('motionlog', {
                        sensor:         sender
                    });                
            }

            // SET STATUS
            if (payload != null && JSON.stringify(payload) != '{}') this.app.setStatus(scope, sender, payload, [ this.id, ...exceptions ]);
        }
    }

    static logSensors(scope, sender, payload, max = 50) {

        /* logSensors =============================================
           Logs sensor events to Global cache and long time log   */

        if ((scope == 'motion' && payload.occupancy != undefined && Boolean(payload.occupancy) == true) ||
            (scope == 'climate' && payload.temperature != undefined)) {
                var globalId    = this.app.Util.capitalizeString(scope);
                var timestamp   = Date.now();

                if (this.app.Global[globalId][sender] == undefined) this.app.Global[globalId][sender] = [ { ...payload, ...{ ts: timestamp, date: new Date(timestamp).toLocaleString() }} ];
                else this.app.Global[globalId][sender].unshift({ ...payload, ...{ ts: timestamp, date: new Date(timestamp).toLocaleString()  }});

                if (this.app.Global[globalId][sender].length > max) this.app.Global[globalId][sender] = this.app.Global[globalId][sender].slice(0, max);
            }
    }

    /* API ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */   
    static handleApi(req, res, scope, sender, func, url, exceptions = [ ], post) {

        /* handleApi =============================================
           Handle module specific API responses                  */

        var results = null;
        switch (func) {
            // GET
            case 'getbulk': 
            case 'getstate': 
                var deviceIds = (func == 'getbulk' ? url.searchParams.get('bindings') : [ (url.searchParams.get('deviceId') ?? url.searchParams.get('groupId')) + (func == 'getstate' ? '.state' : '') ]);
                if (results == null) results = [ ];
                this.getBulk(deviceIds, results);
                break;
            
            // SET
            case 'set':
                this.set(sender, url.searchParams.get('set'));
                break;
            case 'scene':
                this.set(sender, { scene_recall: Number(url.searchParams.get('sceneId')) });
                break;
            case 'toggle':
                var current = this.app.getStatus(sender, 'state');
                this.set(sender, { state : (current == undefined || current == null || current.toLowerCase().startsWith('off') ? 'on' : 'off') });
                break;                    
            
            // TIME DURATION
            case 'time':
                if (sender.startsWith('light/') || sender.startsWith('group/') || sender.startsWith('valve/') || sender.startsWith('plug/')) {
                    var duration = url.searchParams.get('duration');
                    if (duration != null && sender != null) {
                        if (this.app.Timeouts[sender] != undefined) {
                            // MANUALLY END TIMEOUT
                            clearTimeout(this.app.Timeouts[sender].timeout);
                            this.finishTimeout(sender);
                            this.print('Stopped timeout for device ' + sender + ' manually by user');
                        } else this.initTimeout(scope, sender, duration);
                    }
                }
                break;
        }

        return results;
    }

    static finishTimeout(sender) {

         delete this.app.Timeouts[sender];

         this.set(sender, { state: 'off' });
         this.parent.handle('websocket', sender + '/runtime', true);
    }

    static async initTimeout(scope, sender, duration) {

        /* initTimeout ===========================================
           Initializes new on/off timeout for device or group    */

        var timeout = setTimeout(() => { 
            this.print('Finished timeout for ' + sender);
            this.finishTimeout(sender);
        }, duration * 1000); 

        var now = Date.now();
        this.app.Timeouts[sender] = {
            scope:      scope,
            sender:     sender,
            duration:   duration * 1000,
            timestamp:  Date.now(),
            start:      (new Date(now).toLocaleTimeString('de-DE')),
            end:        (new Date(now + (duration * 1000)).toLocaleDateString('de-DE', { day: "2-digit", month: "2-digit", year: "numeric" })) + ' - ' + 
                        (new Date(now + (duration * 1000)).toLocaleTimeString('de-DE')),

            /* Attention: timeout is object */
            timeout:    timeout
        };

        this.set(sender, { state: 'on' });
        this.print('Initialized new timeout for ' + sender + ' to run until ' + this.app.Timeouts[sender].end);
        this.parent.handle('websocket', sender + '/runtime', true);
    
    }

    static getBulk(deviceIds, results) {

        /* getBulk ===============================================
           Gets one or many values                               */

        JSON.parse(deviceIds).forEach(deviceId => {
            if (deviceId.includes('/runtime')) {
                var runtimeId   = deviceId;
                deviceId        = deviceId.split('/runtime')[0];

                var runtimeValue    = this.getRuntimeValue(runtimeId, deviceId);
                if (runtimeValue > 0) this.print('Getting timeout data for ' + deviceId + ': ' + (new Date(runtimeValue)).toLocaleDateString('de-DE', { day: "2-digit", month: "2-digit", year: "numeric" }) + ' - ' + (new Date(runtimeValue)).toLocaleTimeString('de-DE'));

                results.push({ 
                    id:     runtimeId, 
                    val:    runtimeValue
                });
            } else if (deviceId.startsWith('devices/')) {
                var type    = deviceId.split('/')[1];
                var subtype = deviceId.split('/')[2];
                var val     = null;

                switch (type.toLowerCase()) {
                    case 'get':
                        val = Object.getOwnPropertyNames(this.app.Global.Status);
                        break;
                    case 'sensors':
                        if (subtype != undefined)
                            val = this.app.Global.Sensors.filter(sensor => { return sensor.id.startsWith(subtype); }).sort((a, b) => { return (a.description < b.description) ? -1 : 1 });
                        else 
                            val = this.app.Global.Sensors.sort((a, b) => { return (a.description < b.description) ? -1 : 1 });
                        break;
                }
                results.push({ id: deviceId, val: val });
            } else {
                results.push({ 
                    id:     deviceId, 
                    val:    this.parent.handle(deviceId.split('/')[0], deviceId, null) ?? this.defaultState
                });
            }
        });
    }

    static getRuntimeValue(sender, deviceId) {

        /* getRuntimeValue =======================================
           Returns current value for runtimes (i.e. valve)       */

        if (this.app.Timeouts[deviceId] == undefined) return 0;
        else return Math.round((this.app.Timeouts[deviceId].timestamp + this.app.Timeouts[deviceId].duration));
    }

    /* Actions ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    static set(group, set) {

        /* set ===================================================
           Send set command to MQTT                              */

        // SET
        var genericId   = 'A' + this.app.Util.randomId(3);
        var sessionId   = Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(8, '0');

        if (this.app.isVerbose(this.id)) this.app.Util.print(this, 'Set Zigbee device: ' + group + ' with set payload:\n\n' + JSON.stringify(set) + '\n');
        
        this.app.Global.GroupState[group] = { automation: genericId, session: sessionId, status: 'PERMANENT' };
        this.parent.send({ topic: 'zigbee/' + group + '/set', payload: set}, [ 'mqtt' ]);  
    }

    /* Helper Functions ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */

    static print(msg, message = null) {
        
        /* print =================================================
           Prints log entry for automation action                */
        
        this.app.Util.print(this, msg);
    }

}

module.exports = moduleZigbee;

