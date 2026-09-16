/* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
   KNOP.FAMILY Consulting
   Smart Home NexGen Backend
   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ 
   Module: Console
   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */

class moduleConsole {

   static id      = 'console';
   static name    = 'Console';
   static type    = 'Module';

   static app     = null;
   static parent  = null;
   static scopes  = [ 'smarthome' ];

   /* Init ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
   /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
   static init() {

      /* init ==================================================
         Initialize module                                     */

      this.app.blockOrigins.push('smarthome/server');

   }

   static async handle(scope, sender, payload = null, exceptions = [ ]) {

      /* handle ================================================
         Handle module requests                               */

      if (sender == 'smarthome/client') {
         try {
            this.command(sender, payload, function (response, thisModule) {
               // SEND RESPONSE
               thisModule.parent.handle('mqtt', 'smarthome/server', response, [ ]);
            });
         } catch (err) {
            this.app.Util.print(this, 'Error handling command line input:\n\n' + err.message + '\n');
         }
      }
   }

   static command(sender, prompt, callback) {

      /* command ==============================================
       Process prompts                                      */

      var output = '';
      prompt = String(prompt);

      var params = prompt.trim().split(' ', 3);
      switch (params[0].toLowerCase()) {
         case 'set':
            if (params[1].includes('.')) this.app.setStatus(params[1].split('.')[0].split('/')[0], params[1].split('.')[0], isNaN(params[2]) ? params[2] : Number(params[2]));
            else {
               if (params[2].toLowerCase() == 'on' || params[2].toLowerCase() == 'off') params[2] = '{ "state": "' + params[2] + '" }';
               this.app.setStatus(params[1].split('/')[0], params[1], JSON.parse(params[2]), [ ], 'zigbee/', '/set');
            }
            output = 'Status for ' + params[1] + ' was set to: ' + params[2];
            break;
         case 'ls':
            output = this.lsCommand(params);
            break;
         case 'show':
            output = this.showCommand(params, prompt);
            break;
         case 'count':
            output = this.app.Util.print(this, this.countCommand(params));
            break;
         case 'hello':
         case 'hi':
            output = this.app.Util.print(this, 'Hello!');
            break;
         case 'cache':
            if (params[1] == undefined || params[1] == 'save') this.app.saveCache();
            else if (params[1] != undefined && params[1] == 'lost') this.app.loadCache();
            else if (params[1] != undefined && (params[1] == 'delete' || params[1] == 'erase')) this.app.deleteCache();
            break;
         case 'restart':
         case 'reboot':
         case 'reload':
         case 'reset':
            output = this.exitCommand(params);
            setTimeout(() => { process.exit(1); }, 1000);
            break;
         case 'test':
            output = this.testCommand(params);
            break;
         case 'tuya':
            if (params[1] != undefined && params[1].toLowerCase() == 'sync') this.app.Modules.instances['tuya'].syncFromCloud();
            break;
         case 'verbose':
         case 'v':
            output = this.verboseCommand(params);
            break;
         default:
            output = this.app.Util.print(this, 'Unknown command');
      }

      var params = prompt.trim().split(' ');
      if (params.indexOf('>') > -1) {
         const fs = require('fs');
         try {
            fs.writeFileSync('debug/' + params[params.indexOf('>') + 1], output);
            output = 'Response saved to file: ' + params[params.indexOf('>') + 1];
         } catch (e) {
            output = 'Error writing output to file';
         }
      }
      
      callback(output, this);
   }

   static testCommand(params) {

      /* testCommand ==========================================
         Runs test commands                                   */  

      var returnValue = 'Run Test: failed';

      if (params[1] != undefined) {
         switch (params[1].toLowerCase()) {
            case 'doorbell':
            case 'reolink':
               returnValue = this.app.Modules.instances.reolink.module.testDoorbellAlarm();
               break;
         }
      }

      return this.app.Util.print(this, returnValue);
   }

   static verboseCommand(params) {
         
      /* verboseCommand ========================================
         Adds or removes modules from verbose modules list    */  

      var returnValue = '';

      if (params[1] != undefined && (params[1].toLowerCase() == 'add' || params[1].toLowerCase() == '+')) {
         if (params[2] == undefined) {
            // INCOMPLETE ADD COMMAND
            returnValue = 'Please define module to add to verbose modules';
         }
         else if (params[2] == 'all' || params[2] == '*') {
            // ADD ALL MODULES TO VERBOSE MODULES
            this.app.verboseModules = Object.getOwnPropertyNames(this.app.Modules.instances);
            returnValue = 'Added all modules to verbose modules';
         }
         else {
            if (!this.app.verboseModules.includes(params[2])) this.app.verboseModules.push(params[2]);
            returnValue = 'Added module ' + params[2] + ' to verbose modules';
         }
      }
      else if (params[1] != undefined && (params[1].toLowerCase() == 'remove' || params[1].toLowerCase() == 'rm' || params[1].toLowerCase() == '-')) {
         if (params[2] == undefined) {
            // INCOMPLETE REMOVE COMMAND
            returnValue = 'Please define module to remove from verbose modules';
         }
         else if (params[2] == 'all' || params[2] == '*') {
            // REMOVE ALL MODULES FROM VERBOSE MODULES
            this.app.verboseModules = [ ];
            returnValue = 'Removed all modules from verbose modules';
         }
         else {
            if (this.app.verboseModules.includes(params[2])) {
               this.app.verboseModules.splice(this.app.verboseModules.indexOf(params[2]), 1);
               returnValue = 'Removed module ' + params[2] + ' from verbose modules';
            }
         }
      }
      else if (params[1] == undefined) {
         returnValue = 'Verbose modules: ' + JSON.stringify(this.app.verboseModules);
      }

      return this.app.Util.print(this, returnValue);

   }

   static exitCommand(params) {

      /* exitCommand ==========================================
         Exits the application                                */

      // CACHING
      if (params[1] == undefined || params[1] != 'nocache') this.app.saveCache();

      // EXIT
      return '\n' + '\x1b[91m' + '- ' + (new Date()).toLocaleTimeString('de-DE') + ' | ' + this.app.Util.restartLabel + '\n';
   }

   static showCommand(params, prompt) {

      /* showCommand ==========================================
         Show internal data elements                          */

      const suncalc  = require('suncalc');
      const times    = suncalc.getTimes(new Date(), 49.8728, 8.6512);

      var output     = '';
      if (params.length == 1) output = this.helpShowCommand();
      else switch (params[1].toLowerCase()) {
         case 'global': 
         case 'globals':   output = this.printData(this.app.Global); break;
         case 'status':    output = (params[2] != undefined ? this.printData(this.app.Global.Status[params[2]]) : this.printData(this.app.Global.Status)); break;
         case 'module': 
         case 'modules':   output = (params[2] != undefined ? this.printData(this.app.Modules.instances[params[2]]) : this.printData(this.app.Modules.instances)); break;
         case 'battery':   
            var battery = [ ];
            Object.getOwnPropertyNames(this.app.Global.Status).forEach(deviceId => {
               if (this.app.Global.Status[deviceId].battery != undefined)
                  battery.push({ device: deviceId, battery: this.app.Global.Status[deviceId].battery });
            });
            battery = battery.sort((a, b) => Number(a.battery) - Number(b.battery));
            if (params[2] != undefined && params[2] == 'low') battery = battery.filter(battery => { return battery.battery <= 20; });

            output = this.app.Util.printAsTable(battery, [ 'device', 'battery' ], [ 25, 10 ]);
            break;
         case 'events': 
            if (params[2] != undefined) switch (params[2]) {
                  case 'motion':    
                     output = (params[3] != undefined ? this.printData(this.app.Global.Motion[params[3]]) : this.printData(this.app.Global.Motion)); break;
                  case 'climate':   
                     output = (params[3] != undefined ? this.printData(this.app.Global.Climate[params[3]]) : this.printData(this.app.Global.Climate)); break;  
            } else output = 'Please define event type: [ motion ], [ climate ]\n';
            break;
         case 'log':
            output = this.showLog(prompt);
            break;
         case 'time': 
         case 'times': 
            output = '\n Current Time:\t' + (new Date(Date.now()).toLocaleTimeString('DE-de')) + '\n' +
                     ' Sunrise Time:\t' + times.sunrise.toLocaleTimeString('DE-de') + '\n' + 
                     ' Sunset Time:\t' + times.sunset.toLocaleTimeString('DE-de') + '\n';
            break;
         case 'heating':
         case 'heatings':
            if (params[2] != undefined && params[2].toLowerCase() == 'active') output = this.printData(this.app.Modules.instances['heating'].module.active);
            else output = this.printData(this.app.Modules.instances['heating'].module.profiles);
            break;
         case 'automation':
         case 'automations':
            if (params[2] != undefined) {
               switch (params[2].toLowerCase()) {
                  case 'groups':    output = this.printData(this.app.Global.GroupState); break;
                  case 'timeouts':  /* see schedule */
                  case 'schedule':  output = this.printData(this.app.Modules.instances['automation'].module.timeouts, 4, (key, value) => { if (key === 'timeout') return undefined; return value; }); break;
                  case 'active':    output = this.printData(this.app.Modules.instances['automation'].module.active); break;
                  default:          this.printData(this.app.Modules.instances['automation'].module.automations.filter(automation => { return automation.id == params[2] || automation.description == params[2] || automation.sensor == params[2]; })); break;
               }
            } else output = this.printData(this.app.Modules.instances['automation'].module.automations);
            break;
         case 'tuya':      
            output = this.printData(this.app.Modules.instances['tuya'].module.devices); 
            break;
         case 'timeout': 
         case 'timeouts':  output = this.printData(this.app.Timeouts, 4, (key, value) => { if (key === 'timeout') return undefined; return value; }); break;  
         case 'schedule':  output = this.showCommand([ 'show', 'automation', 'schedule' ]); break;
         case 'flights':   output = this.printData(this.app.Modules.instances['flight'].module.flightsRecent); break;
         default:
            if (params[1].includes('/')) output = this.showCommand([ 'show', 'status', params[1] ]);
            else output = '[ unknown expression for "show" ]\n';
      }

      return output;
   }

   static showLog(prompt) {

      /* showLog ==============================================
         Shows log in console                                 */

      var output = '';
      var params = prompt.trim().split(' ');

      if (params[2] != undefined) {
         var limit   = params[3] != undefined && !isNaN(params[3]) ? params[3] : (params[4] != undefined && !isNaN(params[4]) ? params[4] : 10);
         var sensor  = params[3] != undefined && isNaN(params[3]) ? params[3] : (params[4] != undefined && isNaN(params[4]) ? params[4] : null);
         if (sensor != null && !sensor.includes('/')) sensor = params[2] + '/' + sensor;

         output = '\nReturn up to recent ' + limit + ' ' + params[2] + ' log entries' + (sensor != null ? ' for sensor ' + sensor : '') + ':';
         this.parent.module('log').printLog(params[2], limit, sensor);
      } else output = 'Please define log type: [ motion ], [ climate ], [ power ], [ lateflight ]\n';

      return output;
   }

   static helpShowCommand() {

      return '\n' + 
             ' Use "show {type} {options}" to show...\n\n' +
             ' - global\t\tall global cached data\n' + 
             ' - status\t\tstatus of all devices { device } (also "show { device }")\n' + 
             ' - module\t\tenabled modules { name }\n' + 
             ' - time\t\t\tsunrise, sunset and server time\n' + 
             ' - heating\t\theating profiles { active }\n' + 
             ' - automation\t\tShows current automations { active | schedule | groups }\n' +
             ' - log\t\t\tShows sensor log { motion | climate | power }\n' + 
             ' - timeout\t\tShows currently running timeouts\n';

   }

   static lsCommand(params) {

      /* lsCommand ============================================
         Show internal data as list                           */

      if (params.length > 1) {
         var list = Object.getOwnPropertyNames(this.app.Global.Status).filter(id => { return id.startsWith(params[1].toLowerCase() + '/'); });
         if (list.length > 0) return this.printList(list);   
         else return '\n No elements found\n';
      } else return '\n Please define type for list: [ group ], [ light ], [ motion ], [ climate ], [ valve ], [ plug ],...\n';

   }

   static countCommand(params) {

      /* countCommand ==========================================
         Show count of internal elements                       */

      var output = '';

      switch (params[1].toLowerCase()) {
         case 'groups': output = 'Groups count: ' + Object.getOwnPropertyNames(this.app.Global.Groups).length; break;
         case 'status': output = 'Status count: ' + Object.getOwnPropertyNames(this.app.Global.Status).length; break;
         case 'modules': output = 'Modules count: ' + Object.getOwnPropertyNames(this.app.Modules.instances).length; break;
         case 'tuya': output = 'Tuya device count: ' + this.app.Modules.instances['tuya'].module.devices.length; break;
         case 'heating':
            if (params[2] != undefined && params[2].toLowerCase() == 'active') {
               output = 'Active Heating profiles count: ' + this.app.Modules.instances['heating'].module.active.length; break;
            } else {
               output = 'Heating profiles count: ' + this.app.Modules.instances['heating'].module.profiles.length; break;
            }
            break;
          case 'automation': case 'automations':
            if (params[2] != undefined && params[2].toLowerCase() == 'active') {
               // SHOW ACTIVE AUTOMATIONS
               output = 'Active Automations count: \n' + this.app.Modules.instances['automation'].module.active.length;
            } else {
               output = 'Automations count:\n' + this.app.Modules.instances['automation'].module.automations.length;
            }
            break;
      }

      return output;
   }

   static printData(data, format = 4, func = null) {

      /* printData ============================================
         Prints out data as console message                   */

      return '\n' + JSON.stringify(data, func, format) + '\n';

   }

   static printList(data) {

      /* printList ============================================
         Prints out data as list                              */ 

      var returnValue = '\n';
      data.forEach(element => {
         returnValue += ' ' + element + '\n';
      });
      
      return returnValue;
   }
}

module.exports = moduleConsole;