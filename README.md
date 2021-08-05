<!--
Copyright 2021 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
-->

[![Version](https://img.shields.io/npm/v/@adobe/aio-cli-lib-app-config.svg)](https://npmjs.org/package/@adobe/aio-cli-lib-app-config)
[![Downloads/week](https://img.shields.io/npm/dw/@adobe/aio-cli-lib-app-config.svg)](https://npmjs.org/package/@adobe/aio-cli-lib-app-config)
[![Node.js CI](https://github.com/adobe/aio-cli-lib-app-config/actions/workflows/node.js.yml/badge.svg)](https://github.com/adobe/aio-cli-lib-app-config/actions/workflows/node.js.yml)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Codecov Coverage](https://img.shields.io/codecov/c/github/adobe/aio-cli-lib-app-config/master.svg?style=flat-square)](https://codecov.io/gh/adobe/aio-cli-lib-app-config/)


# aio-cli-lib-app-config

node lib to provide a consistent interface to various config files that make up a Firefly app and extensions

### Loading the app config returns an object that describes the entire applications. 
Including:

- extensions
- credentials
- paths to components

Here is an example object:

```
 {
   aio: {...aioConfig...},
   packagejson: {...package.json...},
   all: {
      /*
      OPTIONAL: newer projects are organized by extensions. `application` is a placeholder used by older apps which to not explictly define extensions
      */
     'application': {
       app: {
         name, /* Name from package.json, stripped of @scope */
         version, /* version from package.json OR 0.1.0 */
         hasFrontend, /* does this app/extension have static assets to be deployed to CDN */
         hasBackend, /* does this app/extension include actions */
         dist  /* output directory, default is 'dist/'
       },
       ow: {
           /* Only relevant if hasBackend is true, these are the credentials used to deploy/invoke actions */
         apihost,
         apiversion,
         auth,
         namespace,
         package
       },
       s3: {
         creds || tvmUrl,
         credsCacheFile,
         folder,
       },
       web: {
         src,
         injectedConfig,
         distDev,
         distProd,
       },
       manifest: {
         full,
         package,
         packagePlaceholder,
         src,
       },
       actions: {
         src,
         dist,
         remote,
         urls
       }
     }
   },
   OPTIONAL:'dx/asset-compute/worker/1': {
      ...same as above...
   },
   OPTIONAL:'dx/excshell/1': {
      ...same as above...
   },
 }
```
