const NodeHelper = require("node_helper")
const Log = require("logger")
const axios = require("axios")
const fs = require("fs")

module.exports = NodeHelper.create({
  currentScreenState: null, // Variable to store the current screen state

  /**
     * Called when the node helper is started.
     */
  start: function () {
    this.log("Starting node helper for: " + this.name)
  },

  /**
     * Handles received socket notifications.
     * @param {string} notification - The notification type.
     * @param {any} payload - The payload of the notification.
     */
  socketNotificationReceived: function (notification, payload) {
    if (notification === "CHECK_MOTION") {
      this.checkMotion(payload)
    } else if (notification === "TOGGLE_SCREEN") {
      this.toggleScreen(payload)
    }
  },

  /**
     * Checks the motion state from the Hue sensor.
     * @param {Object} params - The parameters for the motion check.
     * @param {string} params.hueHost - The hostname or IP address of the Hue Bridge.
     * @param {string} params.sensorId - The sensor ID.
     * @param {string} params.apiKey - The API key.
     */
  checkMotion: async function ({ hueHost, sensorId, apiKey }) {
    const pirUrl = `https://${hueHost}/clip/v2/resource/motion/${sensorId}`
    const headers = {
      "hue-application-key": apiKey
    }

    try {
      const response = await axios.get(pirUrl, {
        headers: headers,
        httpsAgent: new (require("https").Agent)({
          ca: fs.readFileSync(__dirname + "/hue_bridge_ca_cert.pem"),
          rejectUnauthorized: true
        })
      })

      const data = response.data
      const motion = data?.data?.[0]?.motion?.motion_report?.motion || false
      this.sendSocketNotification("MOTION_RESULT", motion)
    } catch (error) {
      this.logError("Error fetching motion state:", error)
      this.sendSocketNotification("MOTION_RESULT", true)
    }
  },

  /**
     * Toggles the screen on or off.
     * @param {boolean} on - Whether to turn the screen on.
     * @param {string} commandOn - The command to turn the screen on.
     * @param {string} commandOff - The command to turn the screen off.
     */
  toggleScreen: function ({ on, commandOn, commandOff }) {
    const command = on ? commandOn : commandOff

    require("child_process").exec(command, (error) => {
      if (error) {
        this.logError("Error toggling screen:", error)
      } else {
        const newStatus = on ? "on" : "off"
        if (this.currentScreenState !== newStatus) {
          this.log(`Screen toggled ${newStatus}`)
          this.currentScreenState = newStatus
        }
      }
    })
  },

  /**
     * Logs an informational message.
     * @param {string} message - The message to log.
     */
  log: function (message) {
    Log.info(`[${this.name}] ${message}`)
  },

  /**
     * Logs an error message.
     * @param {string} message - The message to log.
     * @param {Error} error - The error object.
     */
  logError: function (message, error) {
    Log.error(`[${this.name}] ${message}`, error)
  }
})
