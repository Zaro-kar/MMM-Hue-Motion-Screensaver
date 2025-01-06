const NodeHelper = require("node_helper");
const Log = require("logger");
const axios = require("axios");
const fs = require("fs");

module.exports = NodeHelper.create({
    start: function () {
        this.log("Starting node helper for: " + this.name);
    },

    socketNotificationReceived: function (notification, payload) {
        if (notification === "CHECK_MOTION") {
            this.checkMotion(payload);
        } else if (notification === "TOGGLE_SCREEN") {
            this.toggleScreen(payload);
        }
    },

    checkMotion: async function ({ pirUrl, headers, certPath }) {
        try {
            const response = await axios.get(pirUrl, {
                headers: headers,
                httpsAgent: new (require("https").Agent)({
                    ca: fs.readFileSync(certPath),
                    rejectUnauthorized: false
                })
            });

            const data = response.data;
            const motion = data?.data?.[0]?.motion?.motion_report?.motion || false;
            this.sendSocketNotification("MOTION_RESULT", motion);
        } catch (error) {
            this.logError("Error fetching motion state:", error);
            this.sendSocketNotification("MOTION_RESULT", true); // Default: motion detected
        }
    },

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

    log: function (message) {
        Log.info(`[${this.name}] ${message}`);
    },

    logError: function (message, error) {
        Log.error(`[${this.name}] ${message}`, error);
    }
});