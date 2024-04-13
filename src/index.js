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

/**
 * @param {number} a
 * @param {number} b
 * @param {number} threshold
 * @returns {boolean}
 */
function isCloseTo(a, b, threshold) {
	return Math.abs(a - b) < threshold;
}

/**
 * @param {string} id
 * @returns {Promise<{edge, junction, memory, speed}>}
 */
async function getData(id) {
	const text = filterCliOutput(await $`rocm-smi -d ${id} -t -f`.text());

	const edge = extractNumber(text, keyEdge, '\n');
	const junction = extractNumber(text, keyJunction, '\n');
	const memory = extractNumber(text, keyMemory, '\n');
	const speed = extractNumber(text, keySpeed, keyEndSpeed, maxSpeed);

	return { edge, junction, memory, speed };
}

/**
 * @param {string} id
 * @param {number} speed
 */
async function setSpeed(id, speed) {
	console.debug(`setting speed: ${speed}`);
	try {
		const text = filterCliOutput(await $`rocm-smi -d ${id} --setfan ${speed}`.text());
		console.log(`set speed: ${speed}`);
		console.debug(text);
	} catch (error) {
		console.error('failed to set speed', error);
	}
}

/**
 * @param {number} edge
 * @param {number} junction
 * @param {number} memory
 * @param {number} speed
 * @returns {number | null}
 */
function getNewSpeed(edge, junction, memory, speed) {
	const temperature = Math.max(edge, junction, memory);
	let newSpeed = speed;

	if (temperature > temperatureMin) {
		const diff = temperature - temperatureTarget;
		const ratio = diff / (temperatureMax - temperatureTarget);

		newSpeed = Math.max(minSpeed, maxSpeed - Math.abs(Math.floor(diffSpeed * ratio)));
		if (isCloseTo(newSpeed, speed, thresholdSpeed)) {
			console.debug(`speed:${newSpeed} near:${speed}`);
			return null;
		}

		console.debug(`temp:${temperature}c new speed:${newSpeed}`);
	} else if (Math.min(edge, junction, memory) < 0) {
		console.error(`temp is negative max:${maxSpeed}`);
		newSpeed = maxSpeed;
	} else {
		console.debug(`temp:${temperature}c under ${temperatureMin}c min:${minSpeed}`);
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
		return null;
	}

	return newSpeed;
}

/**
 * @returns {Promise<void>}
 */
async function main() {
	const { edge, junction, memory, speed } = await getData(id);

	console.debug(`edge:${edge}c junction:${junction}c memory:${memory}c speed:${speed}`);

	const newSpeed = getNewSpeed(edge, junction, memory, speed);

	if (newSpeed === null) return;

	console.log(`setting speed: ${newSpeed}`);
	await setSpeed(id, newSpeed);
}

/**
 * @returns {Promise<void>}
 */
async function test() {
	const edge = 50;
	const junction = 50;
	const memory = 50;
	const speed = 100;

	const newSpeed = getNewSpeed(edge, junction, memory, speed);

	console.log(`setting speed: ${newSpeed}`);
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
		// await test();
	} catch (e) {
		console.error(e);
	} finally {
		running = false;
	}
}

setInterval(job, interval);
