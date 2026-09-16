/* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
   KNOP.FAMILY Consulting
   Smart Home NexGen Backend
   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
   Module: Tuya
   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */

class moduleTuya {

    static id            = 'tuya';
    static name          = 'Tuya';
    static type          = 'Module';

    static app           = null;
    static parent        = null;
    static scopes        = [ 'plug' ];

    static devicesFile   = 'data/tuyaDevices.json';

    /* LOCAL PROTOCOL (primary control path) ~~~~~~~~~~~~~~~~ */
    static TuyAPI        = require('tuyapi');
    static devices       = [ ];      // serializable device config/metadata list
    static connections   = { };      // id -> { device: TuyAPI instance, reconnectTimer }
    static reconnectDelay = 10000;

    /* CLOUD API - only used for setup / local-key sync / fallback ~~~ */
    static cloudFallback = true;
    static tuyaUser      = null;
    static tuyaSource    = require('@tuya/tuya-connector-nodejs');
    static tuya          = null;

    /* Init ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    static init() {

        /* init ==================================================
           Initialize module                                     */

        this.tuyaUser = this.app.getCredentials('tuya', 'user');
        this.tuya = new this.tuyaSource.TuyaContext({
            baseUrl:    'https://openapi.tuyaeu.com',
            accessKey:  this.app.getCredentials('tuya', 'accessKey'),
            secretKey:  this.app.getCredentials('tuya', 'secretKey'),
        });

        this.loadDevices();
    }

    static loadDevices() {

        /* loadDevices ===========================================
           Loads device configuration and opens local connections */

        const fs     = require('fs');
        var config    = JSON.parse(fs.readFileSync(this.devicesFile, 'utf8'));

        // NOTE: this.devices is a redacted view (no local keys) since
        // it is exposed as-is via console.module.js ("show tuya")
        this.devices = [ ];

        var count = 0;
        config.forEach(entry => {

            this.devices.push({
                id:             entry.id,
                tuyaId:         entry.tuyaId,
                description:    entry.description ?? entry.id,
                ip:             entry.ip ?? null,
                version:        entry.version ?? '3.3',
                dps:            entry.dps ?? { switch_1: 1 },
                hasKey:         (entry.key != undefined && entry.key != null)
            });

            // SEED STATUS SO DEVICE IS VISIBLE EVEN BEFORE FIRST LOCAL CONTACT
            this.app.setStatus(entry.id.split('/')[0], entry.id, {
                id:             entry.id,
                tuyaId:         entry.tuyaId,
                description:    entry.description ?? entry.id,
                online:         false,
                status:         [ ]
            }, [ this.id ]);

            if (entry.key == undefined || entry.key == null) {
                if (this.app.isVerbose(this.id)) this.app.Util.print(this, 'No Key for [' + entry.id + '] . Run "tuya sync" or set it manually in ' + this.devicesFile);
                return;
            }

            this.connectDevice(entry);
            count++;
        });

        if (this.app.isVerbose(this.id)) this.app.Util.print(this, 'Initialized ' + count + ' local Tuya device(s) of ' + this.devices.length + ' configured');
    }

    static connectDevice(entry) {

        /* connectDevice =========================================
           Creates local TuyAPI connection for a single device    */

        const device = new this.TuyAPI({
            id:                     entry.tuyaId,
            key:                    entry.key,
            ip:                     entry.ip ?? undefined,
            version:                entry.version ?? '3.3',
            issueRefreshOnConnect:  true
        });

        this.connections[entry.id] = { device: device, config: entry, reconnectTimer: null, connected: false };

        device.on('connected', () => {
            this.app.Util.print(this, 'Connected to Tuya device ' + entry.id + (entry.ip ? ' (' + entry.ip + ')' : ''));
            this.connections[entry.id].connected = true;
            this.updateOnline(entry.id, true);
        });

        device.on('disconnected', () => {
            if (this.app.isVerbose(this.id)) this.app.Util.print(this, 'Disconnected from Tuya device ' + entry.id);
            this.connections[entry.id].connected = false;
            this.updateOnline(entry.id, false);
            this.scheduleReconnect(entry.id);
        });

        device.on('error', err => {
            if (this.app.isVerbose(this.id)) this.app.Util.print(this, 'Error on Tuya device ' + entry.id + ': ' + err.message);
        });

        device.on('data', data => {
            if (data != null && data.dps != undefined) this.applyDps(entry.id, data.dps);
        });

        device.on('dp-refresh', data => {
            if (data != null && data.dps != undefined) this.applyDps(entry.id, data.dps);
        });

        this.startConnection(entry.id);
    }

    static async startConnection(id) {

        /* startConnection =======================================
           (Re-)establishes local connection for a device         */

        var connection = this.connections[id];
        if (connection == undefined) return;
        var entry       = connection.config;

        try {
            if (entry.ip == undefined || entry.ip == null) await connection.device.find();
            await connection.device.connect();
        } catch (err) {
            if (this.app.isVerbose(this.id)) this.app.Util.print(this, 'Failed to connect to Tuya device ' + id + ': ' + err.message);
            connection.connected = false;
            this.updateOnline(id, false);
            this.scheduleReconnect(id);
        }
    }

    static scheduleReconnect(id) {

        /* scheduleReconnect ======================================
           Retries local connection after a delay                 */

        var connection = this.connections[id];
        if (connection == undefined || connection.reconnectTimer != null) return;

        connection.reconnectTimer = setTimeout(() => {
            connection.reconnectTimer = null;
            this.startConnection(id);
        }, this.reconnectDelay);
    }

    static applyDps(id, dps) {

        /* applyDps ===============================================
           Merges incoming local DPS values into device status    */

        var entry   = this.devices.find(entry => { return entry.id == id; });
        var current = this.app.getStatus(id) ?? { };
        var status  = Array.isArray(current.status) ? [ ...current.status ] : [ ];

        Object.getOwnPropertyNames(dps).forEach(dp => {
            var code  = this.dpToCode(entry, dp);
            var index = status.findIndex(s => { return s.code == code; });
            if (index == -1) status.push({ code: code, value: dps[dp] });
            else status[index] = { code: code, value: dps[dp] };
        });

        this.app.setStatus(id.split('/')[0], id, { ...current, status: status, online: true }, [ this.id ]);
    }

    static updateOnline(id, online) {

        /* updateOnline ===========================================
           Updates online flag without touching status values     */

        var current = this.app.getStatus(id) ?? { };
        this.app.setStatus(id.split('/')[0], id, { ...current, online: online }, [ this.id ]);
    }

    static dpToCode(entry, dp) {

        /* dpToCode ===============================================
           Maps a raw local DPS index to a Tuya "code" name        */

        if (entry != undefined && entry.dps != undefined) {
            var found = Object.getOwnPropertyNames(entry.dps).find(code => { return String(entry.dps[code]) == String(dp); });
            if (found != undefined) return found;
        }
        return 'switch_' + dp;
    }

    static codeToDp(entry, code) {

        /* codeToDp ===============================================
           Maps a Tuya "code" name to a raw local DPS index        */

        if (entry != undefined && entry.dps != undefined && entry.dps[code] != undefined) return entry.dps[code];

        var match = /^switch_(\d+)$/.exec(code);
        return match != null ? Number(match[1]) : 1;
    }

    static coerceValue(value) {

        /* coerceValue =============================================
           Normalizes string query params to boolean/number/string */

        if (value === 'true') return true;
        if (value === 'false') return false;
        if (typeof value === 'string' && value !== '' && !isNaN(value)) return Number(value);
        return value;
    }

    static async set(sender, value, code = 'switch_1') {

        /* set ==================================================
           Sets state/value on Tuya device (local, cloud fallback) */

        var entry       = this.devices.find(entry => { return entry.id == sender; });
        var connection   = this.connections[sender];
        value            = this.coerceValue(value);

        if (entry != undefined && connection != undefined && connection.connected) {
            try {
                var dp = this.codeToDp(entry, code);
                await connection.device.set({ dps: dp, set: value });

                var current = this.app.getStatus(sender) ?? { };
                var status  = Array.isArray(current.status) ? [ ...current.status ] : [ ];
                var index   = status.findIndex(s => { return s.code == code; });
                if (index == -1) status.push({ code: code, value: value }); else status[index] = { code: code, value: value };
                this.app.setStatus(sender.split('/')[0], sender, { ...current, status: status }, [ this.id ]);

                this.app.Util.print(this, 'Set Tuya device ' + sender + ' (' + entry.tuyaId + ') locally to: ' + JSON.stringify(value));
                this.app.Modules.handle(sender.split('/')[0], sender, value);
                return;

            } catch (err) {
                this.app.Util.print(this, 'Failed to set local Tuya device ' + sender + ': ' + err.message);
                if (!this.cloudFallback) return;
                // FALL THROUGH TO CLOUD FALLBACK
            }
        }

        if (this.cloudFallback && entry != undefined) await this.setCloud(sender, entry, value, code);
        else this.app.Util.print(this, 'Failed to set unreachable Tuya device ' + sender);
    }

    static async setCloud(sender, entry, value, code) {

        /* setCloud ==============================================
           Fallback: sets state/value via Tuya Developer Platform */

        try {
            var response = await this.tuya.request({
                method: 'POST',
                path: '/v1.0/devices/' + entry.tuyaId + '/commands',
                body: { commands: [{ code: code, value: value }] },
            });

            if (response.success != undefined && response.success) {
                var current = this.app.getStatus(sender) ?? { };
                var status  = Array.isArray(current.status) ? [ ...current.status ] : [ ];
                var index   = status.findIndex(s => { return s.code == code; });
                if (index == -1) status.push({ code: code, value: value }); else status[index] = { code: code, value: value };
                this.app.setStatus(sender.split('/')[0], sender, { ...current, status: status }, [ this.id ]);

                this.app.Util.print(this, 'Set Tuya device ' + sender + ' (' + entry.tuyaId + ') via cloud fallback to: ' + JSON.stringify(value));
                this.app.Modules.handle(sender.split('/')[0], sender, value);
            } else {
                this.app.Util.print(this, 'Cloud fallback failed to set Tuya device ' + sender + ' with response:\n\n' + JSON.stringify(response) + '\n');
            }
        } catch (err) {
            this.app.Util.print(this, 'Cloud fallback error setting Tuya device ' + sender + ': ' + err.message);
        }
    }

    static handle(scope, sender, payload = null) {

        /* handle ================================================
           Handle module requests                               */

        if (payload == null) {

            // EMPTY PAYLOAD RETURNS CURRENT STATUS
            var senderDevice        = this.app.getStatus(sender);

            if (senderDevice != undefined) {
                var deviceId        = sender.split('.')[0];
                var properties      = sender.split('.', 2)[1];
                var code            = properties != undefined ? properties : 'switch_1';
                var value           = null;

                if (senderDevice.status != undefined && senderDevice.status.filter(status => { return status.code == code; }).length == 1) {
                    value = senderDevice.status.filter(status => { return status.code == code; })[0].value;
                    if (this.app.isVerbose(this.id)) this.app.Util.print(this, 'Get ' + code + ' from ' + sender + ': ' + value);
                }

                return value;

            } else return null;

        } else if (this.scopes.includes(scope)) {

            /*// RECEIVE DEVICE INFORMATION
            // GROUPS
            if (scope == 'group') {
                if (payload.state == undefined) payload.state = (payload.scene_recall != undefined ? 'on' : 'off');
                if (payload.scene_recall != undefined) payload.scene = payload.scene_recall;
            }

            // SET STATUS
            this.app.setStatus(scope, sender, payload, [ this.id ]);*/
        }
    }

    /* Cloud setup / key sync ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    static async syncFromCloud() {

        /* syncFromCloud =========================================
           One-off setup helper: pulls device list + local keys
           from the Tuya Developer Platform and merges them into
           data/tuyaDevices.json. IP addresses still need a fixed
           DHCP reservation (or can be left empty for UDP auto-
           discovery via device.find() on connect).             */

        const fs      = require('fs');
        var current    = JSON.parse(fs.readFileSync(this.devicesFile, 'utf8'));

        var response = await this.tuya.request({
            method: 'GET',
            path: '/v1.0/users/' + this.tuyaUser + '/devices',
        });

        var count = 0;
        if (response.success) {
            for (const device of response.result) {
                var entry = current.find(entry => { return entry.tuyaId == device.id; });
                if (entry == undefined) {
                    entry = {
                        id:      'tuya/' + Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(8, '0'),
                        tuyaId:  device.id,
                        ip:      null,
                        version: '3.3',
                        dps:     { switch_1: 1 }
                    };
                    current.push(entry);
                }

                entry.description = device.name;
                //if ((entry.ip == undefined || entry.ip == null) && device.ip) entry.ip = device.ip;

                try {
                    var detail = await this.tuya.request({ method: 'GET', path: '/v1.0/devices/' + device.id });
                    if (detail.success && detail.result.local_key != undefined) entry.key = detail.result.local_key;
                } catch (err) {
                    this.app.Util.print(this, 'Failed to fetch local key for ' + device.id + ': ' + err.message);
                }

                count++;
            }
        }

        fs.writeFileSync(this.devicesFile, JSON.stringify(current, null, 4));
        this.app.Util.print(this, 'Synced ' + count + ' Tuya device(s) from cloud (local keys + metadata). Restart to apply.');

        return count;
    }

    /* API ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    static handleApi(req, res, scope, sender, func, url) {

        /* handleApi =============================================
           Handle module specific API responses                  */

        var results = null;
        switch (func) {
            // GET
            case 'getbulk':
            case 'getstate':
                var deviceIds = (func == 'getbulk' ? url.searchParams.get('bindings') : [ (url.searchParams.get('deviceId') ?? url.searchParams.get('groupId')) + (func == 'getstate' ? '.state' : '') ]);
                JSON.parse(deviceIds).forEach(deviceId => {
                    if (this.app.getStatus(sender) != null) {
                        if (results == null) results = [ ];
                        results.push({ id: deviceId, val: this.handle(deviceId.split('/')[0], deviceId, null) });
                    }
                });
                break;

            // SET
            case 'set':
                this.set(sender, url.searchParams.get('value'), url.searchParams.get('code'));
                break;
            case 'toggle':
                var current = this.handle(scope, sender);
                this.set(sender, (current == undefined || current == false));
                break;

            // SETUP: SYNC DEVICE LIST + LOCAL KEYS FROM TUYA CLOUD
            case 'sync':
                this.syncFromCloud();
                break;

            // TIME DURATION
            case 'time':
                if (sender.startsWith('tuya/')) {
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

         this.set(sender, false);
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

        this.set(sender, 'true');
        this.print('Initialized new timeout for ' + sender + ' to run until ' + this.app.Timeouts[sender].end);
        this.parent.handle('websocket', sender + '/runtime', true);

    }

    /* Helper Functions ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */

    static print(msg, message = null) {

        /* print =================================================
           Prints log entry for automation action                */

        this.app.Util.print(this, msg);
    }


}

module.exports = moduleTuya;
