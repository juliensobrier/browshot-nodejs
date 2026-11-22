Browshot
================================

# Browshot for Node.js

Browshot ( https://browshot.com/ ) is a web service to easily make screenshots of web pages in any screen size, as any device: iPhone, iPad, Android, PC, etc. Browshot has full Flash, JavaScript, CSS, & HTML5 support.

The latest API version is detailed at https://browshot.com/api/documentation. browshot follows the API documentation very closely: the function names are similar to the URLs used (screenshot/create becomes screenshot_create(), instance/list becomes instance_list(), etc.), the request arguments are exactly the same, etc.

The library version matches closely the API version it handles: browshot 1.0.0 is the first release for the API 1.0, browshot 1.1.1 is the second release for the API 1.1, etc.

browshot can handle most the API updates within the same major version, e.g. browshot 1.0.0 should be compatible with the API 1.1 or 1.2.

You can install the library from npm: https://www.npmjs.com/package/browshot

The source code can be found on github at https://github.com/juliensobrier/browshot-nodejs



INSTALLATION

    npm build && npm install


DEPENDENCIES

The following npm modules are required to run browshot

    request
    image-type


## Features

- Desktop and mobile screenshots, including full-page captures and thumbnails.
- Browser and instance selection, including native clients in the United States, Germany, Australia, France, India, Finland, and the United Kingdom.
- Retina captures with `device_scale: 2`.
- Ad blocking with `hide_ads: 1`.
- PDFs with paper size, margins, orientation, backgrounds, and one-page output settings.
- Short videos in WebM, MP4, or animated GIF format.
- Screenshot status, metadata, rendered HTML, search, and listing.
- Multiple screenshot requests, batches, and crawls through the corresponding API methods.

Available browsers and capabilities depend on the selected instance. PDF and video require a paid Chrome-based instance.

## Install

```sh
npm install browshot
```

Create a [Browshot account](https://browshot.com/) and get an API key from your dashboard. Keep the key on your server.

```sh
export BROWSHOT_API_KEY='your-api-key'
```

```js
const Browshot = require('browshot');

const client = new Browshot(process.env.BROWSHOT_API_KEY);
console.log(client.apiVersion()); // '1.32'
```

The constructor also accepts a debug flag, API base URL, and retry limit:

```js
const client = new Browshot(
  process.env.BROWSHOT_API_KEY,
  false,
  'https://api.browshot.com/api/v1',
  3
);
```

Keep debugging disabled in production: debug output includes request URLs with the API key.

## How the API works

`client.screenshotCreate(options, callback)` submits a capture. The callback receives its details, including an `id` and a `status`. A capture can be `in_process`, `finished`, or `error`. If it is still pending, use `screenshotInfo` to check its status before downloading its artifacts.

Methods follow the API endpoint names in camelCase: `/screenshot/create` becomes `screenshotCreate`, `/instance/list` becomes `instanceList`, and `/screenshot/pdf` becomes `screenshotPdf`. Capture options use the API's original names, such as `instance_id` and `hide_ads`.

Callbacks receive the result directly; they do not use Node's `(error, result)` convention. JSON methods return an object. Binary download methods return a `Buffer`, or an empty string on failure. File helpers return the saved filename, or an empty string on failure.

### Wait for a capture

The following helper checks status every two seconds and stops after five minutes. Reuse it in the examples below.

```js
function waitForCapture(screenshot, callback, started = Date.now()) {
  if (screenshot.error || screenshot.status === 'error') {
    return callback(new Error(screenshot.message || screenshot.error || 'Capture failed'));
  }
  if (screenshot.status === 'finished') {
    return callback(null, screenshot);
  }
  if (!screenshot.id || Date.now() - started >= 5 * 60 * 1000) {
    return callback(new Error('Capture did not finish within five minutes'));
  }
  setTimeout(() => {
    client.screenshotInfo(screenshot.id, {}, next => {
      waitForCapture(next, callback, started);
    });
  }, 2000);
}
```

### Capture and save a screenshot

```js
client.screenshotCreate({
  url: 'https://example.com/',
  instance_id: 373, // Chrome in France; see instanceList for available instances
  size: 'page',
  hide_ads: 1,
  device_scale: 2
}, screenshot => {
  waitForCapture(screenshot, (error, finished) => {
    if (error) return console.error(error.message);
    client.screenshotThumbnailFile(finished.id, 'example.png', {}, file => {
      if (!file) return console.error('Could not save the screenshot');
      console.log('Saved to ' + file);
    });
  });
});
```

Use `client.screenshotThumbnail(id, options, callback)` to receive image bytes instead of saving a file. Thumbnail options include `width`, `height`, and `format`.

### Generate and save a PDF

PDF is an extra artifact on a screenshot request. Set `pdf: 1` when creating the capture, then download it when the capture finishes.

```js
client.screenshotCreate({
  url: 'https://example.com/',
  instance_id: 373,
  pdf: 1,
  pdf_format: 'a4',
  pdf_background: 1,
  pdf_landscape: 0,
  pdf_margin: '10mm',
  hide_ads: 1
}, screenshot => {
  waitForCapture(screenshot, (error, finished) => {
    if (error) return console.error(error.message);
    client.screenshotPdfFile(finished.id, 'example.pdf', {}, file => {
      if (!file) return console.error('Could not save the PDF');
      console.log('Saved to ' + file);
    });
  });
});
```

For an existing completed PDF capture:

```js
client.screenshotPdf(screenshotId, {}, pdf => {
  if (!Buffer.isBuffer(pdf)) return console.error('PDF unavailable');
  console.log('Downloaded ' + pdf.length + ' bytes');
});
```

### Record and save a video

```js
client.screenshotCreate({
  url: 'https://example.com/',
  instance_id: 373,
  video: 1,
  video_format: 'webm', // 'mp4' and 'gif' are also supported
  video_duration: 5,
  video_fps: 24,
  video_scale: 0.5,
  hide_ads: 1
}, screenshot => {
  waitForCapture(screenshot, (error, finished) => {
    if (error) return console.error(error.message);
    client.screenshotVideoFile(finished.id, 'example.webm', {}, file => {
      if (!file) return console.error('Could not save the video');
      console.log('Saved to ' + file);
    });
  });
});
```

Use `client.screenshotVideo(id, {}, callback)` to receive a `Buffer`. Both download methods accept WebM, MP4, and GIF artifacts. MP4 requests can fall back to WebM; inspect the downloaded bytes before assuming the format. File helpers write the supplied path without changing its extension or converting the content.

For animated GIF, set `video_format: 'gif'`. GIF uses 20 fps regardless of `video_fps`, and defaults to half-scale output. Video cannot be combined with `device_scale: 2`.

## API 1.32 capture options

All options are passed through to the API; the service validates combinations and instance capabilities.

| Option | Values and default |
| --- | --- |
| `pdf` | `0` or `1`; default `0` |
| `pdf_format` | `letter` (default), `a4`, `legal` |
| `pdf_background` | `0` or `1`; default `0` |
| `pdf_one_page` | `0` or `1`; default `0` |
| `pdf_landscape` | `0` or `1`; default `0` |
| `pdf_margin` | Nonnegative CSS length in `px`, `mm`, `cm`, or `in`; default `0px` |
| `pdf_margin_top`, `pdf_margin_bottom`, `pdf_margin_left`, `pdf_margin_right` | Override the corresponding side of `pdf_margin` |
| `video` | `0` or `1`; default `0` |
| `video_format` | `webm` (default), `mp4`, `gif` |
| `video_duration` | Integer seconds, `1`–`30`; default `15` |
| `video_quality` | Integer `0`–`63`; default `30` |
| `video_fps` | Integer `1`–`30`; default `30`; GIF always uses `20` |
| `video_scale` | `0.1`–`1`; default `1` for WebM/MP4, `0.5` for GIF |
| `device_scale` | `1` (default) or `2`; `2` enables retina output |
| `hide_ads` | `0` or `1`; default `0` |

Set `pdf: 1` when supplying `pdf_*` options, and `video: 1` when supplying `video_*` options. The API rejects artifact settings when the corresponding artifact is disabled. Existing capture options continue to work with `screenshotCreate`.

### Countries and instances

Choose a country using `instance_id`. There is no new country override argument. The additional native instances are:

| Country | Chrome | Firefox | iPhone 12 | Samsung S20 |
| --- | --- | --- | --- | --- |
| France | 373 | 374 | 375 | 376 |
| India | 377 | 378 | 379 | 380 |
| Finland | 381 | 382 | 383 | 384 |
| United Kingdom | 385 | 386 | 387 | 388 |

Each of these instances has a base price of one credit. Existing US, German, and Australian instance IDs continue to work. Query the API for current availability and instance details:

```js
client.instanceList(instances => {
  console.log(instances.shared);
});

client.instanceInfo(373, instance => {
  console.log(instance);
});
```

## Event and Promise interface

The companion [`browshot-events`](https://www.npmjs.com/package/browshot-events) package wraps capture progress in events and artifact downloads in Promises.

```js
const BrowshotEvents = require('browshot-events');
const captures = new BrowshotEvents(process.env.BROWSHOT_API_KEY);

captures.screenshotCreate({
  url: 'https://example.com/', instance_id: 373, pdf: 1, hide_ads: 1
})
  .on('finished', screenshot => {
    captures.savePdf(screenshot.id, 'example.pdf')
      .then(file => console.log('Saved to ' + file))
      .catch(file => console.error('Could not save ' + file));
  })
  .on('failed', screenshot => console.error(screenshot))
  .on('timeout', screenshot => console.error('Timed out: ' + screenshot.id));
```

## Documentation and tests

- [API reference](https://browshot.com/api/documentation)
- [Node.js source](https://github.com/juliensobrier/browshot-nodejs)
- [Browshot website](https://browshot.com/)

```sh
npm install
npm test
```