/* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
   KNOP.FAMILY Consulting
   Smart Home NexGen Backend
   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ 
   Module: Reolink
   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
   
class moduleReolink {

    static id           = 'reolink';
    static name         = 'Reolink';
    static type         = 'Module';
    
    static app          = null;
    static parent       = null;
    static scopes       = [ 'cam' ];

    static user         = null;
    static password     = null;

    static devices      = [ ];

    /* Init ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */    
    static init() {
        
        /* init ==================================================
           Initialize module                                     */

        const fs            = require('fs');
        this.devices        = JSON.parse(fs.readFileSync('data/reolinkDevices.json', 'utf8'));

        this.user           = this.app.getCredentials('reolink', 'user'); 
        this.password       = this.app.getCredentials('reolink', 'password'); 
    }

    /* Handle ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    static handle(scope, sender, payload) {
        
        /* handle ================================================
           Triggers action based on active heating profiles      */
        
    }

    /* API ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */    
    static handleApi(req, res, scope, sender, func, url, exceptions = [ ], post)  {

        /* handleApi =============================================
           Handle module specific API responses                 */

        var results = null;
        switch (func) {
            // GET
            case 'cam': 
                var info = JSON.parse(post);
                if (info.alarm != undefined) {
                    const cam   = this.devices.filter((device) => { return device.name.toUpperCase() == info.alarm.device.toUpperCase(); })[0]
                    if (cam != undefined) {
                        const type  = info.alarm.type.toUpperCase();
                        this.app.Util.print(this, 'Movement recognized at cam "' + info.alarm.device + '" ' + (type == 'TEST' ? '(test mode)' : ''));
                        if (type == 'VISITOR' || (!this.app.getConfig('cam_only_visitors') && (!this.app.getConfig('cam_only_move_bell') || cam.type == 'doorbell)') && (type == 'TEST' || type == 'PEOPLE'))) this.transferDoorbellAlarm(cam);
                    }
                }
                break;
            case 'video':
            case 'videos':
                results = this.getVideos();
                break;
        }

        return results;
    }

    /* Helper Functions ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    

    /* Test Functions ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    static testDoorbellAlarm() {
           
        /* testDoorbellAlarm =====================================
           Tests transferDoorbellAlarm                           */

        this.transferDoorbellAlarm({ type: 'test', alias: 'cam3', user: this.user, password: this.password });
        return 'Run Test [ DOORBELL_ALARM_TEST ]';

    }
    
    /* Actions ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    static transferDoorbellAlarm(cam) {

        /* transferDoorbellAlarm =================================
           Sends info about doorbell event to user interface     */

        this.parent.handle('websocket', '#', { 
            id:         cam.type + '-preview-' + (Math.floor(Math.random() * 9000000) + 1000000),
            callAction: 'script',
            exclusive:  [ ],
            payload:    { 
                script: "loadMediaPlayerSource('cam-preview-player', '/" + cam.alias + "&user=" + this.user + "&password=" + this.password + "', true, 60000);"
            }
        });
    }

    static getVideos() {

        /* getVideos =============================================
           Gets surveillance video thumbnails and info           */

        const base          = '/ext/videos';   
        const devices       = [ 'Klingel', 'Eingang', 'Garten' ];
        const fs            = require('fs');
        
        const today         = Date.now();
        const days          = 3;
        const dateTo        = today - (days * 24 * 60 * 60 * 1000);

        var returnValue     = { };
        var videoCount      = 0;

        devices.forEach(device => {

            var date = new Date(today);
            while (date >= dateTo) {

                var year    = date.getFullYear();
                var month   = String(date.getMonth() + 1).padStart(2, '0');
                var day     = String(date.getDate()).padStart(2, '0');

                var dir     = fs.readdirSync(base + '/' + device + '/' + year + '/' + month + '/' + day);
                dir.forEach(file => {

                    var time        = file.split('.jpg')[0].slice(-6);
                    var newValue    = null;
                    if (file.endsWith('.jpg') || file.endsWith('.jpeg')) {
                        if (returnValue[year] == undefined) returnValue[year] = { };
                        if (returnValue[year][month] == undefined) returnValue[year][month] = { };
                        if (returnValue[year][month]['day-' + day] == undefined) returnValue[year][month]['day-' + day] = [ ];
                        newValue = file.split('.jpg')[0];
                    }

                    if (newValue != null) {
                        if (returnValue[year][month]['day-' + day].length == 0) returnValue[year][month]['day-' + day] = [ newValue ];
                    else {
                        var index = returnValue[year][month]['day-' + day].findIndex(value => { return value.slice(-6) < time; });
                            returnValue[year][month]['day-' + day].splice(index, 0, newValue);
                        }
                    }
                    videoCount++;
                });

                // NEXT DAY
                date.setDate(date.getDate() - 1);

            }
        });

        this.app.Util.print(this, 'Get surveillance videos list (' + videoCount + ' videos)');
        return { Everywhere: returnValue };

    }

    static set(deviceInfo, value) {

        /* set ===================================================
           Sets heating device                                   */

        // SET
        if (Boolean(deviceInfo.enabled) == true) {
            this.app.Modules.handle('http', deviceInfo.id, {
                url: 'http://' + deviceInfo.deviceIp + '/relay/0?turn=' + (value ? 'on' : 'off'),
            });
        }
    }

    static setAll(value, ignoreTestMode = false) {

        /* setAll ================================================
           Sets all devices to specific state                    */

        this.devices.forEach(deviceInfo => {
            if (ignoreTestMode || !this.testMode || this.testGroups.includes(deviceInfo.group))
                this.set(deviceInfo, value);
        });
    }

    static print(msg, profile = null) {
        
        /* print =================================================
           Prints log entry for reolink action                   */
        
        this.app.Util.print(this, (profile != null ? msg.replace('#', String(profile.id).padStart(4, '0')) : msg));
    }
}

module.exports = moduleReolink;

