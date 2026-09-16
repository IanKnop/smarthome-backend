/* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
   KNOP.FAMILY Consulting
   Smart Home NexGen Backend
   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
   Module: Log
   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */

class moduleLog {

    static id           = 'log';
    static name         = 'Logging';
    static type         = 'Module';

    static app          = null;
    static parent       = null;
    static db           = null;
    static sqlite3      = require('sqlite3');
    static config       = {
        filename:        'data/log',
        mode:            null // use default mode
    };

    static scopes       = [ ];
    static structure    = [ ];
    
    /* Init ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    static init() {

        /* init ==================================================
           Initialize module                                     */
        try {
            this.db = new this.sqlite3.Database(this.config.filename, this.config.mode || this.sqlite3.OPEN_READWRITE | this.sqlite3.OPEN_CREATE, (err) => {
                if (err) {
                    this.app.Util.print(this, 'Connection Error: ' + err.message);
                } else {
                    this.app.Util.print(this, `Connected SQLite DB: ${this.config.filename}`);

                    // CREATE DATABASE STRUCTURE
                    const fs        = require('fs');
                    this.structure  = JSON.parse(fs.readFileSync('data/logStructure.json'));
                    this.structure.forEach(table => { 
                        this.createTable(table.table, this.getColumnsSQL(table));
                        table.fields.forEach(field => {
                            this.addColumnIfNotExists(table.table, field.id, field.type);
                        })
                    });
                }
            });
        } catch (err) {
            this.app.Util.print(this, 'Connection Error: ' + err.message);
        }
    }

    /* Handle ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
    static handle(scope, sender, payload) {
        
        /* handle ================================================
           Used to log sensor activities                         */
        
        if (payload == null) {
            
        } else {
            var now = Date.now();
            payload = { ...payload, 
                        ...{
                            ts:     now.toString(),
                            date:   (new Date(now)).toLocaleDateString('de-DE', { day: "2-digit", month: "2-digit", year: "numeric" }),
                            time:   (new Date(now)).toLocaleTimeString('de-DE')
                        }
                      };
                      
            // INSERT LOG ENTRY (sender = log target i.e. climatelog)
            this.insert(sender, payload);
        }
    }

    static async printLog(type, limit = 10, sensor = null) {

        var log = await this.query('SELECT * FROM ' + type.toLowerCase() + 'log' + (sensor != null ? ' WHERE sensor = "' + sensor + '"' : '') + ' ORDER BY ts DESC ' + (limit != false ? ' LIMIT ' + limit : ''));

        if (type == 'climate') 
            this.app.Util.printAsTable(log, [ 'id', 'sensor', 'date', 'time', 'temperature', 'humidity', 'pressure' ], [ 9, 25, 10, 10, 11, 8, 8 ]);
        else if (type == 'motion') 
            this.app.Util.printAsTable(log, [ 'id', 'sensor', 'date', 'time' ], [ 9, 25, 10, 10 ]);
        else if (type == 'power') 
            this.app.Util.printAsTable(log, [ 'id', 'sensor', 'date', 'time', 'value' ], [ 9, 25, 10, 10, 10 ]);
         else if (type == 'lateflight') 
            this.app.Util.printAsTable(log, [ 'id', 'date', 'time', 'airline', 'number', 'departure', 'arrival', 'type' ], [ 9, 10, 10, 20, 5, 20, 20, 20 ]);
    }

    static getColumnsSQL(table) {

        var returnValue = '';
        table.fields.forEach(field => {
            returnValue += field.id + ' ' + field.type.toUpperCase() + (field.key != undefined && field.key ? ' PRIMARY KEY': '') /*+ (field.auto != undefined && field.auto ? ' AUTOINCREMENT': '')*/ + ',';
        });
        returnValue = returnValue.slice(0, -1);

        return returnValue;
    }

    static query(sql, params = []) {
        /* query =================================================
           Database Query (returns Promise)                      */
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    static async find(table, where = {}) {
        const keys   = Object.keys(where);
        const sql    = keys.length
            ? `SELECT * FROM ${table} WHERE ${keys.map(k => `${k} = ?`).join(' AND ')}`
            : `SELECT * FROM ${table}`;
        return this.query(sql, Object.values(where));
    }

    static async insert(table, data) {
        const keys = Object.keys(data);
        const sql  = 'INSERT INTO ' + table + ' (' + keys.join(', ') + ') VALUES (' + keys.map(() => '?').join(', ') + ')';
        return new Promise((resolve, reject) => {
            this.db.run(sql, Object.values(data), function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
        });
    }

    static async update(table, data, where) {
        const setKeys   = Object.keys(data);
        const whereKeys = Object.keys(where);
        const sql = `UPDATE ${table} SET ${setKeys.map(k => `${k} = ?`).join(', ')} WHERE ${whereKeys.map(k => `${k} = ?`).join(' AND ')}`;
        return new Promise((resolve, reject) => {
            this.db.run(sql, [...Object.values(data), ...Object.values(where)], function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    }

    static async delete(table, where) {
        const keys = Object.keys(where);
        const sql  = `DELETE FROM ${table} WHERE ${keys.map(k => `${k} = ?`).join(' AND ')}`;
        return new Promise((resolve, reject) => {
            this.db.run(sql, Object.values(where), function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    }

    /**
     * Legt eine neue Tabelle an
     * @param {string} tableName
     * @param {string} columnsSQL - z.B. "id INTEGER PRIMARY KEY, name TEXT"
     * @returns {Promise<void>}
     */
    static async createTable(tableName, columnsSQL) {
        const sql   = 'CREATE TABLE IF NOT EXISTS ' + tableName + ' (' + columnsSQL + ')';

        return new Promise((resolve, reject) => {
            this.db.run(sql, function(err) {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    /**
     * Prüft, ob eine Spalte existiert, und legt sie ggf. an
     * @param {string} tableName
     * @param {string} columnName
     * @param {string} columnType - z.B. "TEXT", "INTEGER"
     * @returns {Promise<void>}
     */
    static async addColumnIfNotExists(tableName, columnName, columnType) {
        // Spalteninfos abfragen
        const sql       = 'PRAGMA table_info(' + tableName + ')';
        const columns   = await this.query(sql);
        const exists    = columns.some(col => col.name === columnName);
        
        if (!exists) {
            const alterSql = 'ALTER TABLE ' + tableName + ' ADD COLUMN ' + columnName + ' ' + columnType;
            return new Promise((resolve, reject) => {
                this.db.run(alterSql, function(err) {
                    if (err) reject(err);
                    else resolve();
                });
            });
        }
    }
}

module.exports = moduleLog;
