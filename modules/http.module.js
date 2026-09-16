/* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
   KNOP.FAMILY Consulting
   Smart Home NexGen Backend
   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ 
   Module: HTTP
   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~s~~~~~~~~~~~~~~~~~~~~~~~ */

class moduleHttp {

    static id            = 'http';
    static name          = 'Http';
    static type          = 'Module';

    static app           = null;
    static parent        = null;
    static scopes        = [  ];

    static http          = require('http');
    static url           = require('url');

    static port          = 3000;
    static server        = null;
    static allowedOrigin = '*';

    static defaultState  = null;

    /* Init ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    static init() {

        /* init ==================================================
           Initialize module                                     */

        /* Start HTTP Server ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
        /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
        this.server = this.http.createServer((req, res) => {
            res.setHeader('Access-Control-Allow-Origin', this.allowedOrigin);
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
            this.handleMessage(req, res);
        });

        this.server.listen(this.port, () => {
            this.app.Util.print(this, 'HTTP Server listening on port ' + this.port);
        });

        this.server.on('error', (err) => {
            this.app.Util.print(this, 'HTTP Server Error: ' + err.message);
        });
    }
    
    /* Handle ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    static handle(scope, sender, payload = null) {

        /* handle ================================================
           Handle HTTP module requests                           */

        if (payload != null && payload.url != undefined && payload.url.startsWith('/')) {
            // ROUTE REQUEST TO handleRequest() FOR INTERNAL HANDLING
            this.handleRequest({ url: payload.url, method: payload.method || 'GET', headers: payload.headers, body: payload.body ?? payload.payload, timeout: payload.timeout }, null, payload.body ?? payload.payload);
        } else if (payload != null && payload.url != undefined) {
            // SEND OUTGOING HTTP REQUEST
            return this.send({
                url:        payload.url,
                method:     payload.method || 'GET',
                headers:    payload.headers,
                body:       payload.body ?? payload.payload,
                timeout:    payload.timeout
            });
        }

        return null;
    }

    /* Helper Functions ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    static async handleMessage(req, res) {

        /* handleMessage =========================================
           Handle POST /api/message                               */

        var post = '';

        req.on('data', chunk => { post += chunk.toString(); });
        req.on('end',  () => {
            try {
                this.handleRequest(req, res, post);
            } catch (e) {
                this.app.Util.print(this, 'Error receiving HTTP request: ' + e.message);
                res.statusCode = 400; res.end(JSON.stringify({ error: 'Error receiving HTTP request' }));
            }
        });
    }

    static async handleRequest(req, res, post = null) {

        /* handleRequest =========================================
           Handle incoming HTTP requests                         */

        /* API Request Structure ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ 
        http://<server>:<port>/api/<scope>/<func>?deviceId=<deviceId>... */
        
        // REMOVE LEADING SLASHES FROM URL
        var reqUrl = req.url.replace(/^\/+/, '');

        // GET SCOPE, FUNC AND SENDER FROM URL
        var scope       = this.getScope(reqUrl); 
        var func        = this.getFunc(reqUrl);
        var sender      = this.getSender(reqUrl); 

        if (this.app.isVerbose(this.id)) this.app.Util.print(this, 'Receiving HTTP request: { url: .../' + reqUrl.substring(0, Math.min(50, reqUrl.length)) + '; func: ' + func + '; sender: ' + sender + '; scope: ' + scope + ' }');
        
        // HANDLE MODULE BASED API FUNCTIONS
        var results     = this.parent.handleApi(req, res, scope, sender, func, new URL(req.url, "http://a.b.c"), [ ], post);
        if (res != undefined && res != null) {
            res.statusCode  = 200; 
            res.end(JSON.stringify(results));
        }
    }

    static getFunc(reqUrl) { 

        /* getFunc ==============================================
           Returns function name from URL                       */
        
        if (reqUrl != null) {
            var index = reqUrl.split('/')[0] == 'api' ? 1 : 0;
            if (!this.parent.scopes.includes(reqUrl.split('/')[index])) return reqUrl.split('/')[index].split('?')[0];
            else if (reqUrl.split('/')[index + 1] != undefined) return reqUrl.split('/')[index + 1].split('?')[0];
            else return null;
        } else return null;
    }

    static getSender(reqUrl) { 

        /* getSender =============================================
           Returns single sender id if available                 */

        var url = new URL(reqUrl, "http://a.b.c");
        return url.searchParams.get('deviceId') ?? url.searchParams.get('groupId') ?? url.searchParams.get('sensorId') ?? url.searchParams.get('id') ?? null; 
    }
    
    static getScope(reqUrl) { 

        /* getScope ==============================================
           Returns scope from URL                                */

        var index = reqUrl.split('/')[0] == 'api' ? 1 : 0;
        if (this.parent.scopes.includes(reqUrl.split('/')[index])) return reqUrl.split('/')[index];
        else return null;
    }

    static request(urlString, options = { method: 'GET', headers: {}, timeout: 10000, body: null }) {

        /* request ================================================
           Perform outgoing HTTP/HTTPS request                    */

        return new Promise((resolve, reject) => {
            try {
                const urlObj = new URL(urlString);
                const protocol = urlObj.protocol === 'https:' ? require('https') : this.http;
                const requestOptions = {
                    method: (options.method || 'GET').toUpperCase(),
                    hostname: urlObj.hostname,
                    port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
                    path: urlObj.pathname + urlObj.search,
                    headers: options.headers || {},
                    timeout: options.timeout ?? 10000
                };

                const req = protocol.request(requestOptions, res => {
                    let data = '';
                    res.on('data', chunk => data += chunk.toString());
                    res.on('end', () => {
                        resolve({
                            statusCode: res.statusCode,
                            statusMessage: res.statusMessage,
                            headers: res.headers,
                            body: data
                        });
                    });
                });

                req.on('error', err => reject(err));
                req.on('timeout', () => {
                    req.destroy(new Error('HTTP request timeout'));
                });

                if (options.body != null) {
                    const bodyString = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
                    req.write(bodyString);
                }

                req.end();
            } catch (err) {
                reject(err);
            }
        });
    }

    static send(msg) {

        /* send ==================================================
           Send message via HTTP (optional)                      */

        if (msg == null || msg.url == undefined) {
            this.app.Util.print(this, 'HTTP send requires msg.url');
            return null;
        }

        const method = msg.method || 'GET';
        const headers = msg.headers || { 'Content-Type': 'application/json' };
        const body = msg.body ?? msg.payload ?? null;

        return this.request(msg.url, { method, headers, timeout: msg.timeout, body })
            .then(response => {
                if (this.app.isVerbose(this.id)) this.app.Util.print(this, 'HTTP ' + method + ' ' + msg.url + ' => ' + response.statusCode);
                return response;
            })
            .catch(err => {
                this.app.Util.print(this, 'HTTP request (' + msg.url + ') failed: ' + err.message);
                return null;
            });
    }
}

module.exports = moduleHttp;