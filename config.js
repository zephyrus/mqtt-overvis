module.exports.config = {

	mqtt: {
		host: process.env.MQTT_HOST,
		username: process.env.MQTT_USERNAME,
		password: process.env.MQTT_PASSWORD,
		id: process.env.MQTT_ID,
		path: process.env.MQTT_PATH || 'overvis',
	},

	overvis: {
		host: process.env.OVERVIS_HOST,
		password: process.env.OVERVIS_PASSWORD,
		interval: process.env.OVERVIS_INTERVAL,
		// host: process.env.ZWAY_HOST,
		// username: process.env.ZWAY_USERNAME,
		// password: process.env.ZWAY_PASSWORD,
		// refresh: process.env.ZWAY_REFRESH || 10000,
		// reconnect: process.env.ZWAY_RECONNECT || 3600000,
	},

};
