# mqtt-overvis
MQTT integration for Overvis platform

## Docker Compose

```yml
version: '3'

services:

  overvis:
    image: 2mqtt/overvis:0.0.7

    restart: always

    environment:
      - MQTT_ID=overvis
      - MQTT_PATH=overvis
      - MQTT_HOST=mqtt://<ip address of mqtt broker>
      - MQTT_USERNAME=<mqtt username>
      - MQTT_PASSWORD=<mqtt password>
      - OVERVIS_HOST=http://<ip address of overvis device>
      - OVERVIS_PASSWORD=<overvis device password>
      - OVERVIS_INTERVAL=5000
```