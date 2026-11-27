const assert = require('assert');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Browshot = require('../index');

describe('API 2.0 routing', function () {
	let server, client, requests;
	const url = 'https://example.com/?a=1&b=two';
	const image = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 255]);
	const archive = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x80, 0xff]);
	const pdf = Buffer.from('%PDF-1.4');
	const video = Buffer.from('GIF89a');

	before(function (done) {
		server = http.createServer((request, response) => {
			const query = new URL(request.url, 'http://localhost');
			const chunks = [];
			request.on('data', chunk => chunks.push(chunk));
			request.on('end', () => {
				const body = Buffer.concat(chunks).toString();
				requests.push({ query, method: request.method, body });
				if (query.pathname === '/api/v2/simple') {
					const continuation = query.searchParams.has('bad_wait') ? '/api/v2/wait?offline=1' : '/api/v2/wait';
					response.writeHead(302, { Location: continuation }).end();
				} else if (query.pathname === '/api/v2/wait' && !query.searchParams.has('offline')) {
					response.writeHead(302, { Location: 'simple/123?key=test-key' }).end();
				} else if (query.pathname === '/api/v2/simple/123') {
					response.writeHead(200, { 'Content-Type': 'image/png' }).end(image);
				} else if (query.pathname === '/api/v2/screenshot/thumbnail' && !query.searchParams.has('missing')) {
					response.writeHead(200, { 'Content-Type': 'image/png' }).end(image);
				} else if (query.pathname === '/api/v2/screenshot/pdf') {
					response.writeHead(200, { 'Content-Type': 'application/pdf' }).end(pdf);
				} else if (query.pathname === '/api/v2/screenshot/video') {
					response.writeHead(200, { 'Content-Type': 'image/gif' }).end(video);
				} else if (query.pathname === '/api/v2/batch/download') {
					response.writeHead(200, { 'Content-Type': 'application/octet-stream' }).end(archive);
				} else if (query.pathname === '/api/v2/ping') {
					response.writeHead(200, { 'Content-Type': 'text/plain' }).end('OK');
				} else {
					const unavailable = query.pathname.startsWith('/api/v2/') && query.searchParams.has('offline');
					const missing = query.searchParams.has('missing');
					response.writeHead(unavailable || missing ? 404 : 200, { 'Content-Type': 'application/json' });
					response.end(JSON.stringify(unavailable || missing ?
						{ success: false, error: 'NOT_FOUND', message: unavailable ? 'Page not found' : 'Screenshot or resource not found' } :
						{ id: 123, status: 'finished' }));
				}
			});
		}).listen(0, '127.0.0.1', done);
	});

	after(done => server.close(done));

	beforeEach(function () {
		requests = [];
		client = new Browshot('test-key', false, null, 0);
		client.base = 'http://127.0.0.1:' + server.address().port + '/api/v2';
	});

	const call = (client, method, ...args) => new Promise(resolve => client[method](...args, resolve));
	const paths = () => requests.map(request => request.query.pathname);

	it('routes legacy writes and shared information, with either version of screenshot ID', async function () {
		const created = await call(client, 'screenshotCreate', { url, instance_id: 373 });
		await call(client, 'screenshotInfo', created.id, {});
		await call(client, 'screenshotInfo', created.id, { details: 0 });
		await call(client, 'screenshotInfo', created.id, { api_version: 1 });
		assert.deepStrictEqual(paths(), ['/api/v1/screenshot/create', '/api/v2/screenshot/info',
			'/api/v1/screenshot/info', '/api/v1/screenshot/info']);
		assert.strictEqual(requests[1].query.searchParams.has('details'), false);
		assert.strictEqual(requests[3].query.searchParams.has('api_version'), false);
	});

	it('recognizes v1-only options and preserves legacy repeats and public browser IDs', async function () {
		await call(client, 'screenshotCreate', { url, priority: 1 });
		await call(client, 'screenshotMultiple', { urls: [url], instances: [13, 65] });
		await call(client, 'screenshotMultiple', { urls: [url], 'instance_id[0]': 13 });
		await call(client, 'browserInfo', 41);
		await call(client, 'browserInfo', 44);
		await call(client, 'browserInfo', 'brave');
		await call(client, 'browserList', { api_version: 1 });
		assert.deepStrictEqual(paths(), ['/api/v1/screenshot/create', '/api/v1/screenshot/multiple',
			'/api/v1/screenshot/multiple', '/api/v1/browser/info', '/api/v2/browser/info',
			'/api/v2/browser/info', '/api/v1/browser/list']);
		assert.deepStrictEqual(requests[1].query.searchParams.getAll('instance_id'), ['13', '65']);
		assert.strictEqual(requests[5].query.searchParams.get('browser'), 'brave');
	});

	it('keeps an explicit legacy base URL for legacy scripts', async function () {
		client.setBase(client.base.replace(/v2$/, 'v1'));
		await call(client, 'screenshotInfo', 123, {});
		await call(client, 'browserList');
		assert.deepStrictEqual(paths(), ['/api/v1/screenshot/info', '/api/v1/browser/list']);
	});

	it('uses shared downloads for an ID returned by a legacy capture', async function () {
		const capture = await call(client, 'screenshotCreate', { url, instance_id: 373 });
		assert.deepStrictEqual(await call(client, 'screenshotThumbnail', capture.id, {}), image);
		assert.deepStrictEqual(await call(client, 'screenshotPdf', capture.id, {}), pdf);
		assert.deepStrictEqual(await call(client, 'screenshotVideo', capture.id, {}), video);
		assert.deepStrictEqual(paths(), ['/api/v1/screenshot/create', '/api/v2/screenshot/thumbnail',
			'/api/v2/screenshot/pdf', '/api/v2/screenshot/video']);
	});

	it('uses v2 browser options, repeated URLs, profiles and app destinations', async function () {
		const profiles = [{ browser: 'firefox', country: 'fr' }, { device: 'iphone_15_pro' }];
		const args = { urls: [url, 'https://example.net/'], profiles, apps: { uploads: 'shot.png' } };
		await call(client, 'screenshotMultiple', args);
		assert.deepStrictEqual(paths(), ['/api/v2/screenshot/multiple']);
		const query = requests[0].query.searchParams;
		assert.deepStrictEqual(query.getAll('url'), args.urls);
		assert.deepStrictEqual(JSON.parse(query.get('profiles')), profiles);
		assert.strictEqual(query.get('apps[uploads]'), 'shot.png');
		assert.strictEqual(query.has('instance_id'), false);
	});

	it('creates crawls and uploads batches without an instance ID', async function () {
		const file = path.join(os.tmpdir(), 'browshot-v2-' + process.pid + '.txt');
		fs.writeFileSync(file, url);
		try {
			await call(client, 'crawlCreate', 'example.com', { browser: 'firefox' });
			await call(client, 'batchCreate', file, { country: 'fr' });
			await call(client, 'crawlCreate', 'example.com', url, 373, { max: 10 });
			await call(client, 'batchCreate', file, 373, { name: 'legacy' });
			assert.deepStrictEqual(paths(), ['/api/v2/crawl/create', '/api/v2/batch/create',
				'/api/v1/crawl/create', '/api/v1/batch/create']);
			assert.strictEqual(requests[0].query.searchParams.has('url'), false);
			assert.strictEqual(requests[1].method, 'POST');
			assert(requests[1].body.includes(url));
			assert.strictEqual(requests[2].query.searchParams.get('instance_id'), '373');
			assert.strictEqual(requests[3].method, 'POST');
			assert(requests[3].body.includes(url));
		} finally {
			fs.unlinkSync(file);
		}
	});

	it('uses the wait and result redirects for the synchronous file download', async function () {
		const file = path.join(os.tmpdir(), 'browshot-v2-' + process.pid + '.png');
		try {
			assert.deepStrictEqual(await call(client, 'simpleFile', file, { url, country: 'fr' }), { code: 200, file });
			assert.deepStrictEqual(fs.readFileSync(file), image);
			assert.deepStrictEqual(paths(), ['/api/v2/simple', '/api/v2/wait', '/api/v2/simple/123']);
		} finally {
			if (fs.existsSync(file)) fs.unlinkSync(file);
		}
	});

	it('does not resubmit a synchronous capture when a continuation is unavailable', async function () {
		const result = await call(client, 'simple', { url, bad_wait: 1 });
		assert.strictEqual(result.code, 404);
		assert.deepStrictEqual(paths(), ['/api/v2/simple', '/api/v2/wait']);
	});

	it('retries on v1 only when a shared route is unavailable', async function () {
		await call(client, 'screenshotInfo', 123, { offline: 1 });
		await call(client, 'screenshotInfo', 124, { missing: 1 });
		await call(client, 'screenshotInfo', 125, { offline: 1, api_version: 2 });
		await call(client, 'screenshotCreate', { url, country: 'fr', offline: 1 });
		await call(client, 'screenshotList', { tag: ['launch', 'release'], offline: 1 });
		await call(client, 'tagList', { offline: 1 });
		assert.deepStrictEqual(paths(), ['/api/v2/screenshot/info', '/api/v1/screenshot/info',
			'/api/v2/screenshot/info', '/api/v2/screenshot/info', '/api/v2/screenshot/create',
			'/api/v2/screenshot/list', '/api/v2/tag/list']);
		assert.deepStrictEqual(requests[5].query.searchParams.getAll('tag'), ['launch', 'release']);
	});

	it('calls the v2 status, slow list, tags and batch download endpoints', async function () {
		assert.strictEqual(await call(client, 'ping'), 'OK');
		await call(client, 'screenshotListSlow');
		await call(client, 'tagList');
		assert.deepStrictEqual(await call(client, 'batchDownload', 123), archive);
		assert.deepStrictEqual(paths(), ['/api/v2/ping', '/api/v2/screenshot/list/slow',
			'/api/v2/tag/list', '/api/v2/batch/download']);
		assert.strictEqual(requests[3].query.searchParams.get('id'), '123');
	});

	it('reports a failed thumbnail file download through the callback', async function () {
		client.error = () => {};
		const file = path.join(os.tmpdir(), 'browshot-missing-' + process.pid + '.png');
		assert.strictEqual(await call(client, 'screenshotThumbnailFile', 123, file, { missing: 1 }), '');
		assert.strictEqual(fs.existsSync(file), false);
	});

	it('uses v2 device and app endpoints and sends app changes as JSON', async function () {
		await call(client, 'deviceList');
		await call(client, 'appList');
		await call(client, 'appInfo', 37);
		await call(client, 'appCreate', { type: 'webhook', app_id: 'notify', name: 'Notifications', config: { url: 'https://example.com/capture-events' } });
		await call(client, 'appUpdate', 37, { isActive: 0 });
		await call(client, 'appDelete', 37);
		await call(client, 'appTest', 37);
		await call(client, 'appRun', '123', ['uploads']);
		assert.deepStrictEqual(paths(), ['/api/v2/device/list', '/api/v2/app/list', '/api/v2/app/info',
			'/api/v2/app/create', '/api/v2/app/update', '/api/v2/app/delete', '/api/v2/app/test', '/api/v2/app/run']);
		assert.strictEqual(requests[3].method, 'POST');
		assert.deepStrictEqual(JSON.parse(requests[3].body), { type: 'webhook', app_id: 'notify', name: 'Notifications', config: { url: 'https://example.com/capture-events' } });
		assert.deepStrictEqual(JSON.parse(requests[4].body), { id: 37, isActive: false });
		assert.deepStrictEqual(JSON.parse(requests[7].body), { screenshot_id: 123, apps: ['uploads'] });
	});
});
