const EventEmitter = require('events');
const request = require('request');
const { createHash } = require('crypto');
const { State } = require('./state');

const models = {
	243: 'EM-125',
	255: 'EM-125S',
	293: 'EM-126T',
	285: 'EM-126TS',
	271: 'EM-129',
};

const stats = [
	'volt_msr',
	'freq_msr',
	'cur_msr',
	'pows_msr',
	'enrga_msr',
	// 'enrga_d_msr',
	// 'enrga_w_msr',
	// 'enrga_m_msr',
	'enrgs_msr',
	'sys_flag',
	'faul_flag',
	// 'ar_time',
	// 'cost_energy',
	// 'cost_unit',
];

// const nextFrame = (a, m = 300000) => m - a % m;
const delay = (t) => new Promise((resolve) => setTimeout(resolve, t));
const seconds = (t) => t * 1000;

class Overvis extends EventEmitter {

	constructor(config) {
		super();

		this.online = false;

		this.config = config;
		this.latest = 0;

		this.data = {
			state: new State(),
			status: new State(),
		};

		this.data.state.on('change', () => {
			this.emit('state', this.data.state.get());
		});

		this.data.status.on('change', () => {
			this.emit('status', this.data.status.get());
		});

		this.queue = Promise.resolve();

		this.login()
			.then(() => this.status(true))
			.then(() => {
				this.refresh();
				setInterval(() => this.refresh(), config.interval);

				// login each 10m
				setInterval(() => this.login(), 10 * 60 * 1000);

				const readReport = () => {
					this.report().then(() => {
						const time = this.latest
							? seconds(this.latest + 300) - Date.now() + 100
							: seconds(5);

						setTimeout(readReport, time);
					});
				};

				readReport();
			});
	}

	refresh() {
		return this.get(stats)
			.then((data) => this.parseState(data))
			.then((data) => {
				this.data.state.merge(data.state);
				this.data.status.merge(data.status);
			})
			.catch((e) => this.error(e));
	}

	report() {
		return this.fetchLogs()
			.then((records) => {
				if (!records) return;

				records = records.filter((record) => record[0] > this.latest);

				if (!records.length) return;

				[[this.latest]] = records;

				records.forEach((record) => {
					this.emit('report', this.parseReport(record));
				});
			});
	}

	fetchLogs() {
		return this.call('/loger/get?offset=0')
			.then(({ LOGS: records }) => records)
			.catch((e) => this.error(e));
	}

	clearLogs() {
		return this.call('/loger/delall');
	}

	reboot() {
		return this.call('/utils/reboot');
	}

	status(online) {
		if (this.online === online) return;

		this.online = online;

		this.emit('connection', online);
	}

	path(path) {
		return this.token
			? `${this.config.host}/${this.token}/api${path}`
			: `${this.config.host}/api${path}`;
	}

	call(path, opts) {
		// this.queue = this.queue
		// 	.then(() => this.request(path, opts));
		//
		// return this.queue;

		return this.queue
			.then(() => this.request(path, opts));
	}

	request(path, opts = {}) {
		const req = {
			method: 'GET',
			uri: this.path(path),
			...opts,
		};

		// console.log('>', this.path(path));

		if (this.hangup) clearTimeout(this.hangup);

		return new Promise((resolve, reject) => request(req, (err, response) => {
			if (err) return reject(err);

			try {
				this.hangup = setTimeout(() => this.login(), seconds(30));

				if (response.body) {
					response.body = JSON.parse(response.body);
				}

				// console.log('<', response.statusCode, response.body)

				const { STATUS: status, ...data } = response.body;

				return (['OK', 'EOL'].indexOf(status) >= 0 ? resolve : reject)(data);
			} catch (error) {
				return reject(error);
			}
		}));
	}

	error(e) {
		this.emit('error', e);

		delay(1000).then(() => this.login());
	}

	parseState(data) {
		const flags = this.parseFlags(data.sys_flag);
		const faults = this.parseFault(data.faul_flag);

		return {
			state: {
				state: flags.hwrelayIsOn,
			},
			status: {
				voltage: data.volt_msr / 10,
				current: data.cur_msr / 100,
				frequency: data.freq_msr / 100,
				power: data.pows_msr,
				energy: data.enrgs_msr,

				// consumption: {
				// 	total: data.enrga_msr,
				// 	daily: data.enrga_d_msr,
				// 	weekly: data.enrga_w_msr,
				// 	monthly: data.enrga_m_msr,
				// },

				faults,
			},
			flags,
		};
	}

	parseFlags(e) {
		return {
			voltApv: (1 & e) !== 0,
			curApv: (2 & e) !== 0,
			powApv: (4 & e) !== 0,
			onDelay: (8 & e) !== 0,
			hwrelayIsOn: (16 & e) !== 0,
			eventRelay: (64 & e) !== 0,
			userRelay: (128 & e) !== 0,
			holidayRelay: (256 & e) !== 0,
			syncTimeSntp: (512 & e) !== 0,
			syncTimeCloud: (1024 & e) !== 0,
			lockPanel: (2048 & e) !== 0,
			freqApv: (4096 & e) !== 0,
			wfStaEn: (65536 & e) !== 0,
			wfStaGotIp: (e & 1 << 17) !== 0,
			wfApEn: (e & 1 << 18) !== 0,
			webRun: (e & 1 << 26) !== 0,
			cloudRun: (e & 1 << 27) !== 0,
			sntpRun: (e & 1 << 28) !== 0,
			dnsRun: (e & 1 << 30) !== 0,
			clbEnabled: (e & 1 << 31) !== 0,
			wfApGotIp: (e & 1 << 19) !== 0,
		};
	}

	parseFault(r) {
		const result = [];

		if ((1 & r) !== 0) result.push('voltHi');
		if ((2 & r) !== 0) result.push('voltLo');
		if ((4 & r) !== 0) result.push('oltOver');
		if ((8 & r) !== 0) result.push('voltApv');
		if ((16 & r) !== 0) result.push('curHi');
		if ((32 & r) !== 0) result.push('curOver');
		if ((64 & r) !== 0) result.push('curApv');
		if ((128 & r) !== 0) result.push('powHi');
		if ((256 & r) !== 0) result.push('powApv');
		if ((512 & r) !== 0) result.push('tempSensorError');
		if ((1024 & r) !== 0) result.push('tempSensorDisconnected');
		if ((2048 & r) !== 0) result.push('tempSensorShortCirc');
		if ((4096 & r) !== 0) result.push('badRtc');
		if ((8192 & r) !== 0) result.push('badRelay');
		if ((16384 & r) !== 0) result.push('onLimit');
		if ((32768 & r) !== 0) result.push('freqHi');
		if ((65536 & r) !== 0) result.push('freqLo');
		if ((r & 1 << 17) !== 0) result.push('freqApv');
		if ((r & 1 << 30) !== 0) result.push('callibrationsError');
		if ((r & 1 << 31) !== 0) result.push('settingsError');

		return result.length ? result : undefined;
	}

	parseReport(r) {
		return {
			time: new Date(r[0] * 1000),
			voltage: r[3] / 10,
			current: r[5] / 100,
			power: r[4].toFixed(),
			energy: r[7] !== undefined
				? r[7] / 1000
				: undefined,
			temerature: r[6] / 10,
			// status: this.parseFlags(r[1]),
			fault: this.parseFault(r[2]),
		};
	}

	get(keys) {
		return this.call(`/all/get?${keys.join('&')}`);
	}

	login() {
		this.queue = this.queue
			.then(() => Promise.all([
				this.request('/login?salt')
					.then((data) => ({ salt: data.SALT })),

				this.request('/login?device_info')
					.then((info) => ({
						type: models[info.device_id],
						name: Buffer.from(info.user_info, 'base64').toString(),
					})),
			]))
			.then(([{ salt }, { type, name }]) => {
				const hash = createHash('sha1');

				this.info = { type, name };

				hash.update([
					type,
					Buffer.from(this.config.password).toString('base64'),
					salt,
				].join(''));

				return hash.digest('hex');
			})
			.then((login) => this.request(`/login?login=${login}`))
			.then(({ SID: token }) => { this.token = token; })
			.catch((e) => this.error(e));

		return this.queue;
	}

	set({ state }) {
		if (state === this.data.state.get().state) return Promise.resolve();

		const api = state
			? '/utils/ctrl?on'
			: '/utils/ctrl?off';

		return this.call(api)
			.then(() => this.data.state.merge({ state }));
	}

}

module.exports = { Overvis };
