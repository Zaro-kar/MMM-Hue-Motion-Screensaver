# Raspberry Pi 3 als MagicMirror Kiosk-Client optimieren

Ziel: Den Raspberry Pi 3 mit minimalem OS als reinen Browser-Kiosk einrichten, der die MagicMirror-Weboberfläche vom LXC-Server anzeigt – stabil, ressourcenschonend und für 24/7-Dauerbetrieb geeignet.

---

## 1. Raspberry Pi OS Lite installieren

### 1.1 Image herunterladen und flashen

1. Lade **Raspberry Pi OS Lite (64-bit oder 32-bit)** herunter – die Version **ohne Desktop**.
   - Download: https://www.raspberrypi.com/software/operating-systems/
   - Alternativ: Raspberry Pi Imager verwenden.
2. Flashe das Image auf die SD-Karte (z. B. mit Raspberry Pi Imager oder balenaEtcher).
3. **Im Raspberry Pi Imager** (empfohlen): Konfiguriere direkt SSH-Zugang, WLAN und Benutzername/Passwort unter "Erweiterte Optionen", bevor du flashst.

### 1.2 Erster Start und Grundkonfiguration

Per SSH auf den Pi verbinden (Standard: `ssh pi@raspberrypi.local`) und Grundeinstellungen vornehmen:

```bash
sudo raspi-config
```

Relevante Einstellungen:

- **System Options → Hostname**: Einen sinnvollen Namen vergeben, z. B. `magicmirror-kiosk`
- **Localisation Options → Locale**: `de_DE.UTF-8` setzen
- **Localisation Options → Timezone**: `Europe/Berlin`
- **Interface Options → SSH**: Aktiviert lassen
- **Advanced Options → Expand Filesystem**: Gesamte SD-Karte nutzen

Danach neu starten:

```bash
sudo reboot
```

---

## 2. System aktualisieren und aufräumen

```bash
sudo apt update && sudo apt full-upgrade -y
sudo apt autoremove -y
sudo apt clean
```

---

## 3. GPU-Speicher und Boot-Konfiguration anpassen

Die Datei `/boot/firmware/config.txt` (bei älteren Images: `/boot/config.txt`) bearbeiten:

```bash
sudo nano /boot/firmware/config.txt
```

Folgende Zeilen hinzufügen oder anpassen:

```ini
# GPU-Speicher erhöhen (wichtig für Chromium-Rendering)
gpu_mem=128

# HDMI-Ausgang erzwingen (verhindert Probleme bei Monitoren ohne EDID)
hdmi_force_hotplug=1

# Bildschirmschoner / Blanking deaktivieren
avoid_warnings=1

# Übertakten (optional, moderat und sicher für Pi 3)
# arm_freq=1300
# over_voltage=2
# gpu_freq=500
```

> **Hinweis:** Die Übertaktung ist optional. Testen, ob der Pi damit stabil läuft. Bei Instabilität die Zeilen wieder auskommentieren.

---

## 4. Swap-Speicher vergrößern

Der Pi 3 hat nur 1 GB RAM. Ein größerer Swap hilft, Out-of-Memory-Abstürze zu verhindern.

### Option A: Mit `dphys-swapfile`

`dphys-swapfile` ist bei Raspberry Pi OS Lite nicht immer vorinstalliert. Ggf. zuerst installieren:

```bash
sudo apt install -y dphys-swapfile
```

Dann konfigurieren:

```bash
sudo dphys-swapfile swapoff
sudo nano /etc/dphys-swapfile
```

Ändern:

```
CONF_SWAPSIZE=512
```

Aktivieren:

```bash
sudo dphys-swapfile setup
sudo dphys-swapfile swapon
```

### Option B: Manuell (ohne `dphys-swapfile`)

```bash
sudo swapoff -a
sudo fallocate -l 512M /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

Damit der Swap nach einem Reboot erhalten bleibt:

```bash
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### Prüfen

```bash
free -h
```

---

## 5. Unnötige Dienste deaktivieren

Alles abschalten, was ein reiner Kiosk nicht braucht:

```bash
# Bluetooth deaktivieren
sudo systemctl disable bluetooth
sudo systemctl disable hciuart

# Avahi/mDNS (optional, falls kein .local-Zugriff benötigt wird)
# sudo systemctl disable avahi-daemon

# Triggerhappy (Hotkey-Daemon)
sudo systemctl disable triggerhappy

# Man-DB-Aktualisierung (spart Boot-Zeit)
sudo systemctl disable man-db.timer
```

Bluetooth auch in der Boot-Config deaktivieren (in `/boot/firmware/config.txt`):

```ini
dtoverlay=disable-bt
```

---

## 6. Minimale X-Server-Umgebung installieren

Statt eines vollständigen Desktops nur das absolute Minimum für einen Browser installieren:

```bash
sudo apt install -y --no-install-recommends \
    xserver-xorg \
    xserver-xorg-legacy \
    x11-xserver-utils \
    xinit \
    chromium \
    unclutter
```

**Was installiert wird:**

- `xserver-xorg`: Minimaler X-Server (kein Desktop, kein Window-Manager)
- `xserver-xorg-legacy`: Ermöglicht X-Start als normaler User über systemd (ohne dies schlägt der Kiosk-Service mit `Permission denied` auf `/dev/tty0` fehl)
- `x11-xserver-utils`: Enthält `xset` und `xrandr` (Bildschirmschoner deaktivieren, Display-Steuerung)
- `xinit`: Startet X ohne Display-Manager
- `chromium`: Der Kiosk-Browser (heißt auf neueren Raspberry Pi OS Versionen `chromium`, nicht `chromium-browser`)
- `unclutter`: Versteckt den Mauszeiger nach Inaktivität

### X-Server-Berechtigung konfigurieren

Damit der X-Server auch über einen systemd-Service (als normaler User) starten darf:

```bash
sudo nano /etc/X11/Xwrapper.config
```

Inhalt:

```
allowed_users=anybody
needs_root_rights=yes
```

---

## 7. Kiosk-Startskript erstellen

Erstelle das Startskript, das X + Chromium im Kiosk-Modus startet:

```bash
nano ~/kiosk.sh
```

Inhalt:

```bash
#!/bin/bash

# === KONFIGURATION ===
# URL des MagicMirror-Servers anpassen:
MAGICMIRROR_URL="http://<IP-DES-LXC-CONTAINERS>:8080"

# === ALTE PROZESSE AUFRÄUMEN ===
# Verhindert doppelten Chromium-Start bei Service-Restart
pkill -x chromium 2>/dev/null
sleep 1

# === BILDSCHIRMSCHONER DEAKTIVIEREN ===
xset s off          # Screensaver-Timer aus
xset s noblank      # Kein Blanking
xset -dpms          # DPMS deaktivieren (Bildschirmsteuerung läuft über ddcutil)

# === BILDSCHIRM ROTIEREN (optional) ===
# Falls der Monitor hochkant hängt: "left" oder "right" je nach Montage.
# Falls Querformat: diese Zeile auskommentieren oder entfernen.
xrandr --output HDMI-1 --rotate left

# === MAUSZEIGER VERSTECKEN ===
unclutter -idle 0.5 -root &

# === ALTES CHROMIUM-PROFIL BEREINIGEN ===
# Verhindert "Chromium wurde nicht korrekt beendet"-Meldungen
CHROMIUM_DIR="$HOME/.config/chromium"
if [ -d "$CHROMIUM_DIR/Default" ]; then
    sed -i 's/"exited_cleanly":false/"exited_cleanly":true/' \
        "$CHROMIUM_DIR/Default/Preferences" 2>/dev/null
    sed -i 's/"exit_type":"Crashed"/"exit_type":"Normal"/' \
        "$CHROMIUM_DIR/Default/Preferences" 2>/dev/null
fi

# === CHROMIUM IM KIOSK-MODUS STARTEN ===
# Hinweis: Der Befehl heißt auf neueren Pi OS Versionen "chromium" (nicht "chromium-browser").
# --window-size an die rotierte Auflösung anpassen (Breite x Höhe nach Rotation).
# Beispiel: 1920x1200 Monitor hochkant (--rotate left) → 1200x1920.
# Ohne Rotation bei 1920x1080: --window-size=1920,1080
chromium \
    --kiosk \
    --start-fullscreen \
    --noerrdialogs \
    --disable-infobars \
    --disable-translate \
    --disable-features=TranslateUI \
    --disable-suggestions-ui \
    --disable-save-password-bubble \
    --disable-session-crashed-bubble \
    --disable-component-update \
    --disable-background-networking \
    --disable-sync \
    --disable-default-apps \
    --disable-extensions \
    --disable-gpu \
    --disable-gpu-sandbox \
    --disable-gpu-compositing \
    --disable-software-rasterizer \
    --disable-dev-shm-usage \
    --no-first-run \
    --no-default-browser-check \
    --autoplay-policy=no-user-gesture-required \
    --check-for-update-interval=31536000 \
    --memory-pressure-off \
    --process-per-site \
    --window-position=0,0 \
    --window-size=1200,1920 \
    "$MAGICMIRROR_URL"
```

Ausführbar machen:

```bash
chmod +x ~/kiosk.sh
```

### Erklärung der wichtigsten Chromium-Flags

| Flag | Zweck |
|------|-------|
| `--kiosk` | Vollbild, kein UI |
| `--start-fullscreen` | Backup für `--kiosk` (manche Chromium-Versionen brauchen beides) |
| `--disable-gpu` | Erzwingt Software-Rendering (Pi 3 hat kein GLES3) |
| `--disable-gpu-sandbox` | Verhindert GPU-Sandbox-Fehler im Software-Modus |
| `--disable-gpu-compositing` | Verhindert GPU-Abstürze auf dem Pi 3 |
| `--disable-software-rasterizer` | Spart CPU bei fehlender GPU-Unterstützung |
| `--disable-dev-shm-usage` | Verwendet /tmp statt /dev/shm (hilft bei wenig RAM) |
| `--memory-pressure-off` | Unterdrückt Speicherwarnungen |
| `--process-per-site` | Weniger Prozesse = weniger RAM |
| `--window-size=B,H` | Fenstergröße passend zur (rotierten) Auflösung setzen |

---

## 8. Autostart konfigurieren

### Option A: Über .bash_profile (einfachste Methode)

Am Ende von `~/.bash_profile` hinzufügen:

```bash
nano ~/.bash_profile
```

Anfügen:

```bash
# Kiosk-Modus automatisch starten (nur auf tty1, nicht bei SSH)
if [ -z "$DISPLAY" ] && [ "$(tty)" = "/dev/tty1" ]; then
    xinit ~/kiosk.sh -- :0 -nocursor 2>/dev/null
fi
```

Dazu Auto-Login auf tty1 aktivieren:

```bash
sudo raspi-config
```

→ **System Options → Boot / Auto Login → Console Autologin**

### Option B: Über systemd-Service (robuster)

```bash
sudo nano /etc/systemd/system/kiosk.service
```

Inhalt (⚠️ `User` und Pfade an den eigenen Benutzernamen anpassen!):

```ini
[Unit]
Description=MagicMirror Kiosk
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=<DEIN-USERNAME>
Environment=DISPLAY=:0
ExecStart=/usr/bin/xinit /home/<DEIN-USERNAME>/kiosk.sh -- :0 -nocursor
Restart=on-failure
RestartSec=10

[Install]
WantedBy=graphical.target
```

Aktivieren:

```bash
sudo systemctl daemon-reload
sudo systemctl enable kiosk.service
sudo systemctl start kiosk.service
```

---

## 9. Bildschirm-Blanking komplett deaktivieren

Zusätzlich zum `xset`-Befehl im Kiosk-Skript auch auf Kernel-Ebene:

```bash
sudo nano /boot/firmware/cmdline.txt
```

Am **Ende der bestehenden Zeile** (alles muss in einer Zeile stehen!) anfügen:

```
consoleblank=0
```

---

## 10. Automatischer Neustart bei Problemen (Watchdog)

### 10.1 Hardware-Watchdog aktivieren

Der Pi 3 hat einen eingebauten Hardware-Watchdog. In `/boot/firmware/config.txt`:

```ini
dtparam=watchdog=on
```

Watchdog-Daemon installieren und konfigurieren:

```bash
sudo apt install -y watchdog
sudo nano /etc/watchdog.conf
```

Folgende Zeilen aktivieren (Kommentar entfernen):

```ini
watchdog-device = /dev/watchdog
max-load-1 = 24
watchdog-timeout = 15
```

Dienst aktivieren:

```bash
sudo systemctl enable watchdog
sudo systemctl start watchdog
```

### 10.2 Chromium-Überwachung per Cronjob

Falls Chromium abstürzt, automatisch neu starten. Erstelle ein Überwachungsskript:

```bash
nano ~/check_kiosk.sh
```

Inhalt:

```bash
#!/bin/bash
if ! pgrep -f "chromium" > /dev/null; then
    echo "$(date): Chromium nicht gefunden, starte neu..." >> /home/<DEIN-USERNAME>/kiosk-watchdog.log
    sudo systemctl restart kiosk.service
fi
```

> **Hinweis:** Hier wird `pgrep -f` verwendet (nicht `pgrep -x`), weil der Chromium-Prozess unter `/usr/lib/chromium/chromium` läuft und `pgrep -x` je nach System den vollen Pfad nicht matcht. Das Log wird ins Home-Verzeichnis geschrieben, da `/var/log` ohne Root nicht beschreibbar ist.

```bash
chmod +x ~/check_kiosk.sh
```

Per Cron alle 2 Minuten prüfen:

```bash
crontab -e
```

Hinzufügen (Pfad an eigenen Benutzernamen anpassen):

```
*/2 * * * * /home/<DEIN-USERNAME>/check_kiosk.sh
```

### 10.3 Täglicher Neustart (optional)

Falls der Pi trotzdem nach Tagen instabil wird, ein täglicher Reboot um z. B. 4 Uhr morgens:

```bash
sudo crontab -e
```

Hinzufügen:

```
0 4 * * * /sbin/reboot
```

---

## 11. Bildschirm nach Zeitplan ein-/ausschalten (optional)

Falls der Bildschirm nachts nicht leuchten soll:

```bash
nano ~/screen_control.sh
```

Inhalt:

```bash
#!/bin/bash
case "$1" in
    off)
        ddcutil setvcp d6 4
        ;;
    on)
        ddcutil setvcp d6 1
        sleep 2
        DISPLAY=:0 xrandr --output HDMI-1 --auto --rotate left
        ;;
esac
```

```bash
chmod +x ~/screen_control.sh
```

Per Cron steuern:

```bash
crontab -e
```

Hinzufügen:

```
# Bildschirm um 23:00 aus, um 06:00 an
0 23 * * * /home/<DEIN-USERNAME>/screen_control.sh off
0 6  * * * /home/<DEIN-USERNAME>/screen_control.sh on
```

---

## 12. MMM-Hue-Motion-Screensaver: Bildschirmsteuerung per SSH + `ddcutil`

Da MagicMirror im Server-only-Modus auf dem LXC-Container läuft, wird auch der `node_helper.js` des Moduls MMM-Hue-Motion-Screensaver dort ausgeführt – nicht auf dem Pi. Die Standard-Befehle mit `xrandr` greifen ins Leere, weil der LXC-Container keinen Zugriff auf das Display des Pi hat.

Die Lösung: Per SSH vom LXC auf den Pi zugreifen und dort `ddcutil` verwenden. `ddcutil` steuert den Monitor direkt über das DDC/CI-Protokoll (I²C) – komplett unabhängig von X, DPMS oder Chromium. Der Monitor schaltet sich wirklich ab (nicht nur Standby), was Strom spart und den Bildschirm schont.

> **Warum nicht `xrandr --off`, `xset dpms` oder `vcgencmd display_power`?**
> - `xrandr --output HDMI-1 --off` schaltet den Output komplett ab, aber der X-Server oder Chromium reaktiviert ihn nach wenigen Sekunden automatisch.
> - `xset dpms force off` schickt den Monitor in Standby, wird aber durch DOM-Updates von MagicMirror-Modulen (Clock, Wetter, etc.) sofort wieder aufgeweckt.
> - `vcgencmd display_power` funktioniert auf neueren Raspberry Pi OS Versionen mit dem KMS-Grafiktreiber (seit 2024 Standard) nicht mehr zuverlässig.
> - `ddcutil` umgeht alle diese Probleme, da es den Monitor auf Hardware-Ebene anspricht.

### 12.1 `ddcutil` auf dem Pi installieren und konfigurieren

Auf dem **Pi**:

```bash
sudo apt install -y ddcutil
```

Das I²C-Kernelmodul laden und für den Autostart einrichten:

```bash
sudo modprobe i2c-dev
echo "i2c-dev" | sudo tee /etc/modules-load.d/i2c-dev.conf
```

Optional: User zur `i2c`-Gruppe hinzufügen (falls `ddcutil` ohne `sudo` nicht funktioniert):

```bash
sudo usermod -aG i2c <DEIN-USERNAME>
```

Danach aus- und wieder einloggen.

Testen ob es lokal funktioniert:

```bash
# Monitor aus (schaltet wirklich ab)
ddcutil setvcp d6 4

# Monitor an + HDMI-Signal neu aufbauen (mit Rotation)
ddcutil setvcp d6 1 && sleep 2 && DISPLAY=:0 xrandr --output HDMI-1 --auto --rotate left
```

> **Hinweis:** Das `sleep 2` nach dem Einschalten ist nötig, weil der Monitor nach dem Aufwachen kurz braucht, bis er das HDMI-Signal wieder annimmt. Ohne die Pause bleibt der Bildschirm schwarz, obwohl der Monitor an ist.

### 12.2 SSH-Key auf dem LXC-Container erstellen

Auf dem **LXC-Container** (dort wo MagicMirror als Server läuft):

```bash
# Neuen SSH-Key generieren (ohne Passwort)
ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519

# Key auf den Pi kopieren (Benutzername anpassen!)
ssh-copy-id <DEIN-USERNAME>@<PI-IP>
```

Testen, ob der passwortlose Zugriff funktioniert:

```bash
ssh <DEIN-USERNAME>@<PI-IP> 'echo "SSH funktioniert"'
```

### 12.3 Bildschirmsteuerung remote testen

Auf dem **LXC-Container**:

```bash
# Bildschirm ausschalten
ssh <DEIN-USERNAME>@<PI-IP> 'ddcutil setvcp d6 4'

# Bildschirm einschalten (mit Pause und Rotation)
ssh <DEIN-USERNAME>@<PI-IP> 'ddcutil setvcp d6 1 && sleep 2 && DISPLAY=:0 xrandr --output HDMI-1 --auto --rotate left'
```

### 12.4 MagicMirror-Config anpassen

In der MagicMirror `config/config.js` auf dem **LXC-Container** die Bildschirm-Befehle des Moduls ändern:

```js
{
    module: 'MMM-Hue-Motion-Screensaver',
    position: 'lower_third',
    config: {
        hueBridgeID: 'your-hue-bridge-id',
        sensorId: 'your-sensor-id',
        apiKey: 'your-api-key',
        screenCommandOff: "ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 <DEIN-USERNAME>@<PI-IP> 'ddcutil setvcp d6 4'",
        screenCommandOn: "ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 <DEIN-USERNAME>@<PI-IP> 'ddcutil setvcp d6 1 && sleep 2 && DISPLAY=:0 xrandr --output HDMI-1 --auto --rotate left'",
        // ... weitere Optionen wie coolDown, activeDays, etc.
    }
}
```

Falls der Monitor im **Querformat** hängt, `--rotate left` aus `screenCommandOn` weglassen.

**Erklärung der SSH-Flags:**

| Flag | Zweck |
|------|-------|
| `-o StrictHostKeyChecking=no` | Verhindert die interaktive "Are you sure...?"-Abfrage beim ersten Verbinden |
| `-o ConnectTimeout=5` | Bricht nach 5 Sekunden ab, falls der Pi nicht erreichbar ist (verhindert, dass MagicMirror hängt) |

### 12.5 Hinweis: Bildschirm-Zeitplan

Falls du auch den Bildschirm-Zeitplan aus Abschnitt 11 nutzt, wurde das `screen_control.sh`-Skript dort ebenfalls auf `ddcutil` umgestellt.

---

## 13. Abschlussprüfung

Nach einem Neustart (`sudo reboot`) prüfen:

```bash
# RAM-Verbrauch prüfen (Idle sollte unter 200 MB sein)
free -h

# Laufende Prozesse prüfen (sollten minimal sein)
ps aux | wc -l

# CPU-Temperatur prüfen
vcgencmd measure_temp

# Chromium läuft?
pgrep -a chromium

# Swap-Nutzung
swapon --show
```

### Erwartete Werte (Idle)

| Messung | Erwartung |
|---------|-----------|
| RAM-Verbrauch (ohne Chromium) | ca. 80–120 MB |
| RAM-Verbrauch (mit Chromium + MagicMirror) | ca. 300–500 MB |
| CPU-Temperatur | 45–55 °C |
| Anzahl laufende Prozesse | ca. 40–60 |

---

## Zusammenfassung der Änderungen

| Maßnahme | Effekt |
|----------|--------|
| Raspbian Lite statt Desktop | ~300 MB RAM gespart |
| Kein Window Manager | ~50 MB RAM gespart |
| GPU-Speicher auf 128 MB | Besseres Chromium-Rendering |
| Swap auf 512 MB | Puffer bei Speicherengpässen |
| Bluetooth/unnötige Dienste aus | Weniger CPU/RAM im Hintergrund |
| Chromium-Flags optimiert | Weniger RAM, weniger Abstürze |
| Hardware-Watchdog | Automatischer Reboot bei Aufhänger |
| Chromium-Watchdog | Automatischer Neustart bei Crash |
| Bildschirmschoner deaktiviert | Kein schwarzer Bildschirm |
| Hue-Modul via SSH + ddcutil | Monitor wird direkt per DDC/CI gesteuert (echtes Aus, nicht nur Standby) |

---

## Troubleshooting

**X-Server startet nicht – `Cannot open /dev/tty0 (Permission denied)`:**
- `xserver-xorg-legacy` muss installiert sein: `sudo apt install -y xserver-xorg-legacy`
- In `/etc/X11/Xwrapper.config` muss `allowed_users=anybody` und `needs_root_rights=yes` stehen.
- User muss in der `tty`-Gruppe sein: `sudo usermod -aG tty <DEIN-USERNAME>`

**Chromium zeigt "Aw, Snap!" Fehlermeldung:**
- RAM-Problem. Prüfe `free -h`. Falls Swap voll: Swap vergrößern oder MagicMirror-Module reduzieren.

**Chromium-Fenster füllt den Bildschirm nicht aus:**
- `--window-size=` im Kiosk-Skript prüfen. Muss zur (rotierten!) Auflösung passen.
- Aktuelle Auflösung prüfen: `DISPLAY=:0 xrandr`
- Sowohl `--kiosk` als auch `--start-fullscreen` sollten gesetzt sein.

**Bildschirm bleibt schwarz nach Boot:**
- `hdmi_force_hotplug=1` in config.txt prüfen.
- SSH-Zugang nutzen und `DISPLAY=:0 xrandr --output HDMI-1 --auto` versuchen.

**`vcgencmd display_power` wird ignoriert:**
- Auf neueren Pi OS Versionen mit KMS-Treiber funktioniert `vcgencmd display_power` nicht mehr. Stattdessen `ddcutil` verwenden (siehe Abschnitt 12).

**`xrandr --output HDMI-1 --off` schaltet Bildschirm nur kurz aus:**
- Der X-Server oder Chromium reaktiviert den Output nach wenigen Sekunden automatisch. Stattdessen `ddcutil` verwenden.

**`xset dpms force off` – Bildschirm geht nach wenigen Sekunden wieder an:**
- DOM-Updates von MagicMirror-Modulen (Clock, Wetter, etc.) wecken den Bildschirm über DPMS wieder auf. Stattdessen `ddcutil` verwenden – das steuert den Monitor auf Hardware-Ebene, unabhängig von X/DPMS.

**`ddcutil setvcp d6 4` – `No /dev/i2c devices exist`:**
- I²C-Modul laden: `sudo modprobe i2c-dev`
- Für Autostart: `echo "i2c-dev" | sudo tee /etc/modules-load.d/i2c-dev.conf`
- Ggf. User zur `i2c`-Gruppe hinzufügen: `sudo usermod -aG i2c <DEIN-USERNAME>`

**`ddcutil setvcp d6 1` – Monitor geht an, aber Bildschirm bleibt schwarz:**
- Der Monitor braucht nach dem Aufwachen kurz, bis er das HDMI-Signal annimmt. Nach `ddcutil setvcp d6 1` ein `sleep 2` einfügen, dann `DISPLAY=:0 xrandr --output HDMI-1 --auto --rotate left` (siehe Abschnitt 12).

**Chromium startet doppelt bei `systemctl restart kiosk.service`:**
- Im Kiosk-Skript fehlt das Cleanup. Am Anfang des Skripts `pkill -x chromium 2>/dev/null && sleep 1` einfügen (siehe Abschnitt 7).

**`Undervoltage detected!` beim Booten:**
- Das Netzteil liefert nicht genug Strom. Ein Netzteil mit 5V / 2,5A (besser 3A) und ein hochwertiges Micro-USB-Kabel verwenden. Ohne stabile Stromversorgung kann der Pi sich unter Last aufhängen.

**`chromium-browser: command not found`:**
- Auf neueren Raspberry Pi OS Versionen heißt der Befehl `chromium` statt `chromium-browser`. Prüfen mit `which chromium`.

**`dphys-swapfile: command not found`:**
- Nicht vorinstalliert bei Pi OS Lite. Entweder mit `sudo apt install -y dphys-swapfile` nachinstallieren oder Swap manuell einrichten (siehe Abschnitt 4).

**Chromium startet nicht automatisch:**
- `sudo systemctl status kiosk.service` bzw. `journalctl -u kiosk.service -n 30` prüfen.
- User und Pfade in der Service-Datei prüfen (`/etc/systemd/system/kiosk.service`).
- Manuell testen: `xinit ~/kiosk.sh -- :0 -nocursor`

**MagicMirror-Seite lädt nicht:**
- Netzwerkverbindung prüfen: `ping <IP-DES-LXC-CONTAINERS>`
- Prüfen ob MagicMirror lauscht: `curl http://<IP>:8080`
- In der MagicMirror `config.js` sicherstellen, dass `address: "0.0.0.0"` und die IP des Pi in `ipWhitelist` steht.
