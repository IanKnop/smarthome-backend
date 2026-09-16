# Smart Home NexGen Backend

Node.js-Backend für die Steuerung und Automatisierung eines Smart Homes. Die Anwendung besteht aus einem zentralen Modul-Loader (`modules.js`), der einzelne, unabhängige Module (`modules/*.module.js`) initialisiert und über gemeinsame Scopes (z. B. `light`, `motion`, `switch`, `climate`, ...) miteinander verdrahtet. Status- und Konfigurationsdaten liegen als JSON-Dateien im Ordner `data/`.

## Start

```bash
npm install
npm start
```

Vor dem ersten Start müssen die Beispiel-Konfigurationsdateien in `data/` (siehe unten, Dateien mit `.sample` im Namen) kopiert und mit den eigenen Zugangsdaten/Geräte-IDs befüllt werden.

## Architektur

- `main.js` – Einstiegspunkt, hält globalen Status (`Global.Status`, `GroupState`, `Motion`, `Climate`, `Sensors`), lädt/speichert den Status-Cache (`data/status.cache`) und stellt Hilfsfunktionen wie `getConfig`, `getCredentials` und `setStatus` bereit.
- `modules.js` – Lädt und initialisiert alle aktivierten Module, verteilt eingehende Nachrichten anhand ihrer `scopes` an die zuständigen Module.
- `util.js` – Allgemeine Hilfsfunktionen (Logging, Requirement-Prüfung, Ausdrucksauswertung, ...).
- `modules/*.module.js` – Die einzelnen Fachmodule (siehe unten).

Module kommunizieren über `handle(scope, sender, payload)` bzw. `handleApi(...)` für HTTP-API-Aufrufe und tauschen Nachrichten größtenteils über MQTT aus.

## Module

- **mqtt** – MQTT-Broker-Anbindung, zentrale Nachrichtenverteilung zwischen Geräten und Modulen.
- **console** – Interaktive Kommandozeile für Debugging und administrative Befehle (`set`, `show`, `ls`, `count`, `test`, `verbose`, `cache`, `restart`, ...).
- **log** – Protokollierung von Sensor- und Systemereignissen.
- **http** – HTTP-Server/-Client für API-Endpunkte und ausgehende Requests (z. B. an Shelly-Geräte).
- **websocket** – Push-Kommunikation zum Frontend (Live-Updates, z. B. Kamera-Vorschau).
- **power** – Erfassung/Protokollierung von Energie-/Verbrauchsdaten.
- **config** – Generischer Zugriff auf `data/config.json` (Konfigurationswerte und Zugangsdaten anderer Module).

### zigbee.module.js

Steuert und liest Zigbee-Geräte (Lampen, Gruppen, Sensoren, Ventile, Fenster-/Türkontakte, Schalter) über **Zigbee2MQTT**. Das Modul setzt eine lauffähige Zigbee2MQTT-Installation voraus, die per MQTT eingebunden wird – die eigentliche Funk-Kommunikation mit den Zigbee-Geräten übernimmt Zigbee2MQTT, dieses Modul verarbeitet nur die MQTT-Nachrichten (Status setzen/lesen, Szenen aufrufen, Bewegungs-/Klima-Events loggen, Timeout-Handling für zeitgesteuertes Ein-/Ausschalten).

### heating.module.js

Steuert die Heizung raumweise über **Shellys**, also WLAN-fähige Zwischenstecker/Schalter, die per HTTP-Relais-Aufruf (`http://<device-ip>/relay/0?turn=on|off`) angesprochen werden. Auf Basis von Heizprofilen (`data/heating.json`, siehe `data/heatingDevices.sample.json` für die Gerätezuordnung) wird die Heizung ein-/ausgeschaltet, abhängig von Zieltemperatur, Toleranz und optional dem Zustand zugehöriger Fensterkontakte (Heizung stoppt bei geöffnetem Fenster).

### tuya.module.js

Bindet Tuya-basierte Geräte (z. B. Steckdosen) an. Die Steuerung erfolgt primär lokal über das Tuya-Protokoll (`tuyapi`), mit automatischem Wiederverbindungsversuch bei Verbindungsabbruch. Für die Ersteinrichtung (Abgleich der Geräteliste und lokalen Schlüssel) sowie als Cloud-Fallback, falls die lokale Verbindung fehlschlägt, wird die Tuya Cloud API genutzt – **hierfür ist ein Tuya-Developer-Account** (mit Access Key/Secret Key auf der Tuya IoT Platform) erforderlich, dessen Zugangsdaten in `data/config.json` (`credentials.tuya`) hinterlegt werden. Der Gerätebestand wird in `data/tuyaDevices.json` gepflegt (Beispiel: `data/tuyaDevices.sample.json`).

### reolink.module.js

Bindet Reolink-Überwachungskameras/-Türklingeln an. Nimmt Alarm-Events (Bewegung, Klingel) entgegen und leitet sie als Vorschau-Push-Nachricht ans Frontend weiter (`transferDoorbellAlarm`); zusätzlich können Überwachungsvideos aus dem Dateisystem gelistet werden. Zugangsdaten liegen in `data/config.json` (`credentials.reolink`), die Geräteliste in `data/reolinkDevices.json` (Beispiel: `data/reolinkDevices.sample.json`).

### flight.module.js

Empfängt Flugdaten von einem lokalen ADS-B-Empfänger (z. B. `dump1090`/`readsb`, JSON-Endpunkt) und reichert nahegelegene Flüge über die AeroDataBox-API mit Zusatzinformationen (Airline, Ziel, Flugzeugtyp) an – nützlich z. B. für Ansagen oder Anzeige naher Überflüge. Erfordert einen AeroDataBox-API-Key (RapidAPI) in `data/config.json` (`credentials.aerodatabox`).

### automation.module.js

Kernmodul für regelbasierte Automatisierungen (z. B. Licht bei Bewegung, Zeitpläne, Schalter-Aktionen, Alexa-Sprachsteuerung). Automatisierungen werden in `data/automations.json` definiert (Beispiel-Struktur: `data/automations.sample.json`) und beim Start bzw. periodisch neu eingelesen (`data/automations.parsed.json` enthält die aufgelöste Fassung zu Debug-Zwecken).

Eine Automatisierung ist ein JSON-Objekt mit folgenden zentralen Feldern:

- `id` – Eindeutige ID (wird bei neuen Einträgen automatisch vergeben).
- `description` – Freitext-Beschreibung.
- `sensor` – Auslösender Sensor/Schalter (z. B. `motion/hallway_1`, `switch/kitchen`) oder `virtual/time` für zeitgesteuerte Automatisierungen bzw. `virtual/alexa` für Sprachsteuerung.
- `enabled` – Automatisierung aktiv (`true`/`false`/`"1"`/`"0"`).
- `weekdays` – Array mit 7 Booleans (Sonntag–Samstag), an welchen Wochentagen die Automatisierung aktiv ist.
- `startDate` / `endDate` – Gültigkeitszeitraum.
- `timeStart` / `timeEnd` – Tageszeitfenster (`hh:mm:ss`), in dem die Automatisierung aktiv ist (kann über Mitternacht reichen).
- `conditionProvider` – Bestimmt, welcher Wert aus dem eingehenden Payload als Bedingungs-Schlüssel für `conditions` verwendet wird (z. B. `occupancy`, `action`, `timeCode`; mehrere per `;` kombinierbar).
- `conditions` – Objekt, dessen Schlüssel mit dem Wert von `conditionProvider` abgeglichen werden (auch mit Operatoren wie `<|20` für "kleiner 20"). Der Wert ist entweder eine einzelne Aktion oder ein Array von Aktionen.
- `group` – Zigbee-Gruppe/Gerät, auf die sich die Automatisierung standardmäßig bezieht.
- `trigger` – Optional: leitet die Verarbeitung an einen anderen Sensor weiter (z. B. um einen zweiten Bewegungsmelder wie den ersten zu behandeln).
- `requirements` – Zusätzliche Bedingungen (z. B. Helligkeit unterhalb eines Schwellwerts, Zustand einer anderen Gruppe), die vor Ausführung geprüft werden.

Eine Aktion (Eintrag in `conditions`) kann u. a. enthalten:

- `scene` – Aufzurufende Szenen-ID (per Zigbee2MQTT `scene_recall`).
- `set` – Direktes Setzen von Eigenschaften (z. B. `{ "state": "on" }`, `brightness_step`, `toggle`).
- `http` – Ausführen eines HTTP-Requests (z. B. zur Steuerung eines Shelly-Relais oder eines internen API-Endpunkts).
- `duration` / `fading` / `fadingDuration` – Automatisches Abschalten bzw. Abdimmen nach Ablauf der angegebenen Zeit (Sekunden).
- `killPrevious` / `killDelay` / `killFade` – Steuerung, ob/wie vorherige, in Beziehung stehende Automatisierungen beendet werden.

Zeitgesteuerte Automatisierungen (`sensor: "virtual/time"`) verwenden als Bedingungs-Schlüssel spezielle Timecodes statt fester Uhrzeiten, z. B.:

- `AAhhmmss` – Feste Uhrzeit (z. B. `AA220000` = 22:00 Uhr).
- `XSmmss` / `YSmmss` – Zeitversatz vor (`X`) bzw. nach (`Y`) Sonnenuntergang.
- `XRhhmmss` / `YRhhmmss` – Zeitversatz vor (`X`) bzw. nach (`Y`) Sonnenaufgang.

Diese werden beim Start als `setTimeout` auf den nächsten passenden Zeitpunkt eingeplant (`initVirtualTime`).

## Datenverzeichnis (`data/`)

Der Ordner `data/` enthält laufzeitgenerierte Statusdaten, Caches, Logs sowie geräte-/kontospezifische Konfigurationsdateien mit sensiblen Zugangsdaten und wird daher **nicht** versioniert (siehe `.gitignore`). Enthalten sind lediglich Beispiel-/Vorlagendateien (`*.sample.*`), anhand derer die tatsächlich benötigten Dateien (`config.json`, `automations.json`, `heatingDevices.json`, `tuyaDevices.json`, `reolinkDevices.json`, ...) angelegt werden können.
