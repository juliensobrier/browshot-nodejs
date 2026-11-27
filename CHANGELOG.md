# Changelog

## 2.0.0

- Select API v1 for legacy request parameters and API v2 for shared endpoints and new options.
- Support v2 synchronous captures, app management, and device discovery.
- Recognize Brave and keep v1 priority and legacy instance arrays on v1.
- Add `tagList`, `screenshotListSlow`, `batchDownload`, and `ping`.
- Return the existing empty result through the callback when a thumbnail file download fails.

## 1.32.0

- Add screenshotPdf and screenshotPdfFile for screenshot/pdf.
- Add screenshotVideo and screenshotVideoFile for WebM, MP4 and GIF downloads from screenshot/video.
- Preserve binary data, validate artifact content types, handle file errors, and retry transient download failures.
- Document API 1.32 capture options and native country instance IDs; existing capture methods already pass these options through.
- Add offline HTTP tests and opt-in live artifact tests.
- Update legacy validation tests for native error responses and use a syntactically invalid URL.
