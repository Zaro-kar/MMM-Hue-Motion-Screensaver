const NodeHelper = require("node_helper");
const Log = require("logger");
const fs = require("fs");

module.exports = NodeHelper.create({
    /**
     * Called when the node helper is started.
     */
    start: function () {
        this.log("Starting node helper for: " + this.name);
    },

    /**
     * Handles received socket notifications.
     * @param {string} notification - The notification type.
     * @param {any} payload - The payload of the notification.
     */
    socketNotificationReceived: function (notification, payload) {
        if (notification === "CHECK_MOTION") {
            this.checkMotion(payload);
        } else if (notification === "TOGGLE_SCREEN") {
            this.toggleScreen(payload);
        }
    },

    /**
     * Checks the motion state from the Hue sensor.
     * @param {Object} params - The parameters for the motion check.
     * @param {string} params.hueHost - The hostname or IP address of the Hue Bridge.
     * @param {string} params.sensorId - The sensor ID.
     * @param {string} params.apiKey - The API key.
     * @param {string} params.certPath - The path to the certificate.
     */
    checkMotion: async function ({ hueHost, sensorId, apiKey, certPath }) {
        const pirUrl = `https://${hueHost}/clip/v2/resource/motion/${sensorId}`;
        const headers = {
            "hue-application-key": apiKey
        };

        try {
            const response = await fetch(pirUrl, {
                method: 'GET',
                headers: headers,
                agent: new (require("https").Agent)({
                    ca: fs.readFileSync(certPath),
                    rejectUnauthorized: false
                })
            });

            const data = await response.json();
            const motion = data?.data?.[0]?.motion?.motion_report?.motion || false;
            this.sendSocketNotification("MOTION_RESULT", motion);
        } catch (error) {
            this.logError("Error fetching motion state:", error);
            this.sendSocketNotification("MOTION_RESULT", true);
        }
    },

    /**
     * Toggles the screen on or off.
     * @param {boolean} on - Whether to turn the screen on.
     */
    toggleScreen: function (on) {
        const command = on
            ? "xrandr -display :0.0 --output HDMI-1 --auto --rotate left"
            : "xrandr -display :0.0 --output HDMI-1 --off";

        require("child_process").exec(command, (error) => {
            if (error) {
                this.logError("Error toggling screen:", error);
            } else {
                this.log(`Screen toggled ${on ? "on" : "off"}`);
            }
        });
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