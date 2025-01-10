# MMM-Hue-Motion-Screensaver
MagicMirror² module to control the screen based on motion detected by a Hue motion sensor.

## Installation

### Install

In your terminal, go to your [MagicMirror²][mm] Module folder and clone MMM-Hue-Motion-Screensaver:

```bash
cd ~/MagicMirror/modules
git clone https://github.com/Zaro-kar/MMM-Hue-Motion-Screensaver.git
```

### Update

```bash
cd ~/MagicMirror/modules/MMM-Hue-Motion-Screensaver
git pull
```

## Using the module

To use this module, add it to the modules array in the `config/config.js` file:

```js
{
    module: 'MMM-Hue-Motion-Screensaver',
    position: 'lower_third',
    config: {
        hueHost: 'your-hue-bridge-ip', // Required
        sensorId: 'your-sensor-id', // Required
        apiKey: 'your-api-key', // Required
    }
}
```

## Configuration options

Option|Possible values|Default|Description
------|------|------|-----------
`hueHost`|`string`|not available|**Required**. The IP address or hostname of the Hue Bridge (e.g., "192.168.1.2")
`sensorId`|`string`|not available|**Required**. The ID of the motion sensor (e.g., "1")
`apiKey`|`string`|not available|**Required**. The API key for the Hue Bridge (e.g., "your-api-key")
`coolDown`|`number`|300|The cooldown time in seconds before the screen turns off (e.g., 300)
`activeDays`|`array`|["Sat", "Sun"]|The days on which the module is always on (e.g., ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]). **Note:** The `startTime` and `endTime` settings are only effective on these days.
`startTime`|`string`|"06:00"|The start time in "HH:MM" format (e.g., "06:00"). **Note:** This works only in conjunction with `activeDays`. The monitor will stay on between `startTime` and `endTime` only on the days defined in `activeDays`.
`endTime`|`string`|"00:00"|The end time in "HH:MM" format (e.g., "00:00"). **Note:** This works only in conjunction with `activeDays`. The monitor will stay on between `startTime` and `endTime` only on the days defined in `activeDays`.
`pollInterval`|`number`|2000|The polling interval in milliseconds (e.g., 2000)
`language`|`string`|"en"|The language for the display (available options: "en", "de")

## Obtain the Values for the required parameter

[Official 'Getting Started' guid from Philips Hue](https://developers.meethue.com/develop/hue-api-v2/getting-started/)

### Obtaining the Hue IP address or hostname

To find the IP address or hostname of your Hue Bridge, you can use the Philips Hue app or check your router's connected devices list. The IP address usually looks something like "192.168.1.2".

### Generating an API key

To generate an API key for your Hue Bridge, follow these steps:
1. Press the link button on your Hue Bridge.
2. Within 30 seconds, send a POST request to the Hue Bridge using a tool like `curl`:
   ```bash
   curl -X POST -d '{"devicetype":"my_hue_app"}' http://<hue-bridge-ip>/api
   ```
3. The response will contain a username, which is your API key.

### Finding the sensor ID

To find the ID of your Hue motion sensor, you can use the Hue API. Open a web browser and go to `https://<bridge-ip-address>/clip/v2/resource/device`. Make sure you are on the same network as the bridge and use the IP address obtained earlier. Look for the sensor with the type "ZLLPresence" and note its ID.

### Hue Bridge CA Certificate

The `hue_bridge_ca_cert.pem` file included in this project is the public CA certificate for the Hue Bridge. It is used to establish a secure HTTPS connection with the Hue Bridge. You can find this certificate on the official Philips Hue developer website: [Using HTTPS](https://developers.meethue.com/develop/application-design-guidance/using-https/).

## Sending notifications to the module

Notification|Description
------|-----------
`CHECK_MOTION`|Checks the motion status of the sensor
`TOGGLE_SCREEN`|Toggles the screen on or off

## Developer commands

- `npm install` - Install devDependencies like ESLint.
- `npm run lint` - Run linting and formatter checks.
- `npm run lint:fix` - Fix linting and formatter issues.

[mm]: https://github.com/MagicMirrorOrg/MagicMirror