/* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
   KNOP.FAMILY Consulting
   Smart Home NexGen Backend
   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */

// APPLICATION START MESSAGE
const APPLICATION_TITLE = '         KNOP.FAMILY CONSULTING - SMART HOME CONSOLE         ';
console.log('\n┌' + "─".repeat(APPLICATION_TITLE.length + 4) + '┐\n│' + " ".repeat(APPLICATION_TITLE.length + 4) + '│\n│  ' + APPLICATION_TITLE + '  │\n│   ' + "─".repeat(APPLICATION_TITLE.length - 2) + '   │\n└' + "─".repeat(APPLICATION_TITLE.length + 4) + '┘\n');

class SmarthomeConsole {

   static name          = 'Console';
   static type          = 'App';
   static quietMode     = false;
   static defVerbose    = false;

   static rl            = null;

   static Util          = require('./util.js');
   static mqtt          = require('mqtt');
   static serverUri     = 'mqtt://localhost:1883';
   static client        = this.mqtt.connect(this.serverUri);
   static subscriptions = [ 'smarthome/#' ];

   /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
      INIT
      ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
   static async run(cache = true) {

      /* run ==================================================
         Run application                                      */

      this.init();
      const readline = require('readline');
      this.rl = readline.createInterface({ input: process.stdin, output: process.stdout });
            
      setTimeout(() => {
        this.requestPrompt(true);
        if (this.defVerbose) this.send({ topic: 'smarthome/client', payload: 'verbose true'} );
      }, 1000);
   }

   static send(msg) {

        /* send ===============================================
        Send message via MQTT                                 */

        if (msg.topic != undefined && msg.payload != undefined) {
            const message = JSON.stringify(msg.payload);
            this.client.publish(msg.topic, message, (err) => {
                if (err) this.Util.print(this, 'Publish Error:', err.message); 
            });
        }
   }

   static init() {

        /* init ==================================================
           Initialize module                                     */

        /* Event Bindings ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
        /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
        this.client.on('connect', () => {
            
            /* onConnect ==========================================
            Subscribe to MQTT topics after successful connection  */

            this.Util.print(this, 'Connected ' + this.serverUri); 

            this.subscriptions.forEach(subscription => {
                this.client.subscribe(subscription, (err) => {
                    if (err) {
                        this.Util.print(this, 'Subscription Error: ' + err.message); 
                    } else {
                        this.Util.print(this, 'Subscribed to ' + subscription); 
                    }
                });
            });
        });

        this.client.on('message', (topic, payload) => {

            /* onMessage ==========================================
            Save device status and trigger actions on new message */

            if (topic == 'smarthome/server') this.handle(payload);
        });

        this.client.on('error', (err) => {

            /* onError ============================================
            Print error information                               */

            this.Util.print(this, 'Connection Error: ' + err.message); 
        });

        this.client.on('reconnect', () => {

            /* onReconnect ========================================
            Print reconnection information                        */

            this.Util.print(this, 'Reconnecting ' + this.serverUri); 
        });

        this.client.on('offline', () => {

            /* onOffline ==========================================
            Print offline information                             */

            this.Util.print(this, 'Client Offline'); 
        });
   }

    static handle(response) {

        /* handle ================================================
           Handle module requests                               */

        if (!this.quietMode && response != '') {
            //console.log(JSON.parse(response.toString()).replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\t/g, '\t')); 
            console.log('\x1b[92m', JSON.parse(response.toString()).replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\t/g, '\t')); 
        }
        if (!response.includes(this.Util.restartLabel)) this.requestPrompt();
    }

   static requestPrompt(first = false) {

      /* requestPrompt ========================================
         Ask for user prompt                                  */

      this.rl.question('\x1b[33m> ', (prompt) => {
         if (prompt == 'exit' || prompt == 'x') process.exit();
         else if (prompt == 'script') this.runScript(prompt);
         else if (prompt == 'quiet' || prompt == 'q' || prompt == 'psst') {
            this.quietMode = (!this.quietMode);
            this.Util.print(this, 'Quiet mode set to: ' + this.quietMode.toString());
            this.requestPrompt();
         }
         else {
            this.send({ topic: 'smarthome/client', payload: prompt} );
         }
      });
   }

   static runScript(prompt) {

        

   }
}

// START CONSOLE
SmarthomeConsole.run();