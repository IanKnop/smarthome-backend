/* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
   KNOP.FAMILY Consulting
   Smart Home NexGen Backend
   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */

// APPLICATION START MESSAGE
const APPLICATION_TITLE = 'KNOP.FAMILY CONSULTING - SMART HOME NGX - 1.000.1';
console.log('┌' + "─".repeat(APPLICATION_TITLE.length + 4) + '┐\n│' + " ".repeat(APPLICATION_TITLE.length + 4) + '│\n│  ' + APPLICATION_TITLE + '  │\n│' + "_".repeat(APPLICATION_TITLE.length + 4) + '│\n└' + "─".repeat(APPLICATION_TITLE.length + 4) + '┘');

class Smarthome {

   static name             = 'Smarthome';
   static type             = 'App';
   
   static verbose          = true;                    /* Verbose is always true and can be set by modules individually */
   static verboseModules   = [ 'util', 'config' ];

   static blockOrigins     = [ ];
   static gaplessOrigin    = [ 'smarthome/power' ];

   static cacheFrequ       = (15 * 60 * 1000);
   static cacheFile        = 'data/status.cache';

   /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
      GLOBAL VARS
      ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
   static Global = {
      // COMMON GLOBAL VARS
      Status:     { },
      GroupState: { },
      Motion:     { },
      Climate:    { },
      Sensors:    { }
   };

   static Timeouts = {

   };

   /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
      DEPENDENCIES
      ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
   static Util    = require('./util.js');
   static Modules = require('./modules.js');

   /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
      INIT
      ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
   static async run(cache = true) {

      /* run ==================================================
         Run application                                      */

      // LOAD LAST STATE FROM GLOBALS CACHE
      const fs             = require('fs');
      this.Global.Sensors  = JSON.parse(fs.readFileSync('data/sensors.json'));

      // READ FROM CACHE
      await this.Util.init(this);
      await this.Modules.init(this);

      if (cache) {
         await this.loadCache(); 
         setInterval(() => { this.saveCache(); }, this.cacheFrequ);
      }
   }

   static async saveCache() {

      /* saveCache ============================================
         Save states to cache                                 */

      const fs       = require('fs');

      fs.writeFileSync(this.cacheFile, JSON.stringify(this.Global.Status));
      this.Util.print(this, 'Save current states to cache' + (this.Global.Status != undefined ? ' (' + Object.getOwnPropertyNames(this.Global.Status).length + ' elements)' : ' (empty)'));
   }

   static async loadCache() {

      /* loadCache ============================================
         Load states from cache                               */

      const fs       = require('fs');

      if (fs.existsSync(this.cacheFile)) {
         const cacheImport  = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));
         const cacheDim     = Object.getOwnPropertyNames(cacheImport).length;

         this.Global.Status = { ...cacheImport, ...this.Global.Status  };
         this.Util.print(this, 'Load last state from cache' + ' (' + cacheDim + ' elements)');
      }
   }

   static async deleteCache() {

      /* deleteCache===========================================
         Delete cache                                        */

      const fs       = require('fs');

      if (fs.existsSync(this.cacheFile)) fs.rmSync(this.cacheFile);
      this.Util.print(this, 'Cache was deleted. Next start will be without any presets');
   }

   static setStatus(scope, sender, payload, exceptions = [ ], mqttPrefix = '', mqttSuffix = '') {

      /* setStatus ============================================
         Sets status from global dataset and invokes modules */

      this.Global.Status[sender] = isNaN(payload) ? payload : Number(payload);
      if (!exceptions.includes('mqtt')) this.Modules.handle('mqtt', mqttPrefix + sender + mqttSuffix, payload, exceptions);
   }

   static getStatus(sender, properties = null) {

      /* getStatus ============================================
         Gets status from global dataset                      */

      var id = 'this.Global.Status[\'' + sender + '\']' + (properties != undefined && properties != null && properties != '' ? '.' + properties : '');
      try { return eval(id); } catch (err) { return null; }
   }

   static getCredentials(module, id) {

      /* getCredentials ========================================
         Gets module specific credentials from config          */

      const fs       = require('fs');
      const config   = JSON.parse(fs.readFileSync('data/config.json', 'utf8'));

      if (config.credentials != undefined) {
         if (config.credentials[module] != undefined && config.credentials[module][id] != undefined) {
            return config.credentials[module][id];
         }
      }
      return null;
   }

   static getConfig(id) {

      /* getConfig =============================================
         Gets config value                                     */

      const fs       = require('fs');
      const config   = JSON.parse(fs.readFileSync('data/config.json', 'utf8'));

      if (config[id] != undefined) return config[id];
      else return null;
   }

   static setConfig(id, value) {

      /* setConfig =============================================
         Sets config value                                     */

      const fs       = require('fs');
      const config   = JSON.parse(fs.readFileSync('data/config.json', 'utf8'));

      config[id]     = isNaN(value) ? value : Number(value);
      return fs.writeFileSync('data/config.json', JSON.stringify(config));
   }

   static getScope(sender) {

      return sender.split('/')[0];
   }

   static getModule(id) {

      return this.Modules.instances[id].module;

   }

   static getAutomation() {

      return this.getModule('automation');
   }

   static log(target, data) {
      this.Modules.handle('log', target, data);
   }

   static isVerbose(moduleId) {
      return (this.verbose && this.verboseModules.includes(moduleId));
   }

}

// START BACKEND =========================================
Smarthome.run();
// =======================================================