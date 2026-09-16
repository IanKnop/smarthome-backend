# Smart Home NexGen Backend

Node.js backend for controlling and automating a smart home. The application consists of a central module loader (`modules.js`) that initializes individual, independent modules (`modules/*.module.js`) and wires them together via shared scopes (e.g. `light`, `motion`, `switch`, `climate`, ...). Status and configuration data is stored as JSON files in the `data/` folder.

## Getting started

```bash
npm install
npm start
```

Before the first start, copy the sample configuration files in `data/` (see below, files with `.sample` in their name) and fill them in with your own credentials/device IDs.

## Architecture

- `main.js` – Entry point, holds the global state (`Global.Status`, `GroupState`, `Motion`, `Climate`, `Sensors`), loads/saves the status cache (`data/status.cache`), and provides helper functions such as `getConfig`, `getCredentials` and `setStatus`.
- `modules.js` – Loads and initializes all enabled modules, dispatching incoming messages to the responsible modules based on their `scopes`.
- `util.js` – General helper functions (logging, requirement checks, expression parsing, ...).
- `modules/*.module.js` – The individual feature modules (see below).

Modules communicate via `handle(scope, sender, payload)` and `handleApi(...)` (for HTTP API calls), exchanging most messages over MQTT.

## Modules

- **mqtt** – MQTT broker connection, central message distribution between devices and modules.
- **console** – Interactive command line for debugging and administrative commands (`set`, `show`, `ls`, `count`, `test`, `verbose`, `cache`, `restart`, ...).
- **log** – Logging of sensor and system events.
- **http** – HTTP server/client for API endpoints and outgoing requests (e.g. to Shelly devices).
- **websocket** – Push communication to the frontend (live updates, e.g. camera preview).
- **power** – Collection/logging of power/consumption data.
- **config** – Generic access to `data/config.json` (configuration values and other modules' credentials).

### zigbee.module.js

Controls and reads Zigbee devices (lights, groups, sensors, valves, window/door contacts, switches) via **Zigbee2MQTT**. The module requires a working Zigbee2MQTT installation, which it talks to over MQTT — the actual radio communication with the Zigbee devices is handled by Zigbee2MQTT, while this module only processes the MQTT messages (setting/reading status, recalling scenes, logging motion/climate events, timeout handling for timed on/off switching).

### heating.module.js

Controls room-by-room heating via **Shellys**, i.e. WiFi-controllable switches, addressed via an HTTP relay call (`http://<device-ip>/relay/0?turn=on|off`). Based on heating profiles (`data/heating.json`, see `data/heatingDevices.sample.json` for the device mapping), heating is switched on/off depending on target temperature, tolerance, and optionally the state of associated window contacts (heating stops when a window is open).

### tuya.module.js

Connects Tuya-based devices (e.g. smart plugs). Control happens primarily locally via the Tuya protocol (`tuyapi`), with automatic reconnection on connection loss. The Tuya Cloud API is used for initial setup (syncing the device list and local keys) and as a cloud fallback if the local connection fails — **this requires a Tuya Developer account** (with an access key/secret key on the Tuya IoT Platform), whose credentials are stored in `data/config.json` (`credentials.tuya`). The device inventory is kept in `data/tuyaDevices.json` (sample: `data/tuyaDevices.sample.json`).

### reolink.module.js

Connects Reolink surveillance cameras/doorbells. Receives alarm events (motion, doorbell) and forwards them as a preview push message to the frontend (`transferDoorbellAlarm`); it can also list surveillance videos from the filesystem. Credentials live in `data/config.json` (`credentials.reolink`), the device list in `data/reolinkDevices.json` (sample: `data/reolinkDevices.sample.json`).

### flight.module.js

Receives flight data from a local ADS-B receiver (e.g. `dump1090`/`readsb`, JSON endpoint) and enriches nearby flights via the AeroDataBox API with additional information (airline, destination, aircraft type) — useful e.g. for announcements or displaying nearby overflights. Requires an AeroDataBox API key (RapidAPI) in `data/config.json` (`credentials.aerodatabox`).

### automation.module.js

Core module for rule-based automations (e.g. light on motion, schedules, switch actions, Alexa voice control). Automations are defined in `data/automations.json` (sample structure: `data/automations.sample.json`) and re-read on startup and periodically thereafter (`data/automations.parsed.json` contains the resolved version for debugging purposes).

An automation is a JSON object with the following core fields:

- `id` – Unique ID (assigned automatically for new entries).
- `description` – Free-text description.
- `sensor` – Triggering sensor/switch (e.g. `motion/hallway_1`, `switch/kitchen`), or `virtual/time` for time-based automations, or `virtual/alexa` for voice control.
- `enabled` – Whether the automation is active (`true`/`false`/`"1"`/`"0"`).
- `weekdays` – Array of 7 booleans (Sunday–Saturday) indicating on which weekdays the automation is active.
- `startDate` / `endDate` – Validity period.
- `timeStart` / `timeEnd` – Time-of-day window (`hh:mm:ss`) during which the automation is active (can span midnight).
- `conditionProvider` – Determines which value from the incoming payload is used as the condition key into `conditions` (e.g. `occupancy`, `action`, `timeCode`; multiple can be combined with `;`).
- `conditions` – Object whose keys are matched against the value of `conditionProvider` (operators such as `<|20` for "less than 20" are supported). The value is either a single action or an array of actions.
- `group` – Zigbee group/device the automation targets by default.
- `trigger` – Optional: forwards processing to another sensor (e.g. to treat a second motion sensor like the first).
- `requirements` – Additional conditions (e.g. illuminance below a threshold, state of another group) that are checked before execution.

An action (entry in `conditions`) can contain, among others:

- `scene` – Scene ID to recall (via Zigbee2MQTT `scene_recall`).
- `set` – Directly setting properties (e.g. `{ "state": "on" }`, `brightness_step`, `toggle`).
- `http` – Executing an HTTP request (e.g. to control a Shelly relay or an internal API endpoint).
- `duration` / `fading` / `fadingDuration` – Automatically switching off or dimming down after the given time (seconds) has elapsed.
- `killPrevious` / `killDelay` / `killFade` – Controls whether/how previously related automations are stopped.

Time-based automations (`sensor: "virtual/time"`) use special timecodes as condition keys instead of fixed times, e.g.:

- `AAhhmmss` – Fixed time of day (e.g. `AA220000` = 10:00 PM).
- `XSmmss` / `YSmmss` – Time offset before (`X`) or after (`Y`) sunset.
- `XRhhmmss` / `YRhhmmss` – Time offset before (`X`) or after (`Y`) sunrise.

These are scheduled at startup as `setTimeout` calls for the next matching point in time (`initVirtualTime`).

## Data directory (`data/`)

The `data/` folder contains runtime-generated status data, caches, logs, and device-/account-specific configuration files with sensitive credentials, and is therefore **not** version-controlled (see `.gitignore`). Only sample/template files (`*.sample.*`) are included, from which the actually required files (`config.json`, `automations.json`, `heatingDevices.json`, `tuyaDevices.json`, `reolinkDevices.json`, ...) can be created.
