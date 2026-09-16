/* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
   KNOP.FAMILY Consulting
   Smart Home NexGen Backend
   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ 
   Module: Flight Tracking
   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
   
class moduleFlight {

    static id                   = 'flight';
    static name                 = 'ADB-S';
    static type                 = 'Module';

    static app                  = null;
    static parent               = null;
    static scopes               = [ 'flight' ];

    // FLIGHT DATA
    static url                  = null;
    static readThread           = null;

    // FLIGHT META DATA FROM AERODATABOX API (i.e. destination)
    static apiKey               = null;
    static apiHost              = 'aerodatabox.p.rapidapi.com';
    static apiHome              = 'FRA';
    static apiOffsetMin         = -120;
    static apiDurationMin       = 720;
    static apiWithLeg           = true;
    static apiDirection         = 'Both';
    static apiWithCancelled     = false;
    static apiCodeshared        = false;
    static apiCargo             = true
    static apiPrivate           = true;
    static apiWithLocation      = false;
    
    static readApiThread        = null;

    static data                 = null;
    static dataApi              = null;
    static dataFlight           = null;

    static flightsRecent        = { };
    static flightsTimestamp     = { };

    static enabledSubscriptions = [ 'flight/recent' ];
    static subscriptions        = [
        {
            id:         'flight/recent',
            latStart:   49.856799,
            latEnd:     49.981688,
            lonStart:   8.492638,
            lonEnd:     8.614621,
            altMax:     7500,
            refresh:    true,
            asString:   true,
        }
    ]

    /* Init ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */    
    static init() {
        
        /* init ==================================================
           Initialize module                                     */

        const fs            = require('fs');
        this.airlines       = JSON.parse(fs.readFileSync('data/flightAirlines.json', 'utf8'));

        // INITIALIZE THREAD FOR META DATA FROM API
        this.url    = this.app.getConfig('flightUrl');
        this.apiKey = this.app.getCredentials('aerodatabox', 'key'); 
        this.initializeApiThread();

        var refreshInterval = 10;
        setTimeout(() => this.initializeReadThread(refreshInterval * 1000), 5000);
    }

    static initializeReadThread(interval = 60000) {

        /* initializeReadThread ==================================
           Initialize interval to get close aircrafts as JSON    */

        this.readThread = setInterval(() => {
            fetch(this.url)
                .then(res   => res.json())
                .then(data  => { 
                    this.data   = typeof data === 'string' ? JSON.parse(data) : data; 

                    const fs    = require('fs');
                    fs.writeFileSync('data/flightRaw.json', JSON.stringify(this.data));

                    this.subscriptions.forEach(sub => {
                        var hasChanged = this.cacheCurrentFlights(sub.id, this.getCurrentFlights(sub.latStart, sub.latEnd, sub.lonStart, sub.lonEnd));
                        if (hasChanged && sub.refresh) this.parent.refreshClients(sub.id);
                    });
                })
                .catch(err  => this.app.Util.print(this, 'Error fetching ' + this.name + ' Aircraft data: ' + err.message + '\n\n' + err.stack + '\n\n'));
        }, interval);
    }

    static initializeApiThread(interval = (4 * 60 * 60 * 1000)) {

        /* initializeApiThread ===================================
           Initialize thread to get additional flight info       */

        const fs            = require('fs');
        this.airlines       = JSON.parse(fs.readFileSync('data/flightAirlines.json', 'utf8'));

        this.refreshData(interval);
        this.readThread = setInterval(() => {  this.refreshData(interval); }, interval);
    }

    static refreshData(interval) {

        /* refreshData ===========================================
           Refreshes API data if too old and generates meta data */

        const fs = require('fs');
              
        if (this.isDataOutdated(interval)) this.fetchApiData();
        else this.dataApi = JSON.parse(fs.readFileSync('data/flightData.json', 'utf8'));

        // GENERATE FLIGHT META DATA BASED ON API DATA
        this.processApiData();
    }

    static isDataOutdated(interval, tolerance = 60000) {

        /* isDataOutdated =========================================
           Checks whether flightData.json is missing or older
           than the given interval                                */

        const fs = require('fs');
        if (!fs.existsSync('data/flightData.json')) return true;

        var age = Date.now() - fs.statSync('data/flightData.json').mtimeMs;
        return age >= (interval - tolerance);
    }

    static fetchApiData() {

        /* fetchApiData ==========================================
           Gets flight info                                     */
    
        const fs            = require('fs');
        var urlApi          = 'https://'         + this.apiHost + '/flights/airports/iata/' + this.apiHome + '?' + 
                              'offsetMinutes='   + this.apiOffsetMin + '&' + 
                              'durationMinutes=' + this.apiDurationMin + '&' + 
                              'direction='       + this.apiDirection + '&' + 
                              'withLeg='         + this.apiWithLeg.toString() + '&' + 
                              'withCancelled='   + this.apiWithCancelled.toString() + '&' + 
                              'withCodeshared='  + this.apiCodeshared.toString() + '&' + 
                              'withCargo='       + this.apiCargo.toString() + '&' + 
                              'withPrivate='     + this.apiPrivate.toString() + '&' + 
                              'withLocation='    + this.apiWithLocation.toString();

        //var logEntry        = { timestamp: (new Date(Date.now())).toLocaleString('de-DE'), url: urlApi };
        //fs.appendFileSync('data/flightApiLog.json', JSON.stringify(logEntry) + '\n');

        fetch(urlApi, {
            method:     'GET',
            headers:    { 'X-RapidAPI-Key': this.apiKey, 'X-RapidAPI-Host': this.apiHost }
        })
        .then(res   => res.json())
        .then(data  => { 
            this.saveData(data);
            return true;
        })
        .catch(err  => {
            this.app.Util.print(this, 'Error fetching ' + this.name + ' API data: ' + err.message + '\n\n' + err.stack + '\n\n')
            return false;
        });
    }

    static saveData(data) {

        /* saveData ========================================
           Saves Data retrieved from AeroBox API.          */

        const fs        = require('fs');        

        this.dataApi    = typeof data === 'string' ? JSON.parse(data) : data; 
        fs.writeFileSync('data/flightData.json', JSON.stringify(this.dataApi));
    }

    static processApiData() {

        /* processApiData =====================================
           Processes Api Data for flight matching             */

        const fs        = require('fs');
        var returnValue = { };

        if (this.dataApi != null && this.dataApi.departures != undefined) this.dataApi.departures.forEach(flight => {
            if (flight.aircraft != undefined && flight.airline != undefined && flight.arrival != undefined) {

                var flightObject    = this.getFlightObject(flight);
                if (flight.departure.revisedTime != undefined && flight.departure.revisedTime.utc != undefined) {
                    var timecode        = flight.departure.revisedTime.utc.replace(' ', 'T');
                } else {
                    var timecode        = 'always';
                }

                // SAVE WITH HEX
                if (flight.aircraft.modeS != undefined) {
                    if (returnValue[flight.aircraft.modeS] == undefined) returnValue[flight.aircraft.modeS] = { };
                    returnValue[flight.aircraft.modeS][timecode] = flightObject;
                }                

                // SAVE WITH CALLSIGN
                if (flight.callSign != undefined) {
                    if (returnValue[flight.callSign] == undefined) returnValue[flight.callSign] = { };
                    returnValue[flight.callSign][timecode] = flightObject;
                }   

                // SAVE WITH FLIGHT NUMBER
                var flightNumber = this.getFlightNumberAsCallsign(flight);
                if (flightNumber != null) {
                    if (returnValue[flightNumber] == undefined) returnValue[flightNumber] = { };
                    returnValue[flightNumber][timecode] = flightObject;
                }
            }
        }); else {
            this.app.Util.print(this, 'No departures found in API data\n\n' + JSON.stringify(this.dataApi) + '\n');
        }
    
        const presets   = JSON.parse(fs.readFileSync('data/flightMetaPresets.json', 'utf8'));
        Object.getOwnPropertyNames(presets).forEach(preset => { returnValue[preset] = presets[preset]; });
        
        this.dataFlight = returnValue;
        
        if (this.app.isVerbose(this.id)) this.app.Util.print(this, 'Save meta data to local file.');
        fs.writeFileSync('data/flightMetaData.json', JSON.stringify(this.dataFlight));

    }

    static getFlightNumberAsCallsign(flight) {

        /* getFlightNumberAsCallsign ===========================
           Returns flight number as callsign for aircraft      */

        if (flight.number != undefined) {
           var number = flight.number.split(' ')[1];
            
           if (flight.airline != undefined && flight.airline.icao != undefined) return flight.airline.icao + number;
           else return null;

        } else return null;

    }

    static getFlightObject(flight) {

        /* getFlightObject =====================================
           Returns flight object for aircraft                  */

        return {
            airline:    this.altAirlineName(flight.airline.name) ?? null,
            iata:       flight.airline.iata ?? null,
            number:     flight.number ?? null,
            type:       flight.aircraft.model ?? null,
            reg:        flight.aircraft.reg ?? null,
            from:       'Frankfurt',
            to:         this.altDestinationName(flight.arrival.airport.name) ?? null
        }

    }


    static altDestinationName(destinationName) {
        
        /* altDestinationName ===================================
           Returns alternative name for destination airlines    */

        switch (destinationName.toLowerCase()) {

            case 'bâle/mulhouse': return 'Basel';
            default: return destinationName;            
        }

    }

    static altAirlineName(airlineName) {
        
        /* altAirlineName ======================================
           Returns alternative name for certain airlines       */

        switch (airlineName.toLowerCase()) {

            case 'eurowings discover': return 'Discover';
            default: return airlineName;            
        }

    }

    static getCurrentFlights(latStart, latEnd, lonStart, lonEnd, altBelow = 6000) {

        /* getCurrentFlights ==================================
           Parse recent flights from aircraft data            */

        var recentFlights   = [ ];

        if (this.data.aircraft != undefined) this.data.aircraft.forEach(aircraft => {
            if (aircraft.flight != undefined) {
                // GET FLIGHTS IN BOUNDING BOX
                if (aircraft.lat >= latStart && aircraft.lat <= latEnd && aircraft.lon >= lonStart && aircraft.lon <= lonEnd && aircraft.alt_baro <= altBelow) {
                    recentFlights.push(this.getFlight(aircraft));
                }        
            }
        });

        return recentFlights;
    }

    static getFlight(aircraft) {

        /* getFlight ===========================================
           Returns flight object for aircraft                 */

        var returnObject = { ...{
            icao:           aircraft.hex,
            callSign:       aircraft.flight.trim(),
            alt:            aircraft.alt_baro,
            vert:           aircraft.baro_rate,
            airlineCode:    aircraft.flight.substring(0, 3)
        }, ...this.addMetaData(aircraft)}
        
        // DEBUG MESSAGE
        if (this.app.isVerbose(this.id)) this.app.Util.print(this, 'New flight object: ' + JSON.stringify(returnObject));
        return returnObject;
    }

    static addMetaData(aircraft) {

        /* addMetaData =========================================
           Adds meta data from API to flight                   */

        var returnObject    = { };
        var flightDataGroup = this.getDataGroup(aircraft);

        if (flightDataGroup != undefined && flightDataGroup != null) {
            
            // ADD META DATA FROM API TO FLIGHT
            var timecodes           = Object.getOwnPropertyNames(flightDataGroup);
            var timecode            = this.findClosest(timecodes) || 'always';
    
            if (flightDataGroup[timecode] != undefined) return {
                airline:   flightDataGroup[timecode].airline,
                number:    flightDataGroup[timecode].number,
                type:      flightDataGroup[timecode].type.replace('(Sharklets)', '').split('-')[0],
                from:      flightDataGroup[timecode].from,
                to:        flightDataGroup[timecode].to
            }
        }
            
        // RETURN DEFAULT IF NO META DATA AVAILABLE
        return this.addDefaultMetaData(aircraft);
    }

    static getDataGroup(aircraft) {

        /* getDataGroup ========================================
           Returns flight data group for aircraft              */

        if (this.dataFlight != undefined && this.dataFlight[aircraft.hex.toUpperCase()] != undefined)
            return this.dataFlight[aircraft.hex.toUpperCase()];
        else if (this.dataFlight != undefined && aircraft.flight != undefined && this.dataFlight[aircraft.flight.toUpperCase().trim()] != undefined)
            return this.dataFlight[aircraft.flight.toUpperCase().trim()];
        else return null;
        
    }

    static addDefaultMetaData(aircraft) {

        /* addDefaultMetaData ==================================
           Adds default meta data to flight                  */

        return { 
            airline:    this.airlines[aircraft.flight.substring(0, 3)] ?? '',
            number:     aircraft.flight.substring(0, 3) + ' ' + aircraft.flight.substring(3),
            from:       'Frankfurt',
            to:         '???',
            type:       ''
        };
    }

    static cacheCurrentFlights(targetId, recentFlights) {

        /* cacheCurrentFlights ================================
           Sets recent flights to global state               */

        var hasChanged      = false;

        if (this.flightsRecent[targetId] == undefined) this.flightsRecent[targetId] = [ ];
        if (JSON.stringify(this.flightsRecent[targetId]) != JSON.stringify(recentFlights) && recentFlights.length > 0) {
            this.flightsRecent[targetId]    = recentFlights;
            this.flightsTimestamp[targetId] = Date.now();
            hasChanged                      = true;
        }

        // REMOVE OLDER ENTRIES
        if ((Date.now() - this.flightsTimestamp[targetId]) >= (1000 * 60 * 2)) {
            this.flightsRecent[targetId]    = [ ];
            this.flightsTimestamp[targetId] = null;
            hasChanged                      = true;
        }

        return hasChanged;
    }

    /* Handle ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    static handle(scope, sender, payload) {
        
        /* handle ================================================
                                                                */
        
    }

    /* API ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */   
    static handleApi(req, res, scope, sender, func, url, exceptions = [ ], post) {

        /* handleApi =============================================
           Handle module specific API responses                  */

        var results = null;
        switch (func) {
            // GET
            case 'getbulk': 
            case 'getstate': 
                var deviceIds = (func == 'getbulk' ? url.searchParams.get('bindings') : [ (url.searchParams.get('deviceId') ?? url.searchParams.get('groupId')) + (func == 'getstate' ? '.state' : '') ]);
                JSON.parse(deviceIds).forEach(deviceId => {
                    if (this.enabledSubscriptions.includes(deviceId)) {
                        if (results == null) results = [ ];
                        
                        var returnValue = this.subscriptions.filter(sub => sub.id == deviceId)[0].asString ? this.getAsString(deviceId) : this.flightsRecent[deviceId];
                        results.push({ id: deviceId, val: returnValue });
                    }
                });
                break;

        }
        return results;
    }

    /* Helper Functions ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    static getAsString(id) {

        /* getAsString ===========================================
           Returns current flight as string                  */

        if (this.flightsRecent[id] == undefined || this.flightsRecent[id].length == 0) return '';
        else {
            // RETURN MOST RECENT FLIGHT AS STRING
            var lastFlight = this.flightsRecent[id][0];
            if (lastFlight.airlineCode != undefined) {
                var style        = 'filter: brightness(0) invert(1); height: 100%; padding-right: 20px; vertical-align: middle;';
                var imageElement = '<img src="img/airlines/' + lastFlight.airlineCode.toUpperCase() + '.png" style="' + style + '" onerror="this.style.display=\'none\';"></img>';
            } else {
                var imageElement = '';
            }

            return imageElement + (lastFlight.airline != undefined && lastFlight.airline != null && lastFlight.airline != '' ? lastFlight.airline + ' | ' + lastFlight.number : lastFlight.number.replaceAll(' ', '')) + (lastFlight.to == '???' ? '' : ' | ' + lastFlight.to) + (lastFlight.type != '' ? ' | ' + lastFlight.type : '');
        }
    }

    static findClosest(timecodes) {
  
        /* findClosest =========================================
           Finds closest timecode to current time              */

        const now   = new Date(); // Lokale Systemzeit, intern aber immer UTC
        let closest = null;
        let minDiff = Infinity;

        for (const tc of timecodes) {
            const date = new Date(tc); // ISO 8601 kompatibel machen
            const diff = Math.abs(date - now); // Differenz in Millisekunden

            if (diff < minDiff) {
                minDiff = diff;
                closest = tc;
            }
        }

        return closest;
    }
}

module.exports = moduleFlight;

