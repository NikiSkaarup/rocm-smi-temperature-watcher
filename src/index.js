#!/home/nws/.bun/bin/bun
import { $ } from 'bun';

const keyEdge = 'Temperature (Sensor edge) (C):';
const keyJunction = 'Temperature (Sensor junction) (C):';
const keyMemory = 'Temperature (Sensor memory) (C):';
const keySpeed = 'Fan Level:';
const keyEndSpeed = '(';

const minSpeed = 58;
const maxSpeed = 255;
const thresholdSpeed = 4;

const diffSpeed = maxSpeed - minSpeed;

const temperatureMax = 70;
const temperatureTarget = 56;
const temperatureMin = 40;

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

function isCloseTo(a, b, threshold) {
	return Math.abs(a - b) < threshold;
}

async function main() {
	const text = filterCliOutput(await $`rocm-smi -d ${id} -t -f`.text());

	const edge = extractNumber(text, keyEdge, '\n');
	const junction = extractNumber(text, keyJunction, '\n');
	const memory = extractNumber(text, keyMemory, '\n');
	const speed = extractNumber(text, keySpeed, keyEndSpeed, maxSpeed);
	let newSpeed = speed;

	console.debug(`edge:${edge}c junction:${junction}c memory:${memory}c speed:${speed}`);

	const temperature = Math.max(edge, junction, memory);
	if (temperature > temperatureMin) {
		const diff = temperature - temperatureTarget;
		const ratio = diff / (temperatureMax - temperatureTarget);

		newSpeed = Math.max(minSpeed, maxSpeed - Math.floor(diffSpeed * ratio));
		if (isCloseTo(newSpeed, speed, thresholdSpeed)) {
			console.debug(`speed:${newSpeed} near:${speed}`);
			return;
		}

		console.debug(`temp:${temperature}c new speed:${newSpeed}`);
	} else if (Math.min(edge, junction, memory) < 0) {
		console.error(`temp is negative max:${maxSpeed}`);
		newSpeed = maxSpeed;
	} else {
		console.debug(`temp:${temperature} under ${temperatureMin}c min:${minSpeed}`);
		newSpeed = minSpeed;
	}

	if (newSpeed < minSpeed) {
		console.debug(`speed:${newSpeed} under min:${minSpeed}`);
		newSpeed = minSpeed;
	} else if (newSpeed > maxSpeed) {
		console.debug(`speed:${newSpeed} over max:${maxSpeed}`);
		newSpeed = maxSpeed;
	} else if (isCloseTo(newSpeed, speed, thresholdSpeed)) {
		console.debug(`speed:${newSpeed} near:${speed}`);
		return;
	}

	console.debug(`setting speed: ${newSpeed}`);
	try {
		const text = filterCliOutput(await $`rocm-smi -d ${id} --setfan ${newSpeed}`.text());
		console.log(`set speed: ${newSpeed}`);
		console.debug(text);
	} catch (error) {
		console.error('failed to set speed', error);
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
	} catch (e) {
		console.error(e);
	} finally {
		running = false;
	}
}

setInterval(job, interval);
