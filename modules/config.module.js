/* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
   KNOP.FAMILY Consulting
   Smart Home NexGen Backend
   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ 
   Module: Config
   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
   
class moduleConfig {

    static id               = 'config';
    static name             = 'Config';
    static type             = 'Module';
    
    static app              = null;
    static parent           = null;
    static scopes           = [ 'config' ];
    
    /* Init ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */    
    static init() {
        
        /* init ==================================================
           Initialize module                                     */

    }

    /* Handle ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    static handle(scope, sender, payload = null, exceptions = [ ], topic = null, requirementsIgnore = false) {
        
        /* handle ================================================
           Handle config requests                                */

        if (payload == null) {
            return this.app.getConfig(sender);
        } else {
            this.app.setConfig(sender, payload);
        }
    }

    /* API ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */    
    static handleApi(req, res, scope, sender, func, url, exceptions = [ ], post) {

        /* handleApi =============================================
           Handle module specific API responses                 */

        const fs        = require('fs');
        var results     = null;
        switch (func) {
            // GET
            case 'getbulk': 
            case 'getstate': 
                var configIds = (func == 'getbulk' ? url.searchParams.get('bindings') : [ (url.searchParams.get('deviceId') ?? url.searchParams.get('groupId')) + (func == 'getstate' ? '.state' : '') ]);
                JSON.parse(configIds).forEach(configId => {
                    if (configId.split('/')[0] == 'config') {
                        if (results == null) results = [ ];
                        results.push({ id: configId, val: this.handle(configId.split('/')[0], configId.split('/')[1], null) });
                    }
                });
                break;

            // SET
            case 'set':
                var configId = url.searchParams.get('id');
                if (configId.split('/')[0] == 'config') {
                    this.handle(configId.split('/')[0], configId.split('/')[1], url.searchParams.get('value'));
                    this.app.Util.print(this, 'Set config ' + configId + ' to ' + url.searchParams.get('value'));
                }                
                break;
                
            case 'toggle':
                var configId = url.searchParams.get('id');
                if (configId.split('/')[0] == 'config') {
                    var current = this.handle(scope, configId.split('/')[1]);
                    this.app.setConfig(configId.split('/')[1], (current == undefined || current == false));
                    this.app.Util.print(this, 'Toggle config ' + configId + ' to ' + (current == undefined || current == false));
                }                
                break;
        }

        return results;
    }

}

module.exports = moduleConfig;

