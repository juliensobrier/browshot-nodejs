'use strict';

const request = require('request');
var fs = require("fs");

var browshot;

function info(/**/) {
	var args = Array.prototype.slice.call(arguments);

	if (browshot.debug) {
		console.log(args.join(''));
	};
}

function error(/**/) {
	var args = Array.prototype.slice.call(arguments);
	
	console.log('ERROR ' + args.join(''));
}

function make_url(action, args = {}) {
	var url = browshot.base + "/" + (action || '') + '?key=' + encodeURIComponent(browshot.key);

	
	if (args.hasOwnProperty('urls')) {
		args.urls.forEach(function(url) {
				url += '&url=' + encodeURIComponent(url);
		});
		
		delete args.urls;
	}
	
	if (args.hasOwnProperty('instances')) {
		args.instances.forEach(function(instance) {
				url += '&instance_id=' + encodeURIComponent(instance);
		});
		
		delete args.instances;
	}

	for(var key in args) {
		url += '&' + encodeURIComponent(key) + '=' + encodeURIComponent(args[key]);
	}
	
	info(url);

	return url;
}

function return_string(action, args, callback, retry = 0) {
	if (retry > browshot.retry) {
			error("Too many retries: ", retry, " - ", args.url || '');
			
			return callback('');
	}
	
	var url = make_url(action, args);
	
	request(url, (err, response, body) => {
		retry++;
		if (err) { 
			error(err, " - Retry: " + retry); 
			return return_string(action, args, callback, retry);
		}
		else {
			return callback(body);
		}
	});
}

function return_post_string(action, args, callback, retry = 0) {
	if (retry > browshot.retry) {
			error("Too many retries: ", retry, " - ", args.url || '');
			
			return callback('');
	}
	
	var file = '';
	if (args.hasOwnProperty('file')) {
		file = args.file;
		delete args.file;
	}
	
	var url = make_url(action, args);
	
	const formData = {
		file: fs.createReadStream(file)
	};
	
	request.post({ url: url, formData: formData }, (err, response, body) => {
		retry++;
		if (err) { 
			error(err, " - Retry: " + retry); 
			return return_string(action, args, callback, retry);
		}
		else {
			return callback(body);
		}
	});
}


function return_reply(action, args, callback) {
	return return_string(action, args, function(data) {
		if (data == '') {
			return callback({ error: 1, message: 'Invalid server response' });
		}
		
		return callback(JSON.parse(data));
		
	});
}

function return_post_reply(action, args, file, callback) {
	return return_post_string(action, args, file, function(data) {
		if (data == '') {
			return callback({ error: 1, message: 'Invalid server response' });
		}
		
		return callback(JSON.parse(data));
		
	});
}

/**
 * Nodejs library for Browshot (https://browshot.com/), a web service to create screenshots of web pages.
 * 
 * Browshot (http://www.browshot.com/) is a web service to easily make screenshots of web pages in any screen size, as any device: iPhone, iPad, Android, PC, etc. Browshot has full Flash, JavaScript, CSS, & HTML5 support.
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
function Browshot(key, debug = false, base = 'https://api.browshot.com/api/v1', retry = 3) {
  this.key = key;
  this.debug = debug;
	this.base = base;
	this.retry = retry;
	
	browshot = this;
}

Browshot.prototype.setKey = function(key) {
  this.key = key;
};
Browshot.prototype.setDebug = function(debug = false) {
  this.debug = debug;
};
Browshot.prototype.setBase = function(base = 'https://api.browshot.com/api/v1') {
  this.base= base;
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
Browshot.prototype.simple = function(args, callback) {
	var url = make_url('simple', args);
	
	var data = {code: 500, data: ''};
	
	request(url, (err, response, body) => {
		if (err) { error(err); }
		
		return callback({ code: response.statusCode, data: body });
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
Browshot.prototype.simpleFile = function(file, args, callback) {
	var url = make_url('simple', args);
	
	var data = {code: 500, data: ''};
	
	request(url, (err, response, body) => {
		if (err || response.statusCode != 200) { 
			error(err, ' ', url); 
			
			return callback({ code: response.statusCode, file: '' });
		}
		
		if (body != '') {
			fs.writeFile(file, body, (err) => {
				if (err) {
					error(err);
					
					return callback({ code: response.statusCode, file: '' });
				}
					
				return callback({ code: response.statusCode, file: file });
			});
		}
		else {
			error('No image returned');
			return callback({ code: response.statusCode, file: '' });
		}
	});
	
	return data;
}


/**
 * Return the list of instances.
 * @link http://browshot.com/api/documentation#instance_list
 * @param  {Object}   args        arguments. Optional.
 * @param  {Function} callback    Callback function
 * @return {Object}   Return the list of instances.
 */
Browshot.prototype.instanceList = function(callback) {
	var url = make_url('instance/list');
	
	request(url, (err, response, body) => {
		if (err) {
			error(err);
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
			error("Missing instance ID");
			return callback({status: 'error', error: 'Missing instance ID'});
	}
	
	
	var url = make_url('instance/info', { id: id });
	
	request(url, (err, response, body) => {
		if (err) {
			error(err);
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
	var url = make_url('browser/list');
	
	request(url, (err, response, body) => {
		if (err) {
			error(err);
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
			error("Missing browser ID");
			return callback({status: 'error', error: 'Missing browser ID'});
	}
	
	
	var url = make_url('browser/info', { id: id });
	
	request(url, (err, response, body) => {
		if (err) {
			error(err);
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
			error("Missing URL");
			return callback({ status: 'error', error: "Missing URL" });
	}
	if (! args.hasOwnProperty('instance_id')) {
			error("Missing instance ID");
			return callback({ status: 'error', error: "Missing instance ID" });
	}
	
	return return_reply('screenshot/create', args, callback);
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
			error("Missing screenshot ID");
			return callback({ status: 'error', error: "Missing screenshot ID" });
	}
	
	args.id = id;

	return return_reply('screenshot/info', args, callback);
}

/**
 * Get details about screenshots requested.
 * @link http://browshot.com/api/documentation#screenshot_list
 * @param  {Object}   args        arguments. Optional.
 * @param  {Function} callback    Callback function
 * @return {Object}   Return the screenshot list.
 */
Browshot.prototype.screenshotList = function(args = { }, callback) {
	return return_reply('screenshot/list', args, callback);
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
			error("Missing URL");
			return callback({ status: 'error', error: "Missing screenshot URL" });
	}
	
	args.url = url;

	return return_reply('screenshot/search', args, callback);
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
			error("Missing screenshot ID");
			return callback({ status: 'error', error: "Missing screenshot ID" });
	}
	
	args.id = id;

	return return_reply('screenshot/host', args, callback);
}

/**
 * Retrieve the screenshot, or a thumbnail.
 * @link http://browshot.com/api/documentation#screenshot_thumbnail
 * @param  {Number}   id          Screenshot ID. Required. 
 * @param  {Object}   args        arguments. Optional.
 * @param  {Function} callback    Callback function
 * @return {Object}   Return the image content.
 */
Browshot.prototype.screenshotThumbnail = function(id = 0, args = { }, callback) {
	if (id == 0) {
			error("Missing screenshot ID");
			return callback({ status: 'error', error: "Missing screenshot ID" });
	}
	
	args.id = id;
	
	var url = make_url('screenshot/thumbnail', args);
	
	request(url, (err, response, body) => {
		if (err) {
			error(err);
			error(body);
			return callback('');
		}
		
		return callback(body);
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
			error("Missing screenshot ID");
			return callback('');
	}
	
	if (file == '') {
			error("Missing file");
			return callback('');
	}
	
	args.id = id;
	
	this.screenshotThumbnail(id, args, function(data) {
		if (data != '') {
			fs.writeFile(file, data, (err) => {
				if (err) {
					error(err);
					
					return callback('');
				}
					
				return callback(file);
			});
		}
		else {
			error("No screeenshot retrieved");
			return callback('');
		}
		
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
			error("Missing screenshot ID");
			return callback({status: 'error', error: 'Missing screenshot ID'});
	}
	
	args.id = id;

	return return_reply('screenshot/share', args, callback);
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
			error("Missing screenshot ID");
			return callback({status: 'error', error: 'Missing screenshot ID'});
	}
	
	args.id = id;

	return return_reply('screenshot/delete', args, callback);
}

/**
 * Get the HTML code of the rendered page.
 * @link http://browshot.com/api/documentation#screenshot_html
 * @param  {Number}   id          Screenshot ID. Required. 
 * @param  {Object}   args        arguments. Optional.
 * @param  {Function} callback    Callback function
 * @return {Object}   The batch properties
 */
Browshot.prototype.screenshotHtml = function(id = 0, args = { }, callback) {
	if (id == 0) {
			error("Missing screenshot ID");
			return callback({status: 'error', error: 'Missing screenshot ID'});
	}
	
	args.id = id;

	return return_reply('screenshot/html', args, callback);
}

/**
 * Request multiple screenshots.
 * @link http://browshot.com/api/documentation#screenshot_multiple
 * @param  {Object}   args        arguments. Optional.
 * @param  {Function} callback    Callback function
 * @return {Object}   The screenshots properties
 */
Browshot.prototype.screenshotMultiple = function(args = { }, callback) {
	return return_reply('screenshot/multiple', args, callback);
}


/**
 * Request multiple screenshots from a text file.
 * @link http://browshot.com/api/documentation#batch_create
 * @param  {String}   file        File path. Required. 
 * @param  {Number}   instance_id Instance ID. Required. 
 * @param  {Object}   args        arguments. Optional.
 * @param  {Function} callback    Callback function
 * @return {Object}   The batch properties
 */
Browshot.prototype.batchCreate = function(file = '', instance_id = 0, args = { }, callback) {
	if (file == '') {
			error("Missing file");
			return callback({status: 'error', error: 'Missing file'});
	}
	
	if (instance_id == 0) {
			error("Missing instance ID");
			return callback({status: 'error', error: 'Missing instance ID'});
	}
	
	args.instance_id = instance_id;
	
	
	return return_post_reply('batch/create', args, file, callback);
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
			error("Missing batch ID");
			return callback({status: 'error', error: 'Missing batch ID'});
	}
	
	return return_reply('batch/info', args, callback);
}

/**
 * Get the information about the user account.
 * @link http://browshot.com/api/documentation#account_info
 * @param  {Object}   args    Optional arguments
 * @param  {Function} callback Callback function
 * @return {Object}   The account information properties
 */
Browshot.prototype.accountInfo = function(args = { }, callback) {
	return return_reply('account/info', args, callback);
}



module.exports = Browshot;