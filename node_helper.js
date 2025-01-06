const NodeHelper = require("node_helper");
const request = require("request");
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

    checkMotion: function ({ pirUrl, headers, certPath }) {
        const options = {
            url: pirUrl,
            headers: headers,
            cert: fs.readFileSync(certPath),
            rejectUnauthorized: false
        };

        request.get(options, (error, response, body) => {
            if (error) {
                this.logError("Error fetching motion state:", error);
                this.sendSocketNotification("MOTION_RESULT", true); // Default: motion detected
                return;
            }

            try {
                const data = JSON.parse(body);
                const motion =
                    data?.data?.[0]?.motion?.motion_report?.motion || false;
                this.sendSocketNotification("MOTION_RESULT", motion);
            } catch (e) {
                this.logError("Error parsing motion response:", e);
                this.sendSocketNotification("MOTION_RESULT", true); // Default: motion detected
            }
        });
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
        console.log(`[${this.name}] ${message}`);
    },

    logError: function (message, error) {
        console.error(`[${this.name}] ${message}`, error);
    }
});
