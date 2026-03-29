// This file contains the main module logic for the MMM-Hue-Motion-Screensaver.

Module.register("MMM-Hue-Motion-Screensaver", {
  defaults: {
    hueHost: "",
    sensorId: "",
    apiKey: "",
    coolDown: 5 * 60, // seconds before screen turns off after last motion
    startTime: "06:00",
    endTime: "22:00",
    pollInterval: 2000,
    activeDays: ["Sat", "Sun"],
    language: "en",
    screenCommandOn: "xrandr -display :0.0 --output HDMI-1 --auto",
    screenCommandOff: "xrandr -display :0.0 --output HDMI-1 --off"
  },

  languages: {
    en: {
      onBetween: "On between",
      motionDetected: "Motion detected",
      screenOffIn: "Off in",
      screenActive: "Screen active"
    },
    de: {
      onBetween: "An zwischen",
      motionDetected: "Bewegung erkannt",
      screenOffIn: "Aus in",
      screenActive: "Bildschirm aktiv"
    }
  },

  start: function () {
    this.log("Starting: " + this.name)

    if (!this.config.hueHost || !this.config.sensorId || !this.config.apiKey) {
      this.logError("Missing required config: hueHost, sensorId, and apiKey must all be set.")
      return
    }

    this.lastAction = new Date()
    this.state = -1
    this.nextScreenOffTime = null
    this.updateTimer = null
    this.scheduleUpdate()
  },

  getStyles: function () {
    return ["Hue-Motion-Screensaver.css"]
  },

  scheduleUpdate: function () {
    this.updateTimer = setInterval(() => {
      this.checkMotion()
    }, this.config.pollInterval)
  },

  suspend: function () {
    if (this.updateTimer) {
      clearInterval(this.updateTimer)
      this.updateTimer = null
    }
  },

  resume: function () {
    if (!this.updateTimer) {
      this.scheduleUpdate()
    }
  },

  stop: function () {
    this.suspend()
  },

  checkMotion: function () {
    this.sendSocketNotification("CHECK_MOTION", {
      hueHost: this.config.hueHost,
      sensorId: this.config.sensorId,
      apiKey: this.config.apiKey,
      screenCommandOn: this.config.screenCommandOn,
      screenCommandOff: this.config.screenCommandOff,
    })
  },

  socketNotificationReceived: function (notification, payload) {
    if (notification === "MOTION_RESULT") {
      this.handleMotionResult(payload)
    }
  },

  handleMotionResult: function (motion) {
    const now = new Date()
    const isWithinTimeRange = this.isWithinTimeRange(
      this.config.startTime,
      this.config.endTime,
      this.config.activeDays
    )

    if (motion) {
      this.lastAction = now
      this.nextScreenOffTime = new Date(
        now.getTime() + this.config.coolDown * 1000
      )
      if (this.state !== 1) {
        this.state = 1
        this.toggleScreen(true)
      }
    } else if (
      !motion
      && (now - this.lastAction) > this.config.coolDown * 1000
    ) {
      if (isWithinTimeRange) {
        this.log("SCREEN OFF command ignored due to time range")
      } else if (this.state !== 0) {
        this.state = 0
        this.toggleScreen(false)
        this.nextScreenOffTime = null
      }
    } else {
      this.state = 2
    }

    this.updateDom()
  },

  /**
     * Sends a socket notification to toggle the screen on or off.
     * @param {boolean} on - Whether to turn the screen on.
     */
  toggleScreen: function (on) {
    this.sendSocketNotification("TOGGLE_SCREEN", on)
  },

  /**
     * Checks if the current time is within the specified time range.
     * @param {string} startTime - The start time in "HH:MM" format.
     * @param {string} endTime - The end time in "HH:MM" format.
     * @param {string[]} activeDays - The days when the display should be active.
     * @returns {boolean} - True if the current time is within the range, false otherwise.
     */
  isWithinTimeRange: function (startTime, endTime, activeDays) {
    const now = new Date()
    const currentTime = now.getHours() * 60 + now.getMinutes()
    const currentDay = now.toLocaleString("en-US", { weekday: "short" })

    const [startHour, startMinute] = startTime.split(":").map(Number)
    const [endHour, endMinute] = endTime.split(":").map(Number)

    const start = startHour * 60 + startMinute
    const end = endHour * 60 + endMinute

    const isActiveDay = activeDays.includes(currentDay)

    if (start <= end) {
      return isActiveDay && currentTime >= start && currentTime <= end
    } else {
      return isActiveDay && (currentTime >= start || currentTime <= end)
    }
  },

  /**
     * Generates the DOM element for the module.
     * @returns {HTMLElement} - The DOM element.
     */
  getDom: function () {
    const wrapper = document.createElement("div")
    wrapper.className = "MMM-Hue-Motion-Screensaver"

    const texts = this.languages[this.config.language] || this.languages.en

    if (this.isWithinTimeRange(this.config.startTime, this.config.endTime, this.config.activeDays)) {
      wrapper.textContent = `${texts.onBetween} ${this.config.startTime} - ${this.config.endTime}`
    } else {
      if (this.state === 1) {
        wrapper.textContent = texts.motionDetected
      } else if (this.state === 2 && this.nextScreenOffTime) {
        const now = new Date()
        const timeRemaining = Math.max(0, Math.floor((this.nextScreenOffTime - now) / 1000))
        const minutes = String(Math.floor(timeRemaining / 60)).padStart(2, "0")
        const seconds = String(timeRemaining % 60).padStart(2, "0")
        wrapper.textContent = `${texts.screenOffIn}: ${minutes}:${seconds}`
      } else {
        wrapper.textContent = texts.screenActive
      }
    }
    return wrapper
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
