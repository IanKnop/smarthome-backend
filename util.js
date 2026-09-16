/* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
   KNOP.FAMILY Consulting
   Smart Home NexGen Backend
   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ 
   Utilities
   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */

class Util {
 
   static id            = 'util';
   static name          = 'Utilities';
   static type          = 'Common';
   static app           = null;

   static restartLabel  = 'Console    | Restarting, please wait...';

   static init(app) {

      /* init ==================================================
         Initialize module                                     */

      this.app = app;
   }

   static print(sender, message) {
            
      /* print ==================================================
         Print information to screen                            */
      
      var message = '\r- ' + (new Date(Date.now())).toLocaleTimeString('de-DE') + ' | ' + sender.name.substring(0, 10).padEnd(10) + ' | ' + message;
      this.printRaw(message);
   }

   static printRaw(message) {
            
      /* printRaw ===============================================
         Print information to screen                            */
      
      console.log('\x1b[92m$', message);
      if (this.app != null) this.app.Modules.handle('mqtt', 'smarthome/server', message, [ 'prompt' ]);
   }

   static printAsTable(payload, columns = [ ], widths = [ ]) {

      /* printAsTable ===========================================
         Prints object array as table                           */
      
      var returnValue   = '\n';
      for (var index = 0; index < columns.length; index++) {
         returnValue += this.capitalizeString(columns[index].padEnd(widths[index], ' ')) + (index < columns.length - 1 ? ' | ' : '');
      }

      returnValue += '\n' + ''.padEnd(returnValue.length, '–');
      
      payload.forEach(item => {
         returnValue += '\n';
         for (var index = 0; index < columns.length; index++) {
            if (isNaN(item[columns[index]])) {
               var value    = String(item[columns[index]]);
               returnValue += value.padEnd(widths[index], ' ') + (index < columns.length - 1 ? ' | ' : '');
            } else {
               var value    = String(item[columns[index]]);
               returnValue += value.padStart(widths[index], ' ') + (index < columns.length - 1 ? ' | ' : '');
            }
         }
      });

      this.printRaw(returnValue + '\n');
   }

   static debug(message) {
            
      /* debug ==================================================
         Print debug information to screen                      */

      //console.log('- DEBUG    | DEBUG      | ' + JSON.stringify(message));
      console.log('\x1b[92m$', '- DEBUG        | ' + JSON.stringify(message));
   }

   static checkRequirements(requirements, or = false, fallbackResult = false) {

      /* checkRequirements =====================================
         Checks requirements in different contexts             */
      
      var returnValue   = !or;
      var skipCheck     = false;

      requirements.forEach(requirement => {
        
         if (!skipCheck) {
            if (requirement.or != undefined) returnValue = this.checkRequirements(requirement.or, true);
            else {
               var status = this.app.Modules.handle((requirement.type == 'config' ? 'config' : requirement.source.split('/')[0]), requirement.source, null);
               status = (requirement.parameter != undefined ? status[requirement.parameter] : status);

               if (status == undefined) returnValue = fallbackResult;
               else returnValue = eval(this.getEvalString(requirement, status));

               if (this.app.isVerbose(this.id)) this.print(this, 'Requirement for ' + requirement.source + (requirement.parameter != undefined ? ', property: "' + requirement.parameter + '"' : '') + (status == undefined ? '' : ', current: "' + status + '"') + (returnValue ? ' checked' : ' failed'));
            }
         }
         skipCheck = (returnValue == or);
      });

      return returnValue;
   }

   static getEvalString(requirement, status) {

      /* getEvalString =========================================
         Returns evaluation string based on requirement        */

      if (requirement.condition == '=') var condition = '==';
      else var condition = requirement.condition;

      if (status == null || status == undefined) return requirement.value + ' ' + condition + ' undefined'; 
      else {
         var prefix = status != undefined && (isNaN(status) || isNaN(requirement.value)) ? '"' : '';
         var suffix = status != undefined && (isNaN(status) || isNaN(requirement.value)) ? '".toLowerCase()' : '';
         return prefix + status + suffix + ' ' + condition + ' ' + prefix + requirement.value + suffix;
      }
   }

   static shortString(str, length, ellipse = '...') {

      /* shortString ===========================================
         Shortens string to certain length                     */      

      return str.substring(0, Math.min(str.length, length)) + (str.length > length ? ellipse : '');
   }
   
   static capitalizeString(string) {
      
      /* capitalizeString ======================================
         Capitalizes first letter of a string                  */      

      return string ? string.charAt(0).toUpperCase() + string.slice(1) : string;
   }
   
   static parseExp(exp) {

      /* parseExp ==============================================
         Parses expressions in string                           */

      var maxIterations = 100;
      while (exp.indexOf('CONFIG:') > -1 && maxIterations > 0) {
         const input = exp.substring(exp.indexOf('CONFIG:'), exp.indexOf(';', exp.indexOf('CONFIG:')) + 1);
         while (exp.indexOf(input) > -1 && maxIterations > 0) {
            
            var value = this.getParseExp(input);
            exp = exp.replace(input, value);

            if (this.app.isVerbose(this.id)) this.print(this, 'Parse expression: ' + input + ' -> ' + value);
            maxIterations--;
         }
         maxIterations--;
      }

      return exp;
   }

   static getParseExp(input) {

      /* getParseExp ===========================================
         Returns value of expression                             */

      try {

         var variable = (input.split(':')[1]).split(';')[0];

         if (variable.includes('|')) {
            var name = variable.split('|')[0];
            var func = variable.split('|')[1];
         } else {
            var name = variable;
            var func = null;
         }

         var value = this.app.getConfig(name);
         if (value != null && func != null) eval('value = Number(value) ' + func + ';');

         return value;

      } catch (err) { 
         this.print(this, 'Error parsing expression: ' + input + ' (' + err.message + ')');
         return null;
      }
      
   }

   static randomId(length) {

      return Array.from({length: length}).map(() => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
         .charAt(Math.floor(Math.random() * 35)))
      .join('');
      
   }

}

module.exports = Util;

