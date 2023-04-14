/*
Copyright 2019 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

const { stdout, stderr } = require('stdout-stderr')

jest.setTimeout(15000)

const fs = jest.requireActual('fs')
const eol = require('eol')
const path = require('path')

const fileSystem = require('jest-plugin-fs').default
const project = {
  org: {
    ims_org_id: "00000000000000000100000@AdobeOrg"
  }
}

// dont touch the real fs
global.mockFs = () => {
  jest.unmock('fs-extra')
  jest.mock('fs', () => require('jest-plugin-fs/mock'))

  // set the fake filesystem
  global.fakeFileSystem = {
    addJson: (json) => {
      // add to existing
      fileSystem.mock(json)
    },
    removeKeys: (arr) => {
      // remove from existing
      const files = fileSystem.files()
      for (const prop in files) {
        if (arr.includes(prop)) {
          delete files[prop]
        }
      }
      fileSystem.restore()
      fileSystem.mock(files)
    },
    clear: () => {
      // reset to empty
      fileSystem.restore()
    },
    reset: () => {
      // reset file system
      // TODO: add any defaults
      fileSystem.restore()
    },
    files: () => {
      return fileSystem.files()
    }
  }
  // seed the fake filesystem
  global.fakeFileSystem.reset()
}

global.unmockFs = () => {

}

// trap console log
beforeEach(() => {
  stdout.start()
  stderr.start()
  // change this if you need to see logs from stdout
  stdout.print = false
})
afterEach(() => { stdout.stop(); stderr.stop() })

process.on('unhandledRejection', error => {
  throw error
})

jest.mock('@adobe/aio-lib-env')

/* global fixtureFile, fixtureJson */

const fixturesFolder = path.join(__dirname, '__fixtures__')

global.fixturePath = (file) => {
  return `${fixturesFolder}/${file}`
}
// helper for fixtures
global.fixtureFile = (output) => {
  return fs.readFileSync(global.fixturePath(output)).toString()
}

// helper for fixtures
global.fixtureJson = (output) => {
  return JSON.parse(fs.readFileSync(global.fixturePath(output)).toString())
}

// helper for fixtures
// global.fixtureHjson = (output) => {
//   return hjson.parse(fs.readFileSync(global.fixturePath(output)).toString())
// }

// fixture matcher
expect.extend({
  toMatchFixture (received, argument) {
    const val = fixtureFile(argument)
    // eslint-disable-next-line jest/no-standalone-expect
    expect(eol.auto(received)).toEqual(eol.auto(val))
    return { pass: true }
  }
})

expect.extend({
  toMatchFixtureJson (received, argument) {
    const val = fixtureJson(argument)
    // eslint-disable-next-line jest/no-standalone-expect
    expect(received).toEqual(val)
    return { pass: true }
  }
})

// expect.extend({
//   toMatchFixtureHjson (received, argument) {
//     const val = fixtureHjson(argument)
//     // eslint-disable-next-line jest/no-standalone-expect
//     expect(received).toEqual(val)
//     return { pass: true }
//   }
// })

global.loadFixtureApp = (appFolder) => {
  const fsJSON = {}
  const stack = [appFolder]
  while (stack.length > 0) {
    const curr = stack.pop()
    const stat = fs.statSync(global.fixturePath(curr))
    if (stat.isDirectory()) {
      stack.push(...fs.readdirSync(global.fixturePath(curr)).map(f => path.join(curr, f).split(path.sep).join(path.posix.sep)))
    } else {
      // is file, populate the in memory json fs
      // e.g 'actions/action-zip/index.js': global.fixtureFile('app/actions/action-zip/index.js'),
      fsJSON[curr.split(appFolder + '/').join('')] = global.fixtureFile(curr)
    }
  }
  global.fakeFileSystem.addJson(fsJSON)
  process.chdir('/') // cannot chdir to a non existing dir in the real fs.. so files are loaded in the root memory fs
}

global.defaultAppHostName = 'adobeio-static.net'
global.defaultTvmUrl = 'https://adobeio.adobeioruntime.net/apis/tvm/'
global.defaultOwApihost = 'https://adobeioruntime.net'
global.fakeS3Bucket = 'fake-bucket'

global.fakeConfig = {
  tvm: {
    project,
    runtime: {
      namespace: 'fake_ns',
      auth: 'fake:auth'
    }
  },
  project,
  local: {
    project,
    runtime: {
      // those must match the once set by dev cmd
      apihost: 'http://localhost:3233',
      namespace: 'guest',
      auth: '23bc46b1-71f6-4ed5-8c54-816aa4f8c502:123zO3xZCLrMN6v2BKK1dXYFpXlPkccOFqm12CdAsMgRU4VrNZ9lyGVCGuMDGIwP'
    }
  },
  // todo delete those should not be passed via aio now
  creds: {
    project,
    runtime: {
      namespace: 'fake_ns',
      auth: 'fake:auth'
    },
    app: {
      s3bucket: 'customBucket',
      awsaccesskeyid: 'fakeAwsKeyId',
      awssecretaccesskey: 'fakeAwsSecretKey'
    }
  },
  // todo delete those should not be passed via aio now
  app: {
    htmlCacheDuration: 60,
    jsCacheDuration: 604800,
    cssCacheDuration: 604800,
    imageCacheDuration: 604800
  }
}

// mocked .aio.app config for __fixtures__/legacy-app
global.aioLegacyAppConfig = {
  actions: './myactions'
}

global.fakeS3Creds = {
  s3bucket: 'customBucket',
  accessKeyId: 'fakeAwsKeyId',
  secretAccessKey: 'fakeAwsSecretKey'
}

global.extraConfig = {
  s3Creds: (extName) => {
    return {
      [`all.${extName}.s3.creds`]: global.fakeS3Creds,
      [`all.${extName}.s3.folder`]: global.fakeConfig.tvm.runtime.namespace
    }
  }
}

global.fakeTVMResponse = {
  sessionToken: 'fake',
  expiration: '1970-01-01T00:00:00.000Z',
  accessKeyId: 'fake',
  secretAccessKey: 'fake',
  params: { Bucket: global.fakeS3Bucket }
}
