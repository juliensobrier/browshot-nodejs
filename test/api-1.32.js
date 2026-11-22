var assert = require('assert');
var http = require('http');
var fs = require('fs');
var os = require('os');
var path = require('path');
var Browshot = require('../index.js');

var pdf = Buffer.from('%PDF-1.7\n\x00\xff\x80\n%%EOF', 'binary');
var webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 255, 128]);
var mp4 = Buffer.concat([Buffer.from([0, 0, 0, 20]), Buffer.from('ftypisom'), Buffer.from([0, 255, 128])]);
var gif = Buffer.from('GIF89a\x00\xff\x80', 'binary');

describe('API 1.32', function () {
	var server, base, client, respond, requests, directory;

	before(function (done) {
		directory = fs.mkdtempSync(path.join(os.tmpdir(), 'browshot-node-'));
		server = http.createServer(function (req, res) {
			requests.push(new URL(req.url, 'http://localhost'));
			respond(req, res);
		});
		server.listen(0, '127.0.0.1', function () {
			base = 'http://127.0.0.1:' + server.address().port + '/api/v1';
			done();
		});
	});
	after(function (done) {
		fs.readdirSync(directory).forEach(function (file) { fs.unlinkSync(path.join(directory, file)); });
		fs.rmdirSync(directory);
		server.close(done);
	});
	beforeEach(function () {
		requests = [];
		client = new Browshot('test key&secret', false, base, 3);
		client.error = function () {};
		respond = function (req, res) {
			res.setHeader('Content-Type', 'application/json');
			res.end(JSON.stringify({ id: 123, status: 'in_queue' }));
		};
	});

	var options = {
		pdf: 1, pdf_format: 'a4', pdf_background: 1, pdf_one_page: 1, pdf_landscape: 1,
		pdf_margin: '1cm', pdf_margin_top: '2mm', pdf_margin_bottom: '3px',
		pdf_margin_left: '0.5in', pdf_margin_right: '0px',
		video: 1, video_format: 'mp4', video_duration: 30, video_quality: 63,
		video_fps: 24, video_scale: 0.5, device_scale: 2, hide_ads: 1
	};
	Object.keys(options).forEach(function (name) {
		it('passes ' + name + ' through screenshotCreate', function (done) {
			var args = { url: 'https://example.com/?a=1&b=two words', instance_id: 373 };
			args[name] = options[name];
			client.screenshotCreate(args, function (reply) {
				assert.equal(reply.id, 123);
				assert.equal(requests[0].pathname, '/api/v1/screenshot/create');
				assert.equal(requests[0].searchParams.get(name), String(options[name]));
				assert.equal(requests[0].searchParams.get('url'), args.url);
				done();
			});
		});
	});
	[373, 374, 375, 376, 377, 378, 379, 380, 381, 382, 383, 384, 385, 386, 387, 388].forEach(function (id) {
		it('passes native country instance ' + id, function (done) {
			client.screenshotCreate({ url: 'https://example.com/', instance_id: id }, function () {
				assert.equal(requests[0].searchParams.get('instance_id'), String(id));
				assert.equal(requests[0].searchParams.has('capture_country'), false);
				done();
			});
		});
	});
	['webm', 'mp4', 'gif'].forEach(function (format) {
		it('passes the ' + format + ' recording options', function (done) {
			client.screenshotCreate({ url: 'https://example.com/', instance_id: 373, video: 1, video_format: format, video_duration: 1 }, function () {
				assert.equal(requests[0].searchParams.get('video_format'), format);
				assert.equal(requests[0].searchParams.get('video_duration'), '1');
				done();
			});
		});
	});


	['instanceInfo', 'screenshotCreate'].forEach(function (method) {
		it('preserves native validation errors from ' + method, function (done) {
			var error = { success: false, error: 'INVALID_REQUEST', message: 'Check your request options and available credits' };
			respond = function (req, res) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(error)); };
			var callback = function (reply) { assert.deepStrictEqual(reply, error); done(); };
			if (method == 'instanceInfo') client.instanceInfo(-1, callback);
			else client.screenshotCreate({ url: 'http://', instance_id: 12 }, callback);
		});
	});

	['Pdf', 'Video'].forEach(function (kind) {
		describe('screenshot' + kind, function () {
			var method = 'screenshot' + kind;
			var fileMethod = method + 'File';
			var type = kind == 'Pdf' ? 'application/pdf' : 'video/webm';
			var data = kind == 'Pdf' ? pdf : webm;
			function success(req, res) { res.setHeader('Content-Type', type); res.end(data); }
			beforeEach(function () { respond = success; });

			it('returns the exact binary Buffer', function (done) {
				client[method](123, {}, function (body) {
					assert.ok(Buffer.isBuffer(body)); assert.deepStrictEqual(body, data); done();
				});
			});
			it('uses the correct authenticated endpoint and ID', function (done) {
				client[method](123, {}, function () {
					assert.equal(requests[0].pathname, '/api/v1/screenshot/' + kind.toLowerCase());
					assert.equal(requests[0].searchParams.get('key'), 'test key&secret');
					assert.equal(requests[0].searchParams.get('id'), '123'); done();
				});
			});
			it('passes encoded optional arguments without changing the caller object', function (done) {
				var args = { test: 'a&b = ü', id: 456 };
				client[method](123, args, function () {
					assert.equal(requests[0].searchParams.get('test'), args.test);
					assert.equal(requests[0].searchParams.get('id'), '123');
					assert.deepStrictEqual(args, { test: 'a&b = ü', id: 456 }); done();
				});
			});
			it('accepts MIME parameters and case differences', function (done) {
				respond = function (req, res) { res.setHeader('Content-Type', type.toUpperCase() + '; charset=binary'); res.end(data); };
				client[method](123, {}, function (body) { assert.deepStrictEqual(body, data); done(); });
			});
			it('rejects an empty artifact', function (done) {
				respond = function (req, res) { res.setHeader('Content-Type', type); res.end(); };
				client[method](123, {}, function (body) { assert.strictEqual(body, ''); done(); });
			});
			it('rejects a response with no Content-Type', function (done) {
				respond = function (req, res) { res.end(data); };
				client[method](123, {}, function (body) { assert.strictEqual(body, ''); done(); });
			});
			['application/json', 'text/html', 'image/png', 'application/octet-stream', kind == 'Pdf' ? 'video/webm' : 'application/pdf'].forEach(function (invalidType) {
				it('rejects ' + invalidType + ' instead of returning error content as a file', function (done) {
					respond = function (req, res) { res.setHeader('Content-Type', invalidType); res.end(data); };
					client[method](123, {}, function (body) { assert.strictEqual(body, ''); assert.equal(requests.length, 1); done(); });
				});
			});
			[204, 400, 401, 403, 404].forEach(function (status) {
				it('fails HTTP ' + status + ' without retrying', function (done) {
					respond = function (req, res) { res.writeHead(status, { 'Content-Type': type }); res.end(data); };
					client[method](123, {}, function (body) { assert.strictEqual(body, ''); assert.equal(requests.length, 1); done(); });
				});
			});
			[429, 500, 502, 503].forEach(function (status) {
				it('recovers after HTTP ' + status, function (done) {
					respond = function (req, res) { if (requests.length < 2) { res.writeHead(status); res.end('retry'); } else { success(req, res); } };
					client[method](123, {}, function (body) { assert.deepStrictEqual(body, data); assert.equal(requests.length, 2); done(); });
				});
				it('stops retrying HTTP ' + status + ' at the configured limit', function (done) {
					respond = function (req, res) { res.writeHead(status); res.end('retry'); };
					client[method](123, {}, function (body) { assert.strictEqual(body, ''); assert.equal(requests.length, 3); done(); });
				});
			});
			it('recovers from a connection failure', function (done) {
				respond = function (req, res) { if (requests.length == 1) { req.socket.destroy(); } else { success(req, res); } };
				client[method](123, {}, function (body) { assert.deepStrictEqual(body, data); assert.equal(requests.length, 2); done(); });
			});
			it('stops retrying connection failures', function (done) {
				respond = function (req) { req.socket.destroy(); };
				client[method](123, {}, function (body) { assert.strictEqual(body, ''); assert.equal(requests.length, 3); done(); });
			});
			it('makes only one attempt when retries are disabled', function (done) {
				client.retry = 0;
				respond = function (req, res) { res.writeHead(503); res.end(); };
				client[method](123, {}, function (body) { assert.strictEqual(body, ''); assert.equal(requests.length, 1); done(); });
			});
			it('rejects a missing screenshot ID without an HTTP request', function (done) {
				client[method](0, {}, function (body) { assert.strictEqual(body, ''); assert.equal(requests.length, 0); done(); });
			});
			it('saves exactly the downloaded bytes', function (done) {
				var file = path.join(directory, kind + '.binary');
				client[fileMethod](123, file, {}, function (saved) { assert.equal(saved, file); assert.deepStrictEqual(fs.readFileSync(file), data); done(); });
			});
			it('passes file download arguments through', function (done) {
				client[fileMethod](123, path.join(directory, kind + '-args'), { test: 'a&b' }, function () { assert.equal(requests[0].searchParams.get('test'), 'a&b'); done(); });
			});
			it('rejects a missing file name without an HTTP request', function (done) {
				client[fileMethod](123, '', {}, function (saved) { assert.strictEqual(saved, ''); assert.equal(requests.length, 0); done(); });
			});
			it('rejects a missing file screenshot ID without an HTTP request', function (done) {
				client[fileMethod](0, path.join(directory, 'absent'), {}, function (saved) { assert.strictEqual(saved, ''); assert.equal(requests.length, 0); done(); });
			});
			it('handles write errors without throwing', function (done) {
				client[fileMethod](123, directory, {}, function (saved) { assert.strictEqual(saved, ''); done(); });
			});
			it('does not overwrite a file when the download fails', function (done) {
				var file = path.join(directory, kind + '-keep'); fs.writeFileSync(file, 'keep');
				respond = function (req, res) { res.writeHead(404); res.end('{}'); };
				client[fileMethod](123, file, {}, function (saved) { assert.strictEqual(saved, ''); assert.equal(fs.readFileSync(file, 'utf8'), 'keep'); done(); });
			});
			if (kind == 'Video') {
				[['video/webm', webm], ['video/mp4', mp4], ['image/gif', gif]].forEach(function (artifact) {
					it('downloads and saves ' + artifact[0], function (done) {
						respond = function (req, res) { res.setHeader('Content-Type', artifact[0]); res.end(artifact[1]); };
						client[method](123, {}, function (body) {
							assert.deepStrictEqual(body, artifact[1]);
							var file = path.join(directory, artifact[0].replace('/', '-'));
							client[fileMethod](123, file, {}, function (saved) { assert.equal(saved, file); assert.deepStrictEqual(fs.readFileSync(file), artifact[1]); done(); });
						});
					});
				});
				it('accepts WebM fallback when MP4 was requested', function (done) {
					client[method](123, { video_format: 'mp4' }, function (body) { assert.deepStrictEqual(body, webm); done(); });
				});
			}
		});
	});
});
