/**
 * Module: MMM-Hue-Motion-Screensaver
 * Description: Controls the MagicMirror screen based on motion detected via a Hue Motion Sensor.
 */

Module.register("MMM-Hue-Motion-Screensaver", {
    defaults: {
        hueHost: "", // Hostname oder IP-Adresse der Hue Bridge
        sensorId: "", // Sensor-ID
        apiKey: "", // API-Schlüssel
        coolDown: 5 * 60, // Cooldown in Sekunden
        startTime: "06:00",
        endTime: "00:00",
        pollInterval: 2000 // Intervall zur Abfrage des Sensors in ms
    },

    start: function () {
        this.log("Starting module: " + this.name);
        this.lastAction = new Date();
        this.state = -1;
        this.nextScreenOffTime = null; // Zeitpunkt, wann der Bildschirm ausgeschaltet wird
        this.scheduleUpdate();
    },

    getStyles: function () {
        return ["Hue-Motion-Screensaver.css"];
    },

    scheduleUpdate: function () {
        setInterval(() => {
            this.checkMotion();
        }, this.config.pollInterval);
    },

    checkMotion: function () {
        const pirUrl = `https://${this.config.hueHost}/clip/v2/resource/motion/${this.config.sensorId}`;
        const headers = {
            "hue-application-key": this.config.apiKey
        };

        this.sendSocketNotification("CHECK_MOTION", {
            pirUrl,
            headers,
            certPath: "/home/zaro/Pir/hue_bridge_cert.pem"
        });
    },

    socketNotificationReceived: function (notification, payload) {
        if (notification === "MOTION_RESULT") {
            this.handleMotionResult(payload);
        }
    },

    handleMotionResult: function (motion) {
        const now = new Date();
        const isWithinTimeRange = this.isWithinTimeRange(
            this.config.startTime,
            this.config.endTime
        );

        if (motion) {
            this.lastAction = now;
            this.nextScreenOffTime = new Date(
                now.getTime() + this.config.coolDown * 1000
            );
            if (this.state !== 1) {
                this.state = 1;
                this.toggleScreen(true);
            }
        } else if (
            !motion &&
            (now - this.lastAction) > this.config.coolDown * 1000
        ) {
            if (isWithinTimeRange) {
                this.log("SCREEN OFF command ignored due to time range");
            } else {
                this.state = 0;
                this.toggleScreen(false);
                this.nextScreenOffTime = null;
            }
        } else {
            this.state = 2; // Zustand für Timer-Anzeige
        }

        this.updateDom(); // Aktualisiere die Anzeige
    },

    toggleScreen: function (on) {
        this.sendSocketNotification("TOGGLE_SCREEN", on);
    },

    isWithinTimeRange: function (startTime, endTime) {
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();

        const [startHour, startMinute] = startTime.split(":").map(Number);
        const [endHour, endMinute] = endTime.split(":").map(Number);

        const start = startHour * 60 + startMinute;
        const end = endHour * 60 + endMinute;

        if (start <= end) {
            return currentTime >= start && currentTime <= end;
        } else {
            return currentTime >= start || currentTime <= end;
        }
    },

    getDom: function () {
        const wrapper = document.createElement("div");
        wrapper.className = "screen-saver-wrapper"; // CSS-Klasse hinzufügen
    
        if (this.state === 1) {
            wrapper.innerHTML = "Motion detected";
        } else if (this.state === 2 && this.nextScreenOffTime) {
            const now = new Date();
            const timeRemaining = Math.max(0, Math.floor((this.nextScreenOffTime - now) / 1000));
            const minutes = String(Math.floor(timeRemaining / 60)).padStart(2, '0');
            const seconds = String(timeRemaining % 60).padStart(2, '0');
            wrapper.innerHTML = `Screen off in: ${minutes}:${seconds}`;
        } else {
            wrapper.innerHTML = "Screen is active";
        }
        return wrapper;
    },

    log: function (message) {
        Log.info(`[${this.name}] ${message}`);
    },

    logError: function (message, error) {
        Log.error(`[${this.name}] ${message}`, error);
    }
});