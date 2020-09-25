const { connect } = require('mqtt');
const { Overvis } = require('./overvis');
const { config } = require('./config');
const { version } = require('./package');

const topics = {
	device: () => `${config.mqtt.path}`,
	state: () => `${config.mqtt.path}/state`,
	status: () => `${config.mqtt.path}/status`,
	set: () => `${config.mqtt.path}/set`,
	report: () => `${config.mqtt.path}/report`,
};

const mqtt = connect(config.mqtt.host, {
	username: config.mqtt.username,
	password: config.mqtt.password,
	clientId: config.mqtt.id,
	will: {
		topic: topics.device(),
		payload: JSON.stringify({ online: false, version }),
		retain: true,
	},
});

const overvis = new Overvis(config.overvis);

const format = (type, args) => [
	`[${type.toUpperCase()}]`,
	...args,
].join(' ');

const log = (type, ...args) => console.log(format(type, args));

const error = (type, ...args) => console.error(format(type, args));

mqtt.on('connect', () => {
	log('mqtt', `connected to ${config.mqtt.host}`);

	mqtt.subscribe(topics.set());
});

overvis.on('connection', (online) => {
	const status = online
		? 'connected to'
		: 'disconnected from';

	log('overvis', `${status} ${config.overvis.host}`);

	mqtt.publish(topics.device(), JSON.stringify({
		online,
		version,
		...overvis.info,
	}), { retain: true });
});

overvis.on('status', (status) => {
	log('overvis', `status ${JSON.stringify(status)}`);
	mqtt.publish(topics.status(), JSON.stringify(status), { retain: true });
});

overvis.on('state', (status) => {
	log('overvis', `state ${JSON.stringify(status)}`);
	mqtt.publish(topics.status(), JSON.stringify(status), { retain: true });
});

overvis.on('report', (report) => {
	log('overvis', `report ${report.time.toISOString()}`);
	mqtt.publish(topics.report(), JSON.stringify(report));
});

mqtt.on('message', (topic, data) => {
	try {
		log('overvis', 'received');
		log('overvis', `  > ${data.toString()}`);

		overvis.set(JSON.parse(data.toString()));
	} catch (e) {
		error('mqtt', 'not able to parse incoming message');
	}

});

overvis.on('error', (e) => {
	error('overvis', 'overvis error');
	error('overvis', `  > ${e.toString()}`);
});

mqtt.on('error', (e) => {
	error('mqtt', 'error');
	error('mqtt', `  > ${e.toString()}`);
});
