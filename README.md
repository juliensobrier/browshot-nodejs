Browshot version 1.22.0
================================

Browshot (https://browshot.com/) is a web service to easily make screenshots of web pages in any screen size, as any device: iPhone, iPad, Android, PC, etc. Browshot has full Flash, JavaScript, CSS, & HTML5 support.

The latest API version is detailed at https://browshot.com/api/documentation. browshot follows the API documentation very closely: the function names are similar to the URLs used (screenshot/create becomes screenshot_create(), instance/list becomes instance_list(), etc.), the request arguments are exactly the same, etc.

The library version matches closely the API version it handles: browshot 1.0.0 is the first release for the API 1.0, browshot 1.1.1 is the second release for the API 1.1, etc.

browshot can handle most the API updates within the same major version, e.g. browshot 1.0.0 should be compatible with the API 1.1 or 1.2.

You can install the library from npm: 

The source code can be found on github at https://github.com/juliensobrier/browshot-nodejs



INSTALLATION

    npm build && npm install


DEPENDENCIES

The following npm modules are required to run browshot

    request
