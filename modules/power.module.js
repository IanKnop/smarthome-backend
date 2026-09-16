/* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
   KNOP.FAMILY Consulting
   Smart Home NexGen Backend
   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ 
   Module: Power Measuring
   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
   
class modulePower {

    static id           = 'power';
    static name         = 'Power';
    static type         = 'Module';
    
    static app          = null;
    static parent       = null;
    static scopes       = [ 'smarthome'];

    static logReduce    = 15;   /* only save every X message */
    static logCount     = { home: 0, heating: 0 };
    
    static devices      = {
        home:       'smarthome/power/sensor/1/obis/1-0:1.8.0/255/value',
        heating:    'smarthome/power/sensor/2/obis/1-0:1.8.0/255/value',
    };

    /* Init ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */    
    static init() {
        
        /* init ==================================================
           Initialize module                                     */

    }

    /* Handle ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    static handle(scope, sender, payload = null, exceptions = [ ], topic) {
        
        /* handle ================================================
           Triggers action based on active heating profiles      */
        
        if (payload != null) {
            Object.getOwnPropertyNames(this.devices).forEach(device => {
                if (topic.startsWith(this.devices[device])) {
                    this.logCount[device]++;
                    if (this.logCount[device] == this.logReduce) {
                        this.logCount[device] = 0;
                        this.app.log('powerlog', {
                            sensor:         'power/' + device,
                            value:          Number(Number(payload) / 1000).toFixed(4)
                        });

                        // SAVE AS DEVICE STATUS
                        this.app.setStatus('power', 'power/' + device,  Number(Number(payload) / 1000).toFixed(4), [ this.id, ...exceptions ]);
                    }
                }
            });
        } else {
            return this.app.getStatus(sender);
        }
    }

    /* API ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */    
    static handleApi(req, res, scope, sender, func, url, exceptions = [ ], post)  {

        /* handleApi =============================================
           Handle module specific API responses                 */

        var results = null;
        switch (func) {
            // GET
            case 'getbulk': 
            case 'getstate': 
                var deviceIds = (func == 'getbulk' ? url.searchParams.get('bindings') : [ (url.searchParams.get('deviceId') ?? url.searchParams.get('groupId')) + (func == 'getstate' ? '.state' : '') ]);
                JSON.parse(deviceIds).forEach(deviceId => {
                    if (deviceId.startsWith(this.id + '/'))  {
                        if (results == null) results = [ ];
                        results.push({ id: deviceId, val: this.handle(this.id, deviceId, null) });
                    }
                });
                break;
        }

        return results;
    }

    /* Helper Functions ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    
    
    /* Actions ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    
}

module.exports = modulePower;

