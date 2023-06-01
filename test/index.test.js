/*
Copyright 2020 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

global.mockFs()
const appConfig = require('../src')
const mockAIOConfig = require('@adobe/aio-lib-core-config')

const yaml = require('js-yaml')
const path = require('path')

const libEnv = require('@adobe/aio-lib-env')

jest.mock('@adobe/aio-lib-env')
const getMockConfig = require('./data-mocks/config-loader')
describe('load config', () => {
  let config
  beforeEach(async () => {
    // two calls to aio config are made let's mock them
    mockAIOConfig.get.mockImplementation(k => global.fakeConfig.tvm)
    process.chdir('/')
    // empty all fake files
    global.fakeFileSystem.clear()
    libEnv.getCliEnv.mockReturnValue('prod')
  })

  // main cases
  test('standalone app config', async () => {
    global.loadFixtureApp('app')
    config = appConfig.load() // {} or not for coverage
    const mockConfig = getMockConfig('app', global.fakeConfig.tvm, {
      'all.application.project': expect.any(Object)
    })
    expect(config).toEqual(mockConfig)
  })

  test('not in an app', async () => {
    global.loadFixtureApp('not-in-app')
    expect(() => appConfig.load()).toThrow(new Error('package.json: ENOENT: no such file or directory, open \'package.json\''))
  })

  test('exc extension config', async () => {
    global.loadFixtureApp('exc')
    config = appConfig.load({})
    expect(config).toEqual(getMockConfig('exc', global.fakeConfig.tvm, {
      'all.dx/excshell/1': expect.any(Object)
    }))
  })

  test('exc with events config', async () => {
    global.loadFixtureApp('exc-with-events')
    config = appConfig.load({})
    expect(config.all['dx/excshell/1']).toEqual(expect.objectContaining({ events: expect.any(Object) }))
  })

  test('standalone app, exc and nui extension config', async () => {
    global.loadFixtureApp('app-exc-nui')
    config = appConfig.load({})
    expect(config).toEqual(getMockConfig('app-exc-nui', global.fakeConfig.tvm, {
      'all.application.project': expect.any(Object),
      'all.dx/excshell/1.project': expect.any(Object),
      'all.dx/asset-compute/worker/1.project': expect.any(Object)
    }))
  })

  test('standalone app with no actions', async () => {
    global.loadFixtureApp('app-no-actions')
    config = appConfig.load({})
    expect(config).toEqual(getMockConfig('app-no-actions', global.fakeConfig.tvm, {
      'all.application.project': expect.any(Object),
      'all.application.events': expect.undefined
    }))
  })

  test('exc with complex include pattern', async () => {
    global.loadFixtureApp('exc-complex-includes')
    config = appConfig.load({})
    expect(config).toEqual(getMockConfig('exc-complex-includes', global.fakeConfig.tvm, {
      'all.dx/excshell/1.project': expect.any(Object)
    }))
  })

  test('standalone application with legacy configuration system', async () => {
    global.loadFixtureApp('legacy-app')
    const fullAioConfig = { app: global.aioLegacyAppConfig, ...global.fakeConfig.tvm }
    // mock app config
    mockAIOConfig.get.mockImplementation(k => fullAioConfig)
    config = appConfig.load({})
    expect(config).toEqual(getMockConfig('legacy-app', fullAioConfig, {
      'all.application.project': expect.any(Object)
    }))
  })

  // corner cases - coverage
  test('exc with default package.json name & version', async () => {
    global.loadFixtureApp('exc')
    global.fakeFileSystem.addJson({ '/package.json': '{}' })
    config = appConfig.load({})
    expect(config).toEqual(getMockConfig('exc', global.fakeConfig.tvm, {
      // will set defaults
      'all.dx/excshell/1.app.name': 'unnamed-app',
      'all.dx/excshell/1.app.version': '0.1.0',
      'all.dx/excshell/1.ow.package': 'unnamed-app-0.1.0',
      'all.dx/excshell/1.project': expect.any(Object),
      'packagejson.name': 'unnamed-app',
      'packagejson.version': '0.1.0'
    }))
  })

  test('exc with custom dist folder', async () => {
    global.loadFixtureApp('exc')
    // rewrite configuration
    const userConfig = yaml.load(global.fixtureFile('exc/src/dx-excshell-1/ext.config.yaml'))
    userConfig.dist = 'new/dist/for/excshell'
    global.fakeFileSystem.addJson({ '/src/dx-excshell-1/ext.config.yaml': yaml.dump(userConfig) })

    config = appConfig.load({})
    expect(config).toEqual(getMockConfig('exc', global.fakeConfig.tvm, {
      'all.dx/excshell/1.app.dist': path.resolve('/src/dx-excshell-1/new/dist/for/excshell'),
      'all.dx/excshell/1.actions.dist': path.resolve('/src/dx-excshell-1/new/dist/for/excshell/actions'),
      'all.dx/excshell/1.web.distDev': path.resolve('/src/dx-excshell-1/new/dist/for/excshell/web-dev'),
      'all.dx/excshell/1.web.distProd': path.resolve('/src/dx-excshell-1/new/dist/for/excshell/web-prod'),
      'all.dx/excshell/1.project': expect.any(Object),
      includeIndex: expect.any(Object)
    }))
  })

  test('exc with byo aws credentials', async () => {
    global.loadFixtureApp('exc')
    // rewrite configuration
    const userConfig = yaml.load(global.fixtureFile('exc/src/dx-excshell-1/ext.config.yaml'))
    userConfig.awsaccesskeyid = 'fakeid'
    userConfig.awssecretaccesskey = 'fakesecret'
    userConfig.s3bucket = 'fakebucket'
    global.fakeFileSystem.addJson({ '/src/dx-excshell-1/ext.config.yaml': yaml.dump(userConfig) })

    config = appConfig.load({})
    expect(config).toEqual(getMockConfig('exc', global.fakeConfig.tvm, {
      'all.dx/excshell/1.s3.creds': {
        accessKeyId: 'fakeid',
        secretAccessKey: 'fakesecret',
        params: { Bucket: 'fakebucket' }
      },
      'all.dx/excshell/1.project': expect.any(Object),
      includeIndex: expect.any(Object)
    }))
  })

  test('exc with custom tvm url', async () => {
    global.loadFixtureApp('exc')
    // rewrite configuration
    const userConfig = yaml.load(global.fixtureFile('exc/src/dx-excshell-1/ext.config.yaml'))
    userConfig.tvmurl = 'customurl'
    global.fakeFileSystem.addJson({ '/src/dx-excshell-1/ext.config.yaml': yaml.dump(userConfig) })

    config = appConfig.load({})
    expect(config).toEqual(getMockConfig('exc', global.fakeConfig.tvm, {
      'all.dx/excshell/1.s3.tvmUrl': 'customurl',
      'all.dx/excshell/1.project': expect.any(Object),
      includeIndex: expect.any(Object)
    }))
  })

  test('exc with default tvm url', async () => {
    global.loadFixtureApp('exc')
    // rewrite configuration
    const userConfig = yaml.load(global.fixtureFile('exc/src/dx-excshell-1/ext.config.yaml'))
    userConfig.tvmurl = 'https://firefly-tvm.adobe.io'
    global.fakeFileSystem.addJson({ '/src/dx-excshell-1/ext.config.yaml': yaml.dump(userConfig) })

    config = appConfig.load({})
    expect(config).toEqual(getMockConfig('exc', global.fakeConfig.tvm, {
      'all.dx/excshell/1.project': expect.any(Object),
      includeIndex: expect.any(Object)
    }))
  })

  test('exc with an action that has no function', async () => {
    global.loadFixtureApp('exc')
    // rewrite configuration
    const userConfig = yaml.load(global.fixtureFile('exc/src/dx-excshell-1/ext.config.yaml'))
    userConfig.runtimeManifest.packages['my-exc-package'].actions.newAction = { web: 'yes' }
    global.fakeFileSystem.addJson({ '/src/dx-excshell-1/ext.config.yaml': yaml.dump(userConfig) })

    config = appConfig.load({})
    expect(config).toEqual(getMockConfig('exc', global.fakeConfig.tvm, {
      'all.dx/excshell/1.manifest.full.packages.my-exc-package.actions.newAction': { web: 'yes' },
      'all.dx/excshell/1.project': expect.any(Object),
      includeIndex: expect.any(Object)
    }))
  })

  test('exc env = stage', async () => {
    libEnv.getCliEnv.mockReturnValue('stage')
    global.loadFixtureApp('exc')

    config = appConfig.load({})
    expect(config).toEqual(getMockConfig('exc', global.fakeConfig.tvm, {
      'all.dx/excshell/1.app.defaultHostname': 'dev.runtime.adobe.io',
      'all.dx/excshell/1.app.hostname': 'dev.runtime.adobe.io',
      'all.dx/excshell/1.project': expect.any(Object),
      includeIndex: expect.any(Object)
    }))
  })

  test('missing extension operation', async () => {
    global.fakeFileSystem.addJson({
      '/package.json': '{}',
      '/app.config.yaml':
`
extensions:
  dx/excshell/1:
    no: 'operations'
`
    })
    expect(() => appConfig.load({})).toThrow('Missing \'operations\'')
  })

  test('no implementation - allowNoImpl=false', async () => {
    global.fakeFileSystem.addJson({ '/package.json': '{}' })
    expect(() => appConfig.load({})).toThrow('Couldn\'t find configuration')
  })

  test('no implementation - allowNoImpl=true', async () => {
    global.fakeFileSystem.addJson({ '/package.json': '{}' })
    config = appConfig.load({ allowNoImpl: true })
    expect(config).toEqual(getMockConfig('exc', global.fakeConfig.tvm, {
      all: {},
      implements: [],
      includeIndex: {},
      'packagejson.name': 'unnamed-app',
      'packagejson.version': '0.1.0'
    }))
  })

  test('exc - no aio config', async () => {
    global.loadFixtureApp('exc')
    mockAIOConfig.get.mockImplementation(k => {})
    config = appConfig.load({})
    expect(config).toEqual(getMockConfig('exc', {}))
  })

  test('include cycle', async () => {
    global.fakeFileSystem.addJson(
      {
        '/package.json': '{}',
        '/app.config.yaml':
`application:
  $include: b.yaml`,
        '/b.yaml':
`runtimeManifest:
  $include: dir/c.yaml`,
        '/dir/c.yaml':
'$include: ../b.yaml'
      }
    )
    expect(() => appConfig.load({})).toThrow('Detected \'$include\' cycle: \'app.config.yaml,b.yaml,dir/c.yaml,b.yaml\'')
  })

  test('include does not exist', async () => {
    global.fakeFileSystem.addJson(
      {
        '/package.json': '{}',
        '/app.config.yaml': '$include: b.yaml'
      }
    )
    expect(() => appConfig.load({})).toThrow('\'$include: b.yaml\' cannot be resolved')
  })

  test('include does not resolve to object - string', async () => {
    global.fakeFileSystem.addJson(
      {
        '/package.json': '{}',
        '/app.config.yaml': '$include: b.yaml',
        '/b.yaml': 'string'
      }
    )
    expect(() => appConfig.load({})).toThrow('\'$include: b.yaml\' does not resolve to an object')
  })

  test('include does not resolve to object - arraay', async () => {
    global.fakeFileSystem.addJson(
      {
        '/package.json': '{}',
        '/app.config.yaml': '$include: b.yaml',
        '/b.yaml': '[1,2,3]'
      }
    )
    expect(() => appConfig.load({})).toThrow('\'$include: b.yaml\' does not resolve to an object')
  })

  test('legacy-app - no hooks', async () => {
    global.loadFixtureApp('legacy-app')
    global.fakeFileSystem.addJson({
      // replace legacy app package.json which has hooks defined
      '/package.json': '{"name": "legacy-app", "version": "1.0.0", "scripts": {}}'
    })
    const fullAioConfig = { app: global.aioLegacyAppConfig, ...global.fakeConfig.tvm }
    // mock app config
    mockAIOConfig.get.mockImplementation(k => fullAioConfig)
    config = appConfig.load({})
    expect(config).toEqual(getMockConfig('legacy-app', fullAioConfig, {
      'all.application.hooks': {},
      // 'all.application.events': expect.any(Object),
      'all.application.project': expect.any(Object),
      includeIndex: expect.any(Object),
      'packagejson.scripts': {}
    }))
  })

  test('legacy-app with app.config.yaml - mixed config', async () => {
    global.loadFixtureApp('legacy-app')
    global.fakeFileSystem.addJson({
      '/app.config.yaml':
`application:
  hooks:
    another-hook: 'will be merged'
  runtimeManifest:
    packages:
      thepackage: {}`
    })
    const fullAioConfig = { app: global.aioLegacyAppConfig, ...global.fakeConfig.tvm }
    // mock app config
    mockAIOConfig.get.mockImplementation(k => fullAioConfig)
    config = appConfig.load({})
    expect(config).toEqual(getMockConfig('legacy-app', fullAioConfig, {
      'all.application.manifest.full': {
        packages: { thepackage: {} }
      },
      // 'all.application.events': expect.any(Object),
      'all.application.project': expect.any(Object),
      'all.application.manifest.package': undefined,
      'all.application.hooks': {
        // already there
        'post-app-run': 'echo hello',
        // new one
        'another-hook': 'will be merged'
      },
      includeIndex: expect.any(Object)
    }))
  })

  test('manifest with no packages', async () => {
    global.fakeFileSystem.addJson(
      {
        '/package.json': '{}',
        '/app.config.yaml': `
application:
  runtimeManifest:
    packages: {}
`
      }
    )
    config = appConfig.load({})
    expect(config.all.application.manifest.full).toEqual({ packages: {} })
  })

  test('manifest with response headers and web src', async () => {
    global.fakeFileSystem.addJson(
      {
        '/package.json': '{}',
        '/app.config.yaml': `
        application:
          web:
            src: 'web-src'
            response-headers:
              /*:
                testHeader: foo
          runtimeManifest:
            packages: {}
`
      }
    )
    config = appConfig.load({})
    expect(config.all.application.web['response-headers']).toEqual({ '/*': { testHeader: 'foo' } })
  })

  test('manifest with multiple response headers', async () => {
    global.fakeFileSystem.addJson(
      {
        '/package.json': '{}',
        '/app.config.yaml': `
        application:
          web:
            src: 'web-src'
            response-headers:
              /*:
                testHeader1: foo1
                testHeader2: foo2
                testHeader3: foo3
              /*.html:
                testHeader: htmlFoo
              /*.js:
                testHeader: jsFoo
              /test/folder/*:
                testHeader: folderFoo
          runtimeManifest:
            packages: {}
`
      }
    )
    const expectedRes = {
      '/*': { testHeader1: 'foo1', testHeader2: 'foo2', testHeader3: 'foo3' },
      '/*.html': { testHeader: 'htmlFoo' },
      '/*.js': { testHeader: 'jsFoo' },
      '/test/folder/*': { testHeader: 'folderFoo' }
    }
    config = appConfig.load({})
    expect(config.all.application.web['response-headers']).toEqual(expectedRes)
  })

  test('manifest with response headers and default web src', async () => {
    global.fakeFileSystem.addJson(
      {
        '/package.json': '{}',
        '/app.config.yaml': `
        application:
          web:
            response-headers:
              /*:
                testHeader: foo
          runtimeManifest:
            packages: {}
`
      }
    )
    config = appConfig.load({})
    expect(config.all.application.web['response-headers']).toEqual({ '/*': { testHeader: 'foo' } })
  })

  test('invalid schema: web.res-header instead of web.response-headers', async () => {
    global.fakeFileSystem.addJson(
      {
        '/package.json': '{}',
        '/app.config.yaml': `
        application:
          web:
            res-header:
              /*:
                testHeader: foo
          runtimeManifest:
            packages: {}
`
      }
    )
    expect(() => appConfig.load({})).toThrow('Missing or invalid keys in app.config.yaml')
  })

  test('invalid schema: runtimeManifest has no packages', async () => {
    global.fakeFileSystem.addJson(
      {
        '/package.json': '{}',
        '/app.config.yaml': `
        application:
          web:
            res-header:
              /*:
                testHeader: foo
          runtimeManifest: {}
`
      }
    )
    expect(() => appConfig.load({})).toThrow('Missing or invalid keys in app.config.yaml')
  })

  test('invalid schema: configSchema has no items', async () => {
    global.fakeFileSystem.addJson(
      {
        '/package.json': '{}',
        '/app.config.yaml': `
        application:
          configSchema: []
`
      }
    )
    expect(() => appConfig.load({})).toThrow('Missing or invalid keys in app.config.yaml')
  })

  test('invalid schema: configSchema has an item without envKey', async () => {
    global.fakeFileSystem.addJson(
      {
        '/package.json': '{}',
        '/app.config.yaml': `
        application:
          configSchema:
            - type: string
`
      }
    )
    expect(() => appConfig.load({})).toThrow('Missing or invalid keys in app.config.yaml')
  })

  test('invalid schema: configSchema has an item without type', async () => {
    global.fakeFileSystem.addJson(
      {
        '/package.json': '{}',
        '/app.config.yaml': `
        application:
          configSchema:
            - envKey: HELLO
`
      }
    )
    expect(() => appConfig.load({})).toThrow('Missing or invalid keys in app.config.yaml')
  })

  test('invalid schema: configSchema with an additional property', async () => {
    global.fakeFileSystem.addJson(
      {
        '/package.json': '{}',
        '/app.config.yaml': `
        application:
          configSchema:
            - envKey: HELLO
              type: string
              somenotallowed: prop
`
      }
    )
    expect(() => appConfig.load({})).toThrow('Missing or invalid keys in app.config.yaml')
  })

  test('valid configSchema', async () => {
    global.fakeFileSystem.addJson(
      {
        '/package.json': '{}',
        '/app.config.yaml': `
        application:
          runtimeManifest: { packages: {}}
          configSchema:
            - envKey: HELLO
              type: string
              secret: true
              default: hello
              title: yo
              enum:
                - hello
                - hola
                - bonjour
`
      }
    )
    expect(() => appConfig.load({})).not.toThrow()
  })
})

describe('coalesce config', () => {
  let coalesced
  beforeEach(async () => {
    // two calls to aio config are made let's mock them
    mockAIOConfig.get.mockImplementation(k => global.fakeConfig.tvm)
    process.chdir('/')
    // empty all fake files
    global.fakeFileSystem.clear()
    libEnv.getCliEnv.mockReturnValue('prod')
  })

  test('complex include config, relative paths', async () => {
    global.loadFixtureApp('exc-complex-includes')
    coalesced = appConfig.coalesceAppConfig('app.config.yaml') // {} or not for coverage
    expect(coalesced.config).toEqual({ extensions: { 'dx/excshell/1': { actions: 'src/dx-excshell-1/actions', operations: { view: [{ impl: 'index.html', type: 'web' }] }, runtimeManifest: { packages: { 'my-exc-package': { actions: { action: { annotations: { final: true, 'require-adobe-auth': true }, function: 'src/dx-excshell-1/actions/action.js', include: [['src/dx-excshell-1/actions/somefile.txt', 'file.txt']], inputs: { LOG_LEVEL: 'debug' }, limits: { concurrency: 189 }, runtime: 'nodejs:14', web: 'yes' } }, license: 'Apache-2.0' } } }, web: 'src/dx-excshell-1/web-src' } } })
    // pick some
    expect(coalesced.includeIndex.extensions).toEqual({ file: 'app.config.yaml', key: 'extensions' })
    expect(coalesced.includeIndex['extensions.dx/excshell/1']).toEqual({ file: 'app.config2.yaml', key: 'dx/excshell/1' })
    expect(coalesced.includeIndex['extensions.dx/excshell/1.runtimeManifest']).toEqual({ file: 'src/dx-excshell-1/ext.config.yaml', key: 'runtimeManifest' })
    expect(coalesced.includeIndex['extensions.dx/excshell/1.runtimeManifest.packages.my-exc-package.actions']).toEqual({ file: 'src/dx-excshell-1/actions/pkg.manifest.yaml', key: 'packages.my-exc-package.actions' })
    expect(coalesced.includeIndex['extensions.dx/excshell/1.runtimeManifest.packages.my-exc-package.actions.action']).toEqual({ file: 'src/dx-excshell-1/actions/sub/action.manifest.yaml', key: 'action' })
  })

  test('complex include config, absolute paths', async () => {
    global.loadFixtureApp('exc-complex-includes')
    coalesced = appConfig.coalesceAppConfig('app.config.yaml', { absolutePaths: true }) // {} or not for coverage
    expect(coalesced.config).toEqual({ extensions: { 'dx/excshell/1': { actions: '/src/dx-excshell-1/actions', operations: { view: [{ impl: 'index.html', type: 'web' }] }, runtimeManifest: { packages: { 'my-exc-package': { actions: { action: { annotations: { final: true, 'require-adobe-auth': true }, function: '/src/dx-excshell-1/actions/action.js', include: [['/src/dx-excshell-1/actions/somefile.txt', 'file.txt']], inputs: { LOG_LEVEL: 'debug' }, limits: { concurrency: 189 }, runtime: 'nodejs:14', web: 'yes' } }, license: 'Apache-2.0' } } }, web: '/src/dx-excshell-1/web-src' } } })
    // pick some
    expect(coalesced.includeIndex.extensions).toEqual({ file: 'app.config.yaml', key: 'extensions' })
    expect(coalesced.includeIndex['extensions.dx/excshell/1']).toEqual({ file: 'app.config2.yaml', key: 'dx/excshell/1' })
    expect(coalesced.includeIndex['extensions.dx/excshell/1.runtimeManifest']).toEqual({ file: 'src/dx-excshell-1/ext.config.yaml', key: 'runtimeManifest' })
    expect(coalesced.includeIndex['extensions.dx/excshell/1.runtimeManifest.packages.my-exc-package.actions']).toEqual({ file: 'src/dx-excshell-1/actions/pkg.manifest.yaml', key: 'packages.my-exc-package.actions' })
    expect(coalesced.includeIndex['extensions.dx/excshell/1.runtimeManifest.packages.my-exc-package.actions.action']).toEqual({ file: 'src/dx-excshell-1/actions/sub/action.manifest.yaml', key: 'action' })
  })
})
