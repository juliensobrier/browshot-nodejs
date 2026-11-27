'use strict';

const request = require('request');
const fs = require("fs");
const imageType = require('image-type');
const parseUrl = require('url').parse;

var baseRequest = request.defaults({ maxRedirects: 32, strictSSL: false });
process.setMaxListeners(64); 


Browshot.prototype.info = function (/**/) {
	var args = Array.prototype.slice.call(arguments);

	if (this.debug) {
		console.log(args.join(''));
	};
}

Browshot.prototype.error = function (/**/) {
	var args = Array.prototype.slice.call(arguments);
	
	console.log('ERROR ' + args.join(''));
}

Browshot.prototype._versionFor = function(action, args) {
	const version = String(args.api_version);
	if (version === '1' || version === '2') return version;
	if (!this._autoApi) return null;
	if (/^(instance\/|browser\/create$|screenshot\/host$)/.test(action)) return '1';
	if (action === 'browser/info' && args.id != null && !['40', '42'].includes(String(args.id))) return '1';

	const legacy = /^(instance_id|instance_ids|instances|screen|details|ids|hook(_.+)?|hosting(_.+)?|device_name|device_touch|device_mobile|device_landscape|user_agent)$/;
	if (Object.keys(args).some(key => legacy.test(key) && args[key] != null &&
	    (!Array.isArray(args[key]) || args[key].length))) return '1';
	return '2';
};

Browshot.prototype.make_url = function(action = '', args = {}) {
	const version = this._versionFor(action, args);
	const base = this.base.replace(/\/$/, '').replace(/\/api\/v[12]$/, match => version ? '/api/v' + version : match);
	let url = base + '/' + action + '?key=' + encodeURIComponent(this.key);
	function append(key, value) {
		if (value != null) url += '&' + encodeURIComponent(key) + '=' + encodeURIComponent(value);
	}

	for (const name of Object.keys(args)) {
		const value = args[name];
		if (name === 'api_version' || value == null) continue;
		const key = name === 'urls' ? 'url' : name === 'instances' ? 'instance_id' : name;
		if (key === 'profiles' && Array.isArray(value)) {
			append(key, JSON.stringify(value));
		} else if (key === 'apps' && typeof value === 'object' && !Array.isArray(value)) {
			for (const app of Object.keys(value)) append('apps[' + app + ']', value[app]);
		} else if (Array.isArray(value) && ['url', 'instance_id', 'apps'].includes(key)) {
			for (const item of value) append(key, item);
		} else {
			append(key, value);
		}
	}
	this.info(base + '/' + action);
	return url;
};

Browshot.prototype._request = function(action, args, options, callback) {
	const v2Only = /^(browser|country|screen_width|screen_height|mobile|device|profiles|apps(\[.*\])?)$/;
	const shared = this._autoApi && args.api_version == null && this._versionFor(action, args) === '2' &&
		!/^(app\/|device\/|wait$|batch\/download$|ping$|simple\/)/.test(action) &&
		!Object.keys(args).some(key => v2Only.test(key) && args[key] != null);
	const url = this.make_url(action, args);
	const send = (address, done) => baseRequest(Object.assign({ url: address }, options()), done);

	return send(url, (err, response, body) => {
		if (!err && shared && response.statusCode === 404 &&
		    response.request.uri.pathname === parseUrl(url).pathname &&
		    /^application\/json(?:;|$)/i.test(response.headers['content-type'] || '')) {
			let error;
			try {
				error = JSON.parse(body.toString());
			} catch (_) {
				// A regular 404 response is returned to the caller.
			}
			if (error && error.success === false && error.error === 'NOT_FOUND' && error.message === 'Page not found') {
				return send(this.make_url(action, Object.assign({}, args, { api_version: 1 })), callback);
			}
		}
		return callback(err, response, body);
	});
};

Browshot.prototype.return_string = function(action, args, callback, retry = 0) {
	return this._request(action, args, () => ({}), (err, response, body) => {
		const version = this._versionFor(action, args);
		if (retry < this.retry && (version !== '2' || /\/(info|list|search|html)$/.test(action)) &&
		    (err || response.statusCode >= 400)) {
			return this.return_string(action, args, callback, retry + 1);
		}
		return callback(err ? '' : body, this);
	});
};

Browshot.prototype.return_post_string = function(action, args, callback) {
	const query = Object.assign({}, args);
	const file = query.file;
	delete query.file;
	return this._request(action, query, () => ({
		method: 'POST',
		formData: { file: fs.createReadStream(file) }
	}), (err, response, body) => callback(err ? '' : body, this));
};

Browshot.prototype.return_reply = function(action, args, callback) {
	return this.return_string(action, args, function(data, self) {
		if (data == '') {
			return callback({ error: 1, message: 'Invalid server response' }, self);
		}

		var info = {};
		try {
			info = JSON.parse(data);
		}
		catch(e) {
			self.error("Invalid JSON: " + e);
			self.error(data);

			return callback({error: 1, message: "Invalid server response"}, self);
		}
		
		return callback(info, self);
		
	});
}

Browshot.prototype.return_post_reply = function(action, args, callback) {
	return this.return_post_string(action, args, function(data, self) {
		if (data == '') {
			return callback({ error: 1, message: 'Invalid server response' }, self);
		}
		
		return callback(JSON.parse(data), self);
		
	});
}

/**
 * Nodejs library for Browshot (https://browshot.com/), a web service to create screenshots of web pages.
 * 
 * Browshot (http://www.browshot.com/) is a web service to easily make screenshots of web pages in any screen size, as any device: iPhone, iPad, Android, PC, etc. Browshot has full JavaScript, CSS, & HTML5 support.
 * The latest API version is detailed at http://browshot.com/api/documentation. This library follows the API documentation very closely: the function names are similar to the URLs used (screenshot/create becomes screenshotCreate(), 
 * instance/list becomes instanceList, etc.), the request arguments are exactly the same, etc.
 * 
 * The module version matches closely the API version it handles: browshot-1.0.0 is the first release for the API 1.0, browshot-1.1.1 is the second release for the API 1.1, etc.
 * This module can handle most the API updates within the same major version, e.g. browshot-1.0.0 should be compatible with the API 1.1 or 1.2.
 * 
 * The source code is available on github at https://github.com/juliensobrier/browshot-nodejs.
 * 
 * Constructor for the Nodejs Browshot client. You can find code samples at http://browshot.com/api/documentation
 * @link http://browshot.com/api/documentation
 * @param  {String}   key   Your API key. Required.
 * @param  {Boolean}  debug Turn on debugging messages. optional
 * @param  {String}   base  Change the API base URL. Used with private servers only. Optional.
 * @param {Number}    retry The number of times to retry a screenshot if an error occurs in the API call. 3 by default. optional.
 */
function Browshot(key, debug = false, base = null, retry = 3) {
  this.key = key;
  this.debug = debug;
	this.setBase(base);
	this.retry = retry;
}

Browshot.prototype.setKey = function(key) {
  this.key = key;
};
Browshot.prototype.setDebug = function(debug = false) {
  this.debug = debug;
};
Browshot.prototype.setBase = function(base = null) {
  this._autoApi = base == null;
  this.base = this._autoApi ? 'https://api.browshot.com/api/v2' : base;
};


/**
 * Return the API version handled by the library. Note that this library can usually handle new arguments in requests without requiring an update.
 * @link http://browshot.com/api/documentation
 * @param  {Object}   args        arguments. Optional.
 * @return {String}   Return the API version.
 */
Browshot.prototype.apiVersion = function() {
	return require('./package').version.split('.', 2).join('.');
}


/**
 * Retrieve a screenshot in one function. Note: by default, screenshots are cached for 24 hours. You can tune this value with the cache=X parameter.
 * @link http://browshot.com/api/documentation#simple
 * @param  {Object}   args        arguments. Optional.
 * @param  {Function} callback    Callback function
 * @return {Object}   Return an array (status code, PNG).
 */
Browshot.prototype.simple = function(args = {}, callback) {
	
	var data = {code: 500, data: ''};
	
	this._request('simple', args, () => ({}), (err, response, body) => {
		if (err) { this.error(err); }
		
		return callback({ code: response ? response.statusCode : 500, data: body || '' });
	});
	
	return data;
}

/**
 * Retrieve a screenshot and save it locally in one function. Note: by default, screenshots are cached for 24 hours. You can tune this value with the cache=X parameter.
 * @link http://browshot.com/api/documentation#simple
 * @param  {String}   url         URL of the website to create a screenshot of. Required. 
 * @param  {Object}   args        arguments. Optional.
 * @param  {Function} callback    Callback function
 * @return {Object}   Return an array (status code, file name). The file name is empty if the screenshot was not retrieved. 
 */
Browshot.prototype.simpleFile = function(file, args = {}, callback) {
	
	this._request('simple', args, () => ({ encoding: null }), (err, response, body) => {
		if (err || response.statusCode != 200) { 
			this.error(err);
			
			return callback({ code: response ? response.statusCode : 500, file: '' });
		}
		
		if (body != '') {
			fs.writeFile(file, body, 'binary', (err) => {
				if (err) {
					this.error(err);
					
					return callback({ code: response.statusCode, file: '' });
				}
					
				return callback({ code: response.statusCode, file: file });
			});
		}
		else {
			this.error('No image returned');
			return callback({ code: response.statusCode, file: '' });
		}
	});
}


/**
 * Return the list of instances.
 * @link http://browshot.com/api/documentation#instance_list
 * @param  {Object}   args        arguments. Optional.
 * @param  {Function} callback    Callback function
 * @return {Object}   Return the list of instances.
 */
Browshot.prototype.instanceList = function(callback) {
	var url = this.make_url('instance/list');
	
	request(url, (err, response, body) => {
		if (err) {
			this.error(err);
			return callback({status: 'error', error: err});
		}
		
		return callback(JSON.parse(body));
	});
}

/**
 * Return the details of an instance.
 * @link http://browshot.com/api/documentation#instance_info
 * @param  {Number}   id          Instance ID. Required.
 * @param  {Object}   args        arguments. Optional.
 * @param  {Function} callback    Callback function
 * @return {Object}   Return the instance properties.
 */
Browshot.prototype.instanceInfo = function(id = 0, callback) {
	if (id == 0) {
			this.error("Missing instance ID");
			return callback({status: 'error', error: 'Missing instance ID'});
	}
	
	
	var url = this.make_url('instance/info', { id: id });
	
	request(url, (err, response, body) => {
		if (err) {
			this.error(err);
			return callback({status: 'error', error: err});
		}
		
		return callback(JSON.parse(body));
	});
}


/**
 * Return the details of a browser.
 * @link http://browshot.com/api/documentation#browser_info
 * @param  {Object}   args        arguments. Optional.
 * @param  {Function} callback    Callback function
 * @return {Object}   Return the image content.
 */
Browshot.prototype.browserList = function(callback) {
	this._request('browser/list', {}, () => ({}), (err, response, body) => {
		if (err) {
			this.error(err);
			return callback({status: 'error', error: err});
		}
		
		return callback(JSON.parse(body));
	});
}

/**
 * Return the details of a browser.
 * @link http://browshot.com/api/documentation#browser_info
 * @param  {Number}   id          Browser ID. Required. 
 * @param  {Object}   args        arguments. Optional.
 * @param  {Function} callback    Callback function
 * @return {Object}   Return the browser properties.
 */
Browshot.prototype.browserInfo = function(id = 0, callback) {
	if (id == 0) {
		this.error("Missing browser ID");
		return callback({status: 'error', error: 'Missing browser ID'});
	}
	
	
	const args = id === 'chrome' || id === 'firefox' ? { browser: id } : { id: id };
	this._request('browser/info', args, () => ({}), (err, response, body) => {
		if (err) {
			this.error(err);
			return callback({});
		}
		
		return callback(JSON.parse(body));
	});
}


/**
 * Request a screenshot. 
 * Note: by default, screenshots are cached for 24 hours. You can tune this value with the cache=X parameter.
 * @link http://browshot.com/api/documentation#screenshot_create
 * @param  {Object}   args        arguments. Optional.
 * @param  {Function} callback    Callback function
 * @return {Object}   Return the screenshot details.
 */
Browshot.prototype.screenshotCreate = function(args = { }, callback) {
	if (! args.hasOwnProperty('url')) {
			this.error("Missing URL");
			return callback({ status: 'error', error: "Missing URL" });
	}
	
	return this.return_reply('screenshot/create', args, callback);
}

/**
 * Get information about a screenshot requested previously.
 * @link http://browshot.com/api/documentation#screenshot_info
 * @param  {Number}   id          Screenshot ID. Required. 
 * @param  {Object}   args        arguments. Optional.
 * @param  {Function} callback    Callback function
 * @return {Object}   Return the screenshot details..
 */
Browshot.prototype.screenshotInfo = function(id = 0, args = { }, callback) {
	if (id == 0) {
			this.error("Missing screenshot ID");
			return callback({ status: 'error', error: "Missing screenshot ID" });
	}
	
	args.id = id;

	return this.return_reply('screenshot/info', args, callback);
}

/**
 * Get details about screenshots requested.
 * @link http://browshot.com/api/documentation#screenshot_list
 * @param  {Object}   args        arguments. Optional.
 * @param  {Function} callback    Callback function
 * @return {Object}   Return the screenshot list.
 */
Browshot.prototype.screenshotList = function(args = { }, callback) {
	return this.return_reply('screenshot/list', args, callback);
}

/**
 * Get details about screenshots requested.
 * @link http://browshot.com/api/documentation#screenshot_search
 * @param  {String}   url         URL to search. Required. 
 * @param  {Object}   args        arguments. Optional.
 * @param  {Function} callback    Callback function
 * @return {Object}   Return the screenshot list.
 */
Browshot.prototype.screenshotSearch = function(url = '', args = { }, callback) {
	if (url == '') {
		this.error("Missing URL");
		return callback({ status: 'error', error: "Missing screenshot URL" });
	}
	
	args.url = url;

	return this.return_reply('screenshot/search', args, callback);
}

/**
 * Host a screenshot or thumbnail.
 * @link http://browshot.com/api/documentation#screenshot_host
 * @param  {Number}   id          Screenshot ID. Required. 
 * @param  {Object}   args        arguments. Optional.
 * @param  {Function} callback    Callback function
 * @return {Object}   Return the screenshot details.
 */
Browshot.prototype.screenshotHost = function(id = 0, args = { }, callback) {
	if (id == 0) {
		this.error("Missing screenshot ID");
		return callback({ status: 'error', error: "Missing screenshot ID" });
	}
	
	args.id = id;

	return this.return_reply('screenshot/host', args, callback);
}

/**
 * Retrieve the screenshot, or a thumbnail.
 * @link http://browshot.com/api/documentation#screenshot_thumbnail
 * @param  {Number}   id          Screenshot ID. Required. 
 * @param  {Object}   args        arguments. Optional.
 * @param  {Function} callback    Callback function
 * @return {Object}   Return the image content.
 */
Browshot.prototype.screenshotThumbnail = function(id = 0, args = { }, callback, retry = 0) {
	if (id == 0) {
		this.error("Missing screenshot ID");
		return callback('');
	}
	
	args.id = id;
	

	retry++;

	this.info(`screenshotThumbnail retry ${retry}`);
	this._request('screenshot/thumbnail', args, () => ({ encoding: null }), (err, response, body) => {
		if (err) {
			this.error(err);
			this.error(body);
			if (retry >= this.retry) {
				return callback('');
			}

			return this.screenshotThumbnail(id, args, callback, retry);
		}

		if (response && response.statusCode != 200) {
			this.error(`Image cannot be retrieved - ${retry}`);
			if (retry >= this.retry) {
				return callback('');
			}
			
			return this.screenshotThumbnail(id, args, callback, retry);
		}

		this.info(`imageType check`);
		var imageInfo = imageType(body);
		if (imageInfo == null || !imageInfo.hasOwnProperty('ext') || !['jpg', 'png'].includes(imageInfo.ext)) {
			this.error(`Image cannot be retrieved: incorrect format - ${retry} - ${imageInfo.ext}`);
			if (retry >= this.retry) {
				return callback('');
			}
				
			return this.screenshotThumbnail(id, args, callback, retry);
		}
		
		this.info(`screenshotThumbnail successful`);
		return callback(body);
	});
}

/**
 * Retrieve the screenshot, or a thumbnail, of a specific shot.
 * @link http://browshot.com/api/documentation#screenshot_thumbnail
 * @param  {Number}   id          Screenshot ID. Required. 
 * @param  {Number}   shot        Shot number. Required. 
 * @param  {Object}   args        arguments. Optional.
 * @param  {Function} callback    Callback function
 * @return {Object}   Return the image content and the shot number.
 */
Browshot.prototype.shotThumbnail = function(id = 0, shot = 1, args = { }, callback, retry = 0) {
	if (id == 0) {
		this.error("Missing screenshot ID");
		return callback(['', shot]);
	}
	
	args.id = id;
	args.shot = shot;
	

	retry++;

	this.info(`shotThumbnail retry ${retry}`);
	this._request('screenshot/thumbnail', args, () => ({ encoding: null }), (err, response, body) => {
		if (err) {
			this.error(err);
			this.error(body);
			if (retry >= this.retry) {
				return callback(['', shot]);
			}

			return this.shotThumbnail(id, shot, args, callback, retry);
		}

		if (response && response.statusCode != 200) {
			this.error(`Image cannot be retrieved - ${retry}`);
			if (retry >= this.retry) {
				return callback(['', shot]);
			}
			
			return this.shotThumbnail(id, shot, args, callback, retry);
		}

		this.info(`imageType check`);
		var imageInfo = imageType(body);
		if (imageInfo == null || !imageInfo.hasOwnProperty('ext') || !['jpg', 'png'].includes(imageInfo.ext)) {
			this.error(`Image cannot be retrieved: incorrect format - ${retry} - ${imageInfo.ext}`);
			if (retry >= this.retry) {
				return callback(['', shot]);
			}
				
			return this.shotThumbnail(id, shot, args, callback, retry);
		}
		
		this.info(`shotThumbnail successful`);
		return callback([body, shot]);
	});
}

/**
 * Retrieve the screenshot, or a thumbnail, and save it to a file.
 * @link http://browshot.com/api/documentation#thumbnails
 * @param  {Number}   id          Screenshot ID. Required. 
 * @param  {String}   file        Local file name to write the thumbnail to. Required. 
 * @param  {Object}   args        arguments. Optional.
 * @param  {Function} callback    Callback function
 * @return {Object}   Return an empty string if the image could not be retrieved or not saved. Returns the file name if successful.
 */
Browshot.prototype.screenshotThumbnailFile = function(id = 0, file = '', args = { }, callback) {
	if (id == 0) {
		this.error("Missing screenshot ID");
		return callback('');
	}
	
	if (file == '') {
		this.error("Missing file");
		return callback('');
	}
	
	args.id = id;
	
	this.screenshotThumbnail(id, args, (data) => {
		if (data != '') {
			fs.writeFile(file, data, 'binary', (err) => {
				if (err) {
					this.error(err);
					
					return callback('');
				}
					
				return callback(file);
			});
		}
		else {
			this.error("No screenshot retrieved");
			return callback('');
		}
		
	});
}

/**
 * Retrieve a PDF generated with pdf=1.
 * @link https://browshot.com/api/documentation#screenshot_pdf
 * @param  {Number}   id          Screenshot ID. Required.
 * @param  {Object}   args        arguments. Optional.
 * @param  {Function} callback    Callback with a Buffer, or an empty string on failure.
 */
Browshot.prototype.screenshotPdf = function(id = 0, args = { }, callback) {
	return downloadArtifact(this, 'pdf', id, args, callback);
}

/**
 * Retrieve a video generated with video=1 (WebM, MP4 or GIF).
 * @link https://browshot.com/api/documentation#screenshot_video
 * @param  {Number}   id          Screenshot ID. Required.
 * @param  {Object}   args        arguments. Optional.
 * @param  {Function} callback    Callback with a Buffer, or an empty string on failure.
 */
Browshot.prototype.screenshotVideo = function(id = 0, args = { }, callback) {
	return downloadArtifact(this, 'video', id, args, callback);
}

/**
 * Retrieve a PDF and save it to a file.
 * @param  {Number}   id          Screenshot ID. Required.
 * @param  {String}   file        Local file name. Required.
 * @param  {Object}   args        arguments. Optional.
 * @param  {Function} callback    Callback with the file name, or an empty string on failure.
 */
Browshot.prototype.screenshotPdfFile = function(id = 0, file = '', args = { }, callback) {
	return saveArtifact(this, 'screenshotPdf', id, file, args, callback);
}

/**
 * Retrieve a video and save it to a file.
 * The actual format can be WebM even when MP4 was requested.
 * @param  {Number}   id          Screenshot ID. Required.
 * @param  {String}   file        Local file name. Required.
 * @param  {Object}   args        arguments. Optional.
 * @param  {Function} callback    Callback with the file name, or an empty string on failure.
 */
Browshot.prototype.screenshotVideoFile = function(id = 0, file = '', args = { }, callback) {
	return saveArtifact(this, 'screenshotVideo', id, file, args, callback);
}

function downloadArtifact(client, format, id, args, callback, retry = 0) {
	if (id == 0) {
		client.error("Missing screenshot ID");
		return callback('');
	}

	const query = Object.assign({}, args, { id: id });
	return client._request('screenshot/' + format, query, () => ({ encoding: null }), function(err, response, body) {
		if (err || !response || response.statusCode != 200) {
			if ((err || !response || response.statusCode >= 500 || response.statusCode == 429) && retry + 1 < client.retry) {
				return downloadArtifact(client, format, id, args, callback, retry + 1);
			}
			client.error('Screenshot ' + format + ' cannot be retrieved');
			return callback('');
		}

		var contentType = (response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
		var types = format == 'pdf' ? ['application/pdf'] : ['video/webm', 'video/mp4', 'image/gif'];
		if (!Buffer.isBuffer(body) || body.length == 0 || !types.includes(contentType)) {
			client.error('Screenshot ' + format + ' cannot be retrieved: incorrect format');
			return callback('');
		}

		return callback(body);
	});
}

function saveArtifact(client, method, id, file, args, callback) {
	if (id == 0 || file == '') {
		client.error(id == 0 ? "Missing screenshot ID" : "Missing file");
		return callback('');
	}

	return client[method](id, args, function(data) {
		if (!Buffer.isBuffer(data) || data.length == 0) {
			return callback('');
		}

		fs.writeFile(file, data, function(err) {
			if (err) {
				client.error('Screenshot could not be saved');
				return callback('');
			}
			return callback(file);
		});
	});
}

/**
 * Share a screenshot.
 * @link http://browshot.com/api/documentation#screenshot_share 
 * @param  {Number}   id          Screenshot ID. Required. 
 * @param  {Object}   args        arguments. Optional.
 * @param  {Function} callback    Callback function
 * @return {Object}   The screenshot properties
 */
Browshot.prototype.screenshotShare = function(id = 0, args = { }, callback) {
	if (id == 0) {
		this.error("Missing screenshot ID");
		return callback({status: 'error', error: 'Missing screenshot ID'});
	}
	
	args.id = id;

	return this.return_reply('screenshot/share', args, callback);
}

/**
 * Delete details of a screenshot.
 * @link http://browshot.com/api/documentation#screenshot_delete
 * @param  {Number}   id          Screenshot ID. Required. 
 * @param  {Object}   args        arguments. Optional.
 * @param  {Function} callback    Callback function
 * @return {Object}   The screenshot properties
 */
Browshot.prototype.screenshotDelete = function(id = 0, args = { }, callback) {
	if (id == 0) {
		this.error("Missing screenshot ID");
		return callback({status: 'error', error: 'Missing screenshot ID'});
	}
	
	args.id = id;

	return this.return_reply('screenshot/delete', args, callback);
}

/**
 * Get the HTML code of the rendered page.
 * @link http://browshot.com/api/documentation#screenshot_html
 * @param  {Number}   id          Screenshot ID. Required. 
 * @param  {Function} callback    Callback function
 * @return {Object}   The HTML code
 */
Browshot.prototype.screenshotHtml = function(id = 0, args = {}, callback) {
	if (typeof args === 'function') {
		callback = args;
		args = {};
	}
	if (id == 0) {
		this.error("Missing screenshot ID");
		return callback('');
	}

	return this.return_string('screenshot/html', Object.assign({}, args, { id: id }), callback);
}

/**
 * Request multiple screenshots.
 * @link http://browshot.com/api/documentation#screenshot_multiple
 * @param  {Object}   args        arguments. Optional.
 * @param  {Function} callback    Callback function
 * @return {Object}   The screenshots properties
 */
Browshot.prototype.screenshotMultiple = function(args = { }, callback) {
	return this.return_reply('screenshot/multiple', args, callback);
}


/**
 * Request multiple screenshots from a text file.
 * @link http://browshot.com/api/documentation#batch_create
 * @param  {String}   file        File path. Required. 
 * @param  {Number}   instance_id Legacy instance ID. Optional.
 * @param  {Object}   args        arguments. Optional.
 * @param  {Function} callback    Callback function
 * @return {Object}   The batch properties
 */
Browshot.prototype.batchCreate = function(file = '', instance_id = null, args = {}, callback) {
	if (typeof instance_id === 'function') {
		callback = instance_id;
		instance_id = null;
	} else if (instance_id && typeof instance_id === 'object') {
		callback = args;
		args = instance_id;
		instance_id = null;
	} else if (typeof args === 'function') {
		callback = args;
		args = {};
	}
	if (file == '') {
		this.error("Missing file");
			return callback({status: 'error', error: 'Missing file'});
	}
	
	
	args = Object.assign({}, args);
	if (instance_id != null) args.instance_id = instance_id;
	args.file = file;
	
	return this.return_post_reply('batch/create', args, callback);
}

/**
 * Get information about a screenshot batch requested previously.
 * @link http://browshot.com/api/documentation#batch_info 
 * @param  {Number}   id       Batch ID. Required. 
 * @param  {Object}   args     arguments. Optional.
 * @param  {Function} callback Callback function
 * @return {Object}   The batch properties
 */
Browshot.prototype.batchInfo = function(id = 0, args = { }, callback) {
	if (id == 0) {
		this.error("Missing batch ID");
		return callback({status: 'error', error: 'Missing batch ID'});
	}
	
	args.id = id;
	
	return this.return_reply('batch/info', args, callback);
}


/**
 * Crawl a domain and screenshot all pages.
 * @link http://browshot.com/api/documentation#crawl_create
 * @param  {String}   domain      Domain to crawl. Required. 
 * @param  {String}   url        	URL to start with. Required.
 * @param  {Number}   instance_id Legacy instance ID. Optional.
 * @param  {Object}   args        arguments. Optional.
 * @param  {Function} callback    Callback function
 * @return {Object}   The crawl properties
 */
Browshot.prototype.crawlCreate = function(domain = '', url = '', instance_id = null, args = {}, callback) {
	if (typeof url === 'function' || (url && typeof url === 'object')) {
		callback = typeof url === 'function' ? url : instance_id;
		args = typeof url === 'function' ? {} : url;
		url = '';
		instance_id = null;
	} else if (typeof instance_id === 'function') {
		callback = instance_id;
		instance_id = null;
	} else if (instance_id && typeof instance_id === 'object') {
		callback = args;
		args = instance_id;
		instance_id = null;
	} else if (typeof args === 'function') {
		callback = args;
		args = {};
	}
	if (domain == '') {
		this.error("Missing domain");
			return callback({status: 'error', error: 'Missing domain'});
	}

	
	
	args = Object.assign({}, args);
	if (instance_id != null) args.instance_id = instance_id;
	args.domain = domain;
	if (url) args.url = url;
	
	return this.return_reply('crawl/create', args, callback);
}

/**
 * Get information about a crawl requested previously.
 * @link http://browshot.com/api/documentation#batch_info 
 * @param  {Number}   id       Crawl ID. Required. 
 * @param  {Object}   args     arguments. Optional.
 * @param  {Function} callback Callback function
 * @return {Object}   The crawl properties
 */
Browshot.prototype.crawlInfo = function(id = 0, args = { }, callback) {
	if (id == 0) {
		this.error("Missing crawl ID");
		return callback({status: 'error', error: 'Missing crawl ID'});
	}
	
	args.id = id;
	
	return this.return_reply('crawl/info', args, callback);
}

/**
 * Get the information about the user account.
 * @link http://browshot.com/api/documentation#account_info
 * @param  {Object}   args    Optional arguments
 * @param  {Function} callback Callback function
 * @return {Object}   The account information properties
 */
Browshot.prototype.accountInfo = function(args = { }, callback) {
	return this.return_reply('account/info', args, callback);
}



Browshot.prototype.deviceList = function(args, callback) {
	if (typeof args === 'function') return this.deviceList({}, args);
	return this.return_reply('device/list', args, callback);
};

Browshot.prototype.appList = function(args, callback) {
	if (typeof args === 'function') return this.appList({}, args);
	return this.return_reply('app/list', args, callback);
};

Browshot.prototype.appInfo = function(id, args, callback) {
	if (typeof args === 'function') return this.appInfo(id, {}, args);
	return this.return_reply('app/info', Object.assign({}, args, { id: id }), callback);
};

Browshot.prototype.appCreate = function(args, callback) {
	return appRequest(this, 'app/create', args, callback);
};

Browshot.prototype.appUpdate = function(id, args, callback) {
	return appRequest(this, 'app/update', Object.assign({}, args, { id: id }), callback);
};

Browshot.prototype.appDelete = function(id, args, callback) {
	if (typeof args === 'function') return this.appDelete(id, {}, args);
	return appRequest(this, 'app/delete', Object.assign({}, args, { id: id }), callback);
};

Browshot.prototype.appTest = function(id, args, callback) {
	if (typeof args === 'function') return this.appTest(id, {}, args);
	return appRequest(this, 'app/test', Object.assign({}, args, { id: id }), callback);
};

Browshot.prototype.appRun = function(id, apps, args, callback) {
	if (typeof args === 'function') return this.appRun(id, apps, {}, args);
	return appRequest(this, 'app/run', Object.assign({}, args, { screenshot_id: id, apps: apps }), callback);
};

function appRequest(client, action, args, callback) {
	const body = Object.assign({}, args);
	const query = { api_version: body.api_version };
	delete body.api_version;
	for (const field of ['id', 'screenshot_id']) {
		if (typeof body[field] === 'string' && /^\d+$/.test(body[field])) body[field] = Number(body[field]);
	}
	if (body.isActive === 0 || body.isActive === 1) body.isActive = Boolean(body.isActive);
	if (Array.isArray(body.apps)) body.apps = body.apps.map(String);
	return client._request(action, query, () => ({ method: 'POST', json: body, strictSSL: true }), (err, response, data) => {
		return callback(err || typeof data !== 'object' || data === null ?
			{ error: 1, message: 'Invalid server response' } : data, client);
	});
}

module.exports = Browshot;