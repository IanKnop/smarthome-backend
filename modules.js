/* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
   KNOP.FAMILY Consulting
   Smart Home NexGen Backend
   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ 
   Modules
   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */

class Modules {

    static name             = 'Modules';
    static type             = 'Module';

    static app              = null;
    static scopes           = [ ];

    static enabledModules   = [ 
        'mqtt',             /* MQTT broker module */
        'console',          /* Console module */
        'log',              /* Logging module */
        'tuya',             /* Tuya module */
        'http',             /* HTTP module */
        'websocket',        /* Websocket module */
        'zigbee',           /* Zigbee module */
        'heating',          /* Heating module */
        'reolink',          /* Reolink module */
        'power',            /* Power log module */
        'config',           /* Generic configuration module */
        'automation',       /* Automation module */
        'flight'            /* Flight tracking (ADB-S) module */
                            ];
    static instances        = {  };

    static init(app) {

        /* init ==================================================
           Initialize module                                     */

        this.app = app;
        this.enabledModules.forEach(moduleId => {
            var mod = require('./modules/' + moduleId + '.module.js');
            this.initModule(mod, app, this);
        });
    }

    static initModule(mod, app, parent) {

        /* initModule ============================================
           Initialize module                                     */

        mod.app        = app;
        mod.parent     = parent;
        if (parent.instances[mod.id] == undefined) {
            parent.instances[mod.id] = {
                type:       mod.type.toLowerCase(),
                scopes:     mod.scopes,
                module:     mod
            };
        }
        
        // SCOPES
        this.scopes = [ ...new Set([ ...this.scopes, ...mod.scopes ])];

        // DEBUG MESSAGE
        this.app.Util.print(this, 'Load module ' + mod.name + (mod.scopes != null && mod.scopes.length > 0 ? ' (for ' + JSON.stringify(mod.scopes).replace('[', '').replace(']', '') + ')' : ''));
        
        // MODULE INDIVIDUAL INITIALIZATION
        mod.init();
    }

    static module(id) {

        /* module ================================================
           Returns module instance                               */

        return this.instances[id].module;

    }

    static handle(scope, sender, payload, exceptions = [ ], topic = null) {

        /* handle ================================================
           Handle module message                                 */

        var returnValue = [ ];
        Object.getOwnPropertyNames(this.instances).forEach(instance => {
            if (!exceptions.includes(instance) && (this.instances[instance].scopes.includes(scope) || instance.toLowerCase() == scope.toLowerCase())) {
                try {
                    var response = this.instances[instance].module.handle(scope, sender, payload, exceptions, topic);
                    if (response != null) returnValue.push(response);
                    if (this.app.isVerbose(this.id)) this.app.Util.print(this, 'Handle ' + sender + ' with Module ' + this.app.Util.capitalizeString(instance) + (response == null ? ' (no response)' : '')); 
                } catch (err) {
                    this.app.Util.print(this, 'Error handling Module ' + this.app.Util.capitalizeString(instance) + ': ' + err.message + '\n\n' + err.stack + '\n'); 
                }
            }
        });

        return returnValue.length == 1 ? returnValue[0] : returnValue;
    }
    //static handleApi(scope, req, res, results = [ ], exceptions = [ ]) {
    static handleApi(req, res, scope, sender, func, url, exceptions = [ ], post) {

        /* handleApi =============================================
           Handle module specific API responses                  */

        var results = null;        
        Object.getOwnPropertyNames(this.instances).forEach(instance => {
            if (!exceptions.includes(instance) && (scope == null || this.instances[instance].scopes.includes(scope) || instance.toLowerCase() == scope.toLowerCase())) {
                if (this.instances[instance].module.handleApi != undefined) {
                    try {
                        var moduleResults = this.instances[instance].module.handleApi(req, res, scope, sender, func, url, exceptions, post);
                        if (Array.isArray(results) && Array.isArray(moduleResults)) results = [ ...results, ...moduleResults ];
                        else if (results == null) results = moduleResults;
                    } catch (err) {
                        this.app.Util.print(this, 'Error handling API with Module ' + this.app.Util.capitalizeString(instance) + ': ' + err.message); 
                    }
                }
            }
        });

        return results;
    }

    static send(msg, modules = null) {

        /* send ==================================================
           Send message with module                              */

        if (modules == null) modules = this.enabledModules;
        modules.forEach(mod => {
            if (this.instances[mod] != undefined) this.instances[mod].module.send(msg);
        });
    }

    static refreshClients(sender) {

        /* refreshClients ========================================
           Refresh Websocket clients                             */

        this.handle('websocket', sender, true);
    }

}

module.exports = Modules;


