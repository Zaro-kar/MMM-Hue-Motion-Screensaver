// This file contains the main module logic for the MMM-Hue-Motion-Screensaver. 
// It handles motion detection, screen toggling, and time range checks. 
// The language texts are now referenced from separate JSON files.

const Log = require("logger");

Module.register("MMM-Hue-Motion-Screensaver", {
    defaults: {
        hueHost: "",
        sensorId: "",
        apiKey: "",
        coolDown: 5 * 60,
        startTime: "06:00",
        endTime: "00:00",
        pollInterval: 2000,
        activeDays: ["Sat", "Sun"],
        language: "en",
        certPath: ""
    },

    /**
     * Called when the module is started.
     */
    start: function () {
        this.log("Starting module: " + this.name);
        this.lastAction = new Date();
        this.state = -1;
        this.nextScreenOffTime = null;
        this.scheduleUpdate();
        this.loadLanguage();
    },

    /**
     * Loads the language strings from the JSON files.
     */
    loadLanguage: function () {
        const lang = this.config.language;
        const languageFile = `languages/${lang}.json`;
        fetch(languageFile)
            .then(response => response.json())
            .then(data => {
                this.languages = data;
                this.log("Loaded language file: " + languageFile);
            })
            .catch(error => {
                this.logError("Failed to load language file", error);
            });
    },

    /**
     * Returns the stylesheets used by this module.
     */
    getStyles: function () {
        return ["Hue-Motion-Screensaver.css"];
    },

    /**
     * Schedules the periodic update to check for motion.
     */
    scheduleUpdate: function () {
        setInterval(() => {
            this.checkMotion();
        }, this.config.pollInterval);
    },

    /**
     * Sends a socket notification to check for motion.
     */
    checkMotion: function () {
        this.sendSocketNotification("CHECK_MOTION", {
            hueHost: this.config.hueHost,
            sensorId: this.config.sensorId,
            apiKey: this.config.apiKey,
            certPath: this.config.certPath
        });
    },

    /**
     * Handles received socket notifications.
     * @param {string} notification - The notification type.
     * @param {any} payload - The payload of the notification.
     */
    socketNotificationReceived: function (notification, payload) {
        if (notification === "MOTION_RESULT") {
            this.handleMotionResult(payload);
        }
    },

    /**
     * Handles the result of the motion check.
     * @param {boolean} motion - Whether motion was detected.
     */
    handleMotionResult: function (motion) {
        const now = new Date();
        const isWithinTimeRange = this.isWithinTimeRange(
            this.config.startTime,
            this.config.endTime,
            this.config.activeDays
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
            this.state = 2;
        }

        this.updateDom();
    },

    /**
     * Sends a socket notification to toggle the screen on or off.
     * @param {boolean} on - Whether to turn the screen on.
     */
    toggleScreen: function (on) {
        this.sendSocketNotification("TOGGLE_SCREEN", on);
    },

    /**
     * Checks if the current time is within the specified time range.
     * @param {string} startTime - The start time in "HH:MM" format.
     * @param {string} endTime - The end time in "HH:MM" format.
     * @param {string[]} activeDays - The days when the display should be active.
     * @returns {boolean} - True if the current time is within the range, false otherwise.
     */
    isWithinTimeRange: function (startTime, endTime, activeDays) {
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();
        const currentDay = now.toLocaleString("en-US", { weekday: "short" });

        const [startHour, startMinute] = startTime.split(":").map(Number);
        const [endHour, endMinute] = endTime.split(":").map(Number);

        const start = startHour * 60 + startMinute;
        const end = endHour * 60 + endMinute;

        const isActiveDay = activeDays.includes(currentDay);

        if (start <= end) {
            return isActiveDay && currentTime >= start && currentTime <= end;
        } else {
            return isActiveDay && (currentTime >= start || currentTime <= end);
        }
    },

    /**
     * Generates the DOM element for the module.
     * @returns {HTMLElement} - The DOM element.
     */
    getDom: function () {
        const wrapper = document.createElement("div");
        wrapper.className = "MMM-Hue-Motion-Screensaver";

        const texts = this.languages || this.languages.en;

        if (this.isWithinTimeRange(this.config.startTime, this.config.endTime, this.config.activeDays)) {
            wrapper.innerHTML = `${texts.onBetween} ${this.config.startTime} - ${this.config.endTime}`;
        } else {
            if (this.state === 1) {
                wrapper.innerHTML = texts.motionDetected;
            } else if (this.state === 2 && this.nextScreenOffTime) {
                const now = new Date();
                const timeRemaining = Math.max(0, Math.floor((this.nextScreenOffTime - now) / 1000));
                const minutes = String(Math.floor(timeRemaining / 60)).padStart(2, '0');
                const seconds = String(timeRemaining % 60).padStart(2, '0');
                wrapper.innerHTML = `${texts.screenOffIn}: ${minutes}:${seconds}`;
            } else {
                wrapper.innerHTML = texts.screenActive;
            }
        }
        return wrapper;
    },

    /**
     * Logs an informational message.
     * @param {string} message - The message to log.
     */
    log: function (message) {
        Log.info(`[${this.name}] ${message}`);
    },

    /**
     * Logs an error message.
     * @param {string} message - The message to log.
     * @param {Error} error - The error object.
     */
    logError: function (message, error) {
        Log.error(`[${this.name}] ${message}`, error);
    }
});