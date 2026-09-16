/* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
   KNOP.FAMILY Consulting
   Smart Home NexGen Backend
   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ 
   Module: MQTT
   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */

class moduleMqtt {

    static id            = 'mqtt';
    static name          = 'MQTT';
    static type          = 'Module';

    static app           = null;
    static parent        = null;
    static scopes        = [  ];

    static mqtt          = require('mqtt');
    static serverUri     = 'mqtt://localhost:1883';
    static client        = this.mqtt.connect(this.serverUri);
    static subscriptions = [ 'zigbee/#', 'smarthome/#' ];

    static lastMessage   = { };
    static minSeparation = 500;
    static filterEmpty   = true;

    /* Init ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */    
    static init() {

        /* init ==================================================
           Initialize module                                     */

        /* Event Bindings ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
        /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
        this.client.on('connect', () => {
            
            /* onConnect ==========================================
            Subscribe to MQTT topics after successful connection  */

            this.app.Util.print(this, 'Connected ' + this.serverUri); 

            this.subscriptions.forEach(subscription => {
                this.client.subscribe(subscription, (err) => {
                    if (err) {
                        this.app.Util.print(this, 'Subscription Error: ' + err.message); 
                    } else {
                        this.app.Util.print(this, 'Subscribed to ' + subscription); 
                    }
                });
            });
        });

        this.client.on('message', (topic, payload) => {

            /* onMessage ==========================================
            Save device status and trigger actions on new message */

            if (!this.app.blockOrigins.includes(topic)) {
                try { payload = JSON.parse(payload); } catch (e) { payload = { } };
            
                if (this.app.isVerbose(this.id)) this.app.Util.print(this, 'New Message from ' + topic + ':\n\n' + JSON.stringify(payload) + '\n'); 

                // SEND MESSAGE TO OTHER MODULES AND AVOID DUPLICATES
                var sender  = this.getId(topic);

                if (this.app.gaplessOrigin.includes(sender)) {
                    this.parent.handle(sender.split('/')[0], sender, payload, [ 'mqtt' ], topic);
                } else {
                    var now = Date.now();
                    var gap = this.lastMessage[sender] != undefined ? now - this.lastMessage[sender] : -1;
                
                    this.lastMessage[sender] = now;
                    if (gap == -1 || gap >= this.minSeparation) this.parent.handle(sender.split('/')[0], sender, payload, [ 'mqtt' ], topic);
                }
            }
        });

        this.client.on('error', (err) => {

            /* onError ============================================
            Print error information                               */

            this.app.Util.print(this, 'Connection Error: ' + err.message); 
        });

        this.client.on('reconnect', () => {

            /* onReconnect ========================================
            Print reconnection information                        */

            this.app.Util.print(this, 'Reconnecting ' + this.serverUri); 
        });

        this.client.on('offline', () => {

            /* onOffline ==========================================
            Print offline information                             */

            this.app.Util.print(this, 'Client Offline'); 
        });
    }

    static handle(scope, sender, payload = null, exceptions = [ ]) {

        /* handle ================================================
           Handle module requests                               */

        this.send({ topic: sender, payload: payload});
    }

    static getId(sender) {
    
        /* getId =================================================
           Gets deviceId from sender (group/ian/set > group/ian) */
    
        if (sender.startsWith('zigbee')) sender = sender.substring(sender.indexOf('/') + 1);
        return sender.split('/')[0] + '/' + sender.split('/')[1];
    }

    static send(msg) {

        /* send ===============================================
        Send message via MQTT                                 */

        if (msg.topic != undefined && msg.payload != undefined) {
            const message = JSON.stringify(msg.payload);

            this.client.publish(msg.topic, message, (err) => {
                if (err) this.app.Util.print(this, 'Publish Error:', err.message); 
                else if (this.app.isVerbose(this.id) && !this.app.blockOrigins.includes(msg.topic)) this.app.Util.print(this, 'Sent message to ' + msg.topic + ' with payload:\n\n' + JSON.stringify(msg.payload) + '\n'); 
            });
        }
    }
}

module.exports = moduleMqtt;