/* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
   KNOP.FAMILY Consulting
   Smart Home NexGen Backend
   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ 
   Module: WebSocket
   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */

class moduleWebSocket {

    static id            = 'websocket';
    static name          = 'WebSocket';
    static type          = 'Module';

    static app           = null;
    static parent        = null;
    static scopes        = [ 'group', 'light', 'climate', 'motion', 'switch', 'tuya', 'plug', 'valve' ];

    static http          = require('http');
    static WebSocket     = require('ws');
    static port          = 3001;
    static server        = null;
    static wss           = null;
    static clients       = new Set();

    /* Init ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    static init() {

        /* init ==================================================
           Initialize module                                     */

        /* Create HTTP server for WebSocket upgrade ~~~~~~~~~~~~~~ */
        /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
        this.server = this.http.createServer();
        this.wss = new this.WebSocket.Server({ server: this.server });

        this.wss.on('connection', (socket, req) => {
            this.clients.add(socket);
            if (this.app.isVerbose(this.id)) this.app.Util.print(this, 'WebSocket client connected ' + (req.socket.remoteAddress || 'unknown'));
            
            socket.on('message', (data) => {
                // Buffer in String umwandeln
                const message = Buffer.isBuffer(data) ? data.toString('utf8') : data;
                this.handleSocketMessage(socket, message);
            });

            socket.on('close', () => {
                this.clients.delete(socket);
                if (this.app.isVerbose(this.id)) this.app.Util.print(this, 'WebSocket client disconnected');
            });

            socket.on('error', (err) => {
                this.app.Util.print(this, 'WebSocket socket error: ' + err.message);
            });
        });

        this.server.listen(this.port, () => {
            this.app.Util.print(this, 'WebSocket Server listening on port ' + this.port);
        });

        this.server.on('error', (err) => {
            this.app.Util.print(this, 'WebSocket Server Error: ' + err.message);
        });

        setTimeout(() => { setInterval(() => {
        if (this.app.isVerbose(this.id)) this.app.Util.print(this, 'Send ping to WebSocket clients');
            this.send('#ping#', false);
        }, 60000); }, 5000);
    }

    /* Handle ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    static handle(scope, sender, payload = null) {

        /* handle ================================================
           Handle module requests                               */

        if (sender == 'send/payload' || sender == '#') this.send(payload);
        else if (payload != null) this.send({ source: sender, others: null, once: false, payload: payload });
        return null;
    }

    static handleSocketMessage(socket, data) {

        /* handleSocketMessage ===================================
           Process incoming WebSocket messages                  */

        let payload = data;
        if (typeof payload === 'string') {
            try { payload = JSON.parse(payload); } catch (err) {
                this.app.Util.print(this, 'Invalid WebSocket JSON payload: ' + err.message);
                socket.send(JSON.stringify({ error: 'Invalid JSON' }));
                return;
            }
        }

        const scope     = payload.scope || this.id;
        const sender    = payload.sender || this.id;
        const message   = payload.payload !== undefined ? payload.payload : payload;

        if (this.app.isVerbose(this.id)) {
            if (message.message != undefined && message.message != 'pong')
                this.app.Util.print(this, 'WebSocket message received from ' + sender + ':\n\n' + JSON.stringify(message) + '\n');
        }
    }

    static send(msg, asJson = true) {

        /* send ==================================================
           Send message via WebSocket to connected clients       */

        const text      = asJson ? JSON.stringify(msg) : msg;
        this.clients.forEach((client) => {
            if (client.readyState === this.WebSocket.OPEN) {
                client.send(text);
            }
        });

        if (this.app.isVerbose(this.id) && text != '#ping#') this.app.Util.print(this, 'Broadcast WebSocket message: ' + (text.length < 20 ? text : '\n\n' + text + '\n'));
    }
}

module.exports = moduleWebSocket;
