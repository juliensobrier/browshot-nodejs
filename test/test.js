var assert = require('assert');
var browshot = require('../index.js');

describe('API version test', function () {
	var client = new browshot('');
	
	it('should return the API version as X.Y', function () {
		assert.equal(client.apiVersion(), 1.22);
	});
});

if(! process.env.BROWSHOT_API_KEY) {
	console.log("API key missing");
	
}
else {
	var client = new browshot(process.env.BROWSHOT_API_KEY);

	describe('Simple API tests', function () {
		it('should return an image file', function (done) {
			this.timeout(1000 * 60 * 3);
			
			client.simple(
				{ url: 'http://mobilito.net/', instance_id: 12, cache: 60 * 60 * 24 * 365 },
				function(data) { 
					assert.equal(data.code, 200);
					assert.ok(data.data.length > 100);
					done();
				}
			);
		});
	});
	
	
	describe('Instance API tests', function () {
		it('should return a comple list of instances', function (done) {
			this.timeout(1000 * 60 * 1);
			
			client.instanceList(function(list) {
				
				assert.ok(Object.keys(list).length >= 2);
				assert.ok('free' in list, "list of free instances is missing");
				assert.ok('shared' in list, "list of shared instances is missing");
				
				assert.ok(list.free.length > 0, "list of free instances is incomplete");
				assert.ok(list.shared.length > 0, "list of sharedinstances is incomplete");
				
				var free = list.free[0];
				assert.ok('id' in free, "instance ID is missing");
				assert.ok('width' in free, "browser default width is missing");
				assert.ok('height' in free, "browser default height is missing");
				
				done();
			});
				
		});
		
		it('should return the instance information', function (done) {
			this.timeout(1000 * 60 * 1);
			
			client.instanceInfo(12, function(info) {
				assert.ok('id' in info, "instance ID is missing");
				assert.ok('width' in info, "browser default width is missing");
				assert.ok('height' in info, "browser default height is missing");
				
				done();
			});
		});
		
		it('should fail retrieving a missing instance', function (done) {
			this.timeout(1000 * 60 * 1);
			
			client.instanceInfo(-1, function(info) {
				assert.ok('error' in info, "error is missing");
				assert.ok('status' in info, "error message is missing");
				
				assert.equal('width' in info, false, "browser default width should be missing");
				assert.equal('height' in info, false, "browser default height should be missing");
				
				done();
			});
		});
	});
	
	describe('Browser API tests', function () {
		it('should return a comple list of browsers', function (done) {
			this.timeout(1000 * 60 * 1);
			
			client.browserList(function(list) {
				assert.ok(Object.keys(list).length >= 2);
				
				var key = Object.keys(list)[0];
				
				var browser = list[key];
				assert.ok('name' in browser, "Browser name is missing");
				assert.ok('user_agent' in browser, "Browser user_agent is missing");
				
				done();
			});
		});
	});
	
	describe('Screenshot API tests', function () {
		it('should fail', function (done) {
			client.screenshotCreate({ }, function(info) {
				assert.ok('status' in info, "Error is missing");
				assert.ok('error' in info, "Error message is missing");
				
				assert.equal(info.status, 'error');
				done();
			});
		});
			
		it('should fail', function (done) {
			client.screenshotCreate({ url: '-', instance_id: 12 }, function(info) {
				assert.ok('status' in info, "Error is missing");
				assert.ok('error' in info, "Error message is missing");
				done();
			});
		});
		
		it('should succeed', function (done) {
			this.timeout(1000 * 60 * 2);
			
			client.screenshotCreate({ url: 'https://browshot.com/', cache: 60 * 60 / 24 * 365, instance_id: 12 }, 
				function(info) {
					assert.ok('id' in info, "Screenshot ID is missing");
					assert.ok('status' in info, "Screenshot status is missing");
					
					if (info.status == 'finished') {
						assert.ok('screenshot_url' in info, "Screenshot URL is missing");
						assert.ok('url' in info, "URL is missing");
						assert.ok('size' in info, "Screenshot size is missing");
						assert.ok('width' in info, "Screenshot width is missing");
						assert.ok('height' in info, "Screenshot height is missing");
						assert.ok('instance_id' in info, "Screenshot instance ID is missing");
						assert.ok('final_url' in info, "final URL is missing");
						
						screenshot_id = info.id;
					}
				
					done();
				}
			);
		});
		
		it('should retrieve screenshot details', function (done) {
			client.screenshotList({ }, function(list) {
				
				var screenshot_id = Object.keys(list)[0];
			
				client.screenshotInfo(screenshot_id, { }, function(info) {
					assert.ok('id' in info, "Screenshot ID is missing");
					assert.ok('status' in info, "Screenshot status is missing");
					
					if (info.status == 'finished') {
						assert.ok('screenshot_url' in info, "Screenshot URL is missing");
						assert.ok('url' in info, "URL is missing");
						assert.ok('size' in info, "Screenshot size is missing");
						assert.ok('width' in info, "Screenshot width is missing");
						assert.ok('height' in info, "Screenshot height is missing");
						assert.ok('instance_id' in info, "Screenshot instance ID is missing");
						assert.ok('final_url' in info, "final URL is missing");
					}
					
					done();
				});
			});
		});
		
		it('should retrieve a thumbnail', function (done) {
			this.timeout(1000 * 60 * 2);
			client.screenshotList({ }, function(list) {
				
				var screenshot_id = Object.keys(list)[0];
				
				client.screenshotThumbnail(screenshot_id, { }, function(image) {
					assert.ok(image.length > 100, "Image content is missing");
					
					done();
				});
				
			});
		});
	});
	
	describe('Account API tests', function () {
		it('should retrieve the account details', function (done) {
			client.accountInfo({ }, function(info) {
				assert.ok('balance' in info, "balance is missing");
				assert.ok('free_screenshots_left' in info, "balance is missing");
				
				done();
			});
		});
	});
}