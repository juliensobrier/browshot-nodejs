var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');

function checkFormat(data, format) {
	assert.ok(Buffer.isBuffer(data));
	assert.ok(data.length > 32);
	if (format == 'pdf') assert.equal(data.slice(0, 5).toString(), '%PDF-');
	if (format == 'webm') assert.equal(data.slice(0, 4).toString('hex'), '1a45dfa3');
	if (format == 'mp4') assert.equal(data.slice(4, 8).toString(), 'ftyp');
	if (format == 'gif') assert.ok(['GIF87a', 'GIF89a'].includes(data.slice(0, 6).toString()));
}

var Browshot = require('../index.js');
var live = process.env.BROWSHOT_LIVE_TESTS == '1' && process.env.BROWSHOT_API_KEY;

(live ? describe : describe.skip)('API 1.32 live artifacts', function () {
	this.timeout(60000);
	var client, directory;
	before(function () {
		client = new Browshot(process.env.BROWSHOT_API_KEY);
		client.error = function () {};
		directory = fs.mkdtempSync(path.join(os.tmpdir(), 'browshot-live-'));
	});
	after(function () {
		fs.readdirSync(directory).forEach(function (file) { fs.unlinkSync(path.join(directory, file)); });
		fs.rmdirSync(directory);
	});
	['pdf', 'webm', 'mp4', 'gif'].forEach(function (format) {
		var id = process.env['BROWSHOT_' + format.toUpperCase() + '_ID'];
		var method = format == 'pdf' ? 'screenshotPdf' : 'screenshotVideo';
		(id ? it : it.skip)('downloads a real ' + format + ' artifact', function (done) {
			client[method](id, {}, function (data) { checkFormat(data, format); done(); });
		});
		(id ? it : it.skip)('saves the real ' + format + ' bytes without alteration', function (done) {
			client[method](id, {}, function (data) {
				checkFormat(data, format);
				var file = path.join(directory, 'capture.' + format);
				client[method + 'File'](id, file, {}, function (saved) { assert.equal(saved, file); assert.deepStrictEqual(fs.readFileSync(file), data); done(); });
			});
		});
		(id ? it : it.skip)('retrieves details for the ' + format + ' capture', function (done) {
			client.screenshotInfo(id, { details: 1 }, function (info) {
				assert.equal(info.id, id); assert.equal(info.status, 'finished');
				assert.ok(info[format == 'pdf' ? 'pdf' : 'video']); done();
			});
		});
	});
	[373, 377, 381, 385].forEach(function (id) {
		it('lists native country instance ' + id, function (done) {
			client.instanceInfo(id, function (instance) { assert.equal(instance.id, id); assert.equal(instance.screenshot_cost, 1); done(); });
		});
	});
	['screenshotPdf', 'screenshotVideo'].forEach(function (method) {
		it(method + ' returns empty for a missing artifact', function (done) {
			client[method](1, {}, function (data) { assert.strictEqual(data, ''); done(); });
		});
		it(method + ' returns empty with an invalid API key', function (done) {
			var invalid = new Browshot('invalid-node-test-key'); invalid.error = function () {};
			invalid[method](process.env.BROWSHOT_PDF_ID || 1, {}, function (data) { assert.strictEqual(data, ''); done(); });
		});
	});
});
