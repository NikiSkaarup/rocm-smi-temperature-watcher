#!/home/nws/.bun/bin/bun
import { $ } from 'bun';

const keyEdge = 'Temperature (Sensor edge) (C):';
const keyJunction = 'Temperature (Sensor junction) (C):';
const keyMemory = 'Temperature (Sensor memory) (C):';
const keyFan = 'Fan Level:';
const keyEndFan = '(';

const minFanSpeed = 58;
const maxFanSpeed = 255;

const diffFanSpeed = maxFanSpeed - minFanSpeed;

const temperatureMax = 70;
const temperatureTarget = 56;

const id = '0';

/**
 * @param {string} string
 * @param {number} defaultValue
 * @returns {number}
 */
function parseNumber(string, defaultValue) {
	const number = Number.parseInt(string, 10);

	if (Number.isNaN(number)) {
		console.log(`failed to parse number from ${string}`);
		return defaultValue;
	}

	return number;
}

/**
 * @param {string} text
 * @param {string} key
 * @param {string} keyEnd
 * @param {number} defaultValue
 * @returns {number}
 */
function extractNumber(text, key, keyEnd, defaultValue = -1) {
	const index = text.indexOf(key);
	if (index === -1) {
		console.log(`failed to find ${key} in ${text}`);
		return defaultValue;
	}

	const indexNextLine = text.indexOf(keyEnd, index);

	/** @type {number | undefined} */
	let end = undefined;

	if (indexNextLine !== -1) {
		end = indexNextLine;
	}

	const string = text.substring(index + key.length, end);

	return parseNumber(string, defaultValue);
}

/**
 * @param {string} text
 * @returns {string}
 */
function filterCliOutput(text) {
	return text
		.replaceAll(`GPU[${id}]		: `, '')
		.replaceAll(`GPU[${id}]                : `, '')
		.replaceAll(
			'============================ ROCm System Management Interface ============================\n',
			'',
		)
		.replaceAll(
			'====================================== Temperature =======================================\n',
			'',
		)
		.replaceAll(
			'=================================== Current Fan Metric ===================================\n',
			'',
		)
		.replaceAll(
			'================================== End of ROCm SMI Log ===================================\n',
			'',
		)
		.replaceAll(
			'=================================== Set GPU Fan Speed ====================================\n',
			'',
		)
		.replaceAll(
			'==========================================================================================\n',
			'',
		)
		.replaceAll('\n\n', '');
}

async function main() {
	const text = filterCliOutput(await $`rocm-smi -d ${id} -t -f`.text());
	// console.debug(text);

	const edge = extractNumber(text, keyEdge, '\n');
	const junction = extractNumber(text, keyJunction, '\n');
	const memory = extractNumber(text, keyMemory, '\n');
	const fanSpeed = extractNumber(text, keyFan, keyEndFan, maxFanSpeed);
	let newFanSpeed = fanSpeed;

	console.log(`edge: ${edge}, junction: ${junction}, memory: ${memory}, fanSpeed: ${fanSpeed}`);

	const temperature = Math.max(edge, junction, memory);
	if (temperature > 40) {
		const diff = temperature - temperatureTarget;
		const ratio = diff / (temperatureMax - temperatureTarget);

		newFanSpeed = Math.max(minFanSpeed, maxFanSpeed - Math.floor(diffFanSpeed * ratio));
		if (newFanSpeed === fanSpeed) {
			console.log(`fan speed is already at ${fanSpeed}`);
			return;
		}

		console.log(
			`temperature: ${temperature}, diff: ${diff}, ratio: ${ratio}, newFanSpeed: ${newFanSpeed}`,
		);
	} else if (Math.min(edge, junction, memory) < 0) {
		console.log('failed to get temperature, setting fan speed to max fan speed');
		newFanSpeed = maxFanSpeed;
	} else {
		console.log('temperature is lower than 40, setting fan speed to min fan speed');
		newFanSpeed = minFanSpeed;
	}

	if (newFanSpeed < minFanSpeed) {
		console.log(`fan speed is lower than min fan speed, setting fan speed to ${minFanSpeed}`);
		newFanSpeed = minFanSpeed;
	} else if (newFanSpeed > maxFanSpeed) {
		console.log(`fan speed is higher than max fan speed, setting fan speed to ${maxFanSpeed}`);
		newFanSpeed = maxFanSpeed;
	} else if (newFanSpeed === fanSpeed) {
		console.log(`fan speed is already at ${fanSpeed}`);
		return;
	}

	console.log(`setting fan speed to ${newFanSpeed}`);
	const fanSpeedResult = await $`rocm-smi -d 0 --setfan ${newFanSpeed}`;

	if (fanSpeedResult.exitCode !== 0) {
		console.log('failed to set fan speed');
	} else {
		console.log(`set fan speed to ${newFanSpeed}`);
		const text = filterCliOutput(fanSpeedResult.text());
		console.log(text);
	}
}

const interval = 1000;
let running = false;

/**
 * job wrapper to prevent multiple jobs running at the same time
 * @returns {Promise<void>}
 */
async function job() {
	if (running) {
		return;
	}

	running = true;

	try {
		await main();
	} finally {
		running = false;
	}
}

setInterval(job, interval);
