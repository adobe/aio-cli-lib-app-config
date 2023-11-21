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

const winCompat = p => {
  return p.startsWith('/') ? path.resolve(p) : path.normalize(p) // path.resolve to get C or D
}

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
    config = await appConfig.load() // {} or not for coverage
    const mockConfig = getMockConfig('app', global.fakeConfig.tvm, {
      'all.application.project': expect.any(Object)
    })
    expect(config).toEqual(mockConfig)
  })

  test('not in an app', async () => {
    global.loadFixtureApp('not-in-app')
    await expect(appConfig.load()).rejects.toThrow(new Error('ENOENT: no such file or directory, open \'package.json\''))
  })

  test('exc extension config', async () => {
    global.loadFixtureApp('exc')
    config = await appConfig.load({})
    expect(config).toEqual(getMockConfig('exc', global.fakeConfig.tvm, {
      'all.dx/excshell/1': expect.any(Object)
    }))
  })

  test('exc with events config', async () => {
    global.loadFixtureApp('exc-with-events')
    config = await appConfig.load({})
    expect(config.all['dx/excshell/1']).toEqual(expect.objectContaining({ events: { registrations: { 'Demo name': { description: 'Demo description', events_of_interest: [{ event_codes: ['com.adobe.platform.gdpr.joberror', 'com.adobe.platform.gdpr.producterror'], provider_metadata: 'gdpr_events' }, { event_codes: ['test-code-skrishna', 'card_abandonment'], provider_metadata: 'aem' }], runtime_action: 'my-exc-package/action' }, 'Event Registration Default': { description: 'Registration for IO Events', events_of_interest: [{ event_codes: ['com.adobe.platform.gdpr.joberror', 'com.adobe.platform.gdpr.producterror'], provider_metadata: 'gdpr_events' }], runtime_action: 'my-exc-package/action' } } } }))
  })

  test('standalone app, exc and nui extension config', async () => {
    global.loadFixtureApp('app-exc-nui')
    config = await appConfig.load({})
    expect(config).toEqual(getMockConfig('app-exc-nui', global.fakeConfig.tvm, {
      'all.application.project': expect.any(Object),
      'all.dx/excshell/1.project': expect.any(Object),
      'all.dx/asset-compute/worker/1.project': expect.any(Object)
    }))
  })

  test('standalone app with no actions', async () => {
    global.loadFixtureApp('app-no-actions')
    config = await appConfig.load({})
    expect(config).toEqual(getMockConfig('app-no-actions', global.fakeConfig.tvm, {
      'all.application.project': expect.any(Object),
      'all.application.events': expect.undefined
    }))
  })

  test('exc with complex include pattern', async () => {
    global.loadFixtureApp('exc-complex-includes')
    config = await appConfig.load({})
    expect(config).toEqual(getMockConfig('exc-complex-includes', global.fakeConfig.tvm, {
      'all.dx/excshell/1.project': expect.any(Object)
    }))
  })

  test('standalone application with legacy configuration system', async () => {
    global.loadFixtureApp('legacy-app')
    const fullAioConfig = { app: global.aioLegacyAppConfig, ...global.fakeConfig.tvm }
    // mock app config
    mockAIOConfig.get.mockImplementation(k => fullAioConfig)
    config = await appConfig.load({})
    expect(config).toEqual(getMockConfig('legacy-app', fullAioConfig, {
      'all.application.project': expect.any(Object)
    }))
  })

  // corner cases - coverage
  test('exc with default package.json name & version', async () => {
    global.loadFixtureApp('exc')
    global.fakeFileSystem.addJson({ '/package.json': '{}' })
    config = await appConfig.load({})
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

    config = await appConfig.load({})
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

    config = await appConfig.load({})
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

    config = await appConfig.load({})
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

    config = await appConfig.load({})
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

    config = await appConfig.load({})
    expect(config).toEqual(getMockConfig('exc', global.fakeConfig.tvm, {
      'all.dx/excshell/1.manifest.full.packages.my-exc-package.actions.newAction': { web: 'yes' },
      'all.dx/excshell/1.project': expect.any(Object),
      includeIndex: expect.any(Object)
    }))
  })

  test('exc env = stage', async () => {
    libEnv.getCliEnv.mockReturnValue('stage')
    global.loadFixtureApp('exc')

    config = await appConfig.load({})
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
    await expect(appConfig.load({})).rejects.toThrow("must have required property 'operations'")
  })

  test('throw extension with 0 operations', async () => {
    global.fakeFileSystem.addJson({
      '/package.json': '{}',
      '/app.config.yaml':
`
extensions:
  dx/excshell/1:
    operations: {}
`
    })
    await expect(appConfig.load({})).rejects.toThrow('must NOT have fewer than 1 properties')
  })

  test('throw extension with 1 operations that has 0 items', async () => {
    global.fakeFileSystem.addJson({
      '/package.json': '{}',
      '/app.config.yaml':
`
extensions:
  dx/excshell/1:
    operations: {
      "some-op": []
    }
`
    })
    await expect(appConfig.load({})).rejects.toThrow('must NOT have fewer than 1 items')
  })

  test('extension missing runtimeManifest packages', async () => {
    // this test is to ensure that application fields are required aswell
    global.fakeFileSystem.addJson({
      '/package.json': '{}',
      '/app.config.yaml':
`
extensions:
  dx/excshell/1:
    operations: {
      "some-op": [{ "type": "sometype", "impl": "someimpl" }]
    }
    runtimeManifest: {}
`
    })
    await expect(appConfig.load({})).rejects.toThrow('must have required property \'packages\'')
  })

  test('app config with empty application implementation', async () => {
    global.loadFixtureApp('app')
    global.fakeFileSystem.addJson({
      '/package.json': '{}',
      'app.config.yaml':
`
    application: {}
`
    })
    config = await appConfig.load()
    expect(config.all.application).toBeDefined()
    expect(config.implements).toEqual(['application'])
  })

  // options
  test('standalone app config - ignoreAioConfig=true', async () => {
    global.loadFixtureApp('app')
    config = await appConfig.load({ ignoreAioConfig: true })
    const mockConfig = getMockConfig('app', {})
    expect(config).toEqual(mockConfig)
  })

  test('invalid app config with validateAppConfig=true', async () => {
    global.loadFixtureApp('app')
    global.fakeFileSystem.addJson({
      '/package.json': '{}',
      'app.config.yaml':
`
    application: {
      web: { notallowed: true }
    }
`
    })
    await expect(appConfig.load({ validateAppConfig: true })).rejects.toThrow('Missing or invalid keys in app.config.yaml')
  })

  test('invalid app config with validateAppConfig=false', async () => {
    global.loadFixtureApp('app')
    global.fakeFileSystem.addJson({
      '/package.json': '{}',
      'app.config.yaml':
`
    application: {
      web: { notallowed: true }
    }
`
    })
    config = await appConfig.load({ validateAppConfig: false })
    // the notallowed config is not picked up
    expect(config.all.application.web).toEqual({
      distDev: '/dist/application/web-dev',
      distProd: '/dist/application/web-prod',
      injectedConfig: '/web-src/src/config.json',
      src: '/web-src'
    })
  })

  test('no implementation - allowNoImpl=false', async () => {
    global.fakeFileSystem.addJson({ '/package.json': '{}' })
    await expect(appConfig.load({})).rejects.toThrow('Couldn\'t find configuration')
  })

  test('no implementation - allowNoImpl=true', async () => {
    global.fakeFileSystem.addJson({ '/package.json': '{}' })
    config = await appConfig.load({ allowNoImpl: true })
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
    config = await appConfig.load({})
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
    await expect(appConfig.load({})).rejects.toThrow('Detected \'$include\' cycle: \'app.config.yaml,b.yaml,dir/c.yaml,b.yaml\'')
  })

  test('include does not exist', async () => {
    global.fakeFileSystem.addJson(
      {
        '/package.json': '{}',
        '/app.config.yaml': '$include: b.yaml'
      }
    )
    await expect(appConfig.load({})).rejects.toThrow('\'$include: b.yaml\' cannot be resolved')
  })

  test('include does not resolve to object - string', async () => {
    global.fakeFileSystem.addJson(
      {
        '/package.json': '{}',
        '/app.config.yaml': '$include: b.yaml',
        '/b.yaml': 'string'
      }
    )
    await expect(appConfig.load({})).rejects.toThrow('\'$include: b.yaml\' does not resolve to an object')
  })

  test('include does not resolve to object - array', async () => {
    global.fakeFileSystem.addJson(
      {
        '/package.json': '{}',
        '/app.config.yaml': '$include: b.yaml',
        '/b.yaml': '[1,2,3]'
      }
    )
    await expect(appConfig.load({})).rejects.toThrow('\'$include: b.yaml\' does not resolve to an object')
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
    config = await appConfig.load({})
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
    config = await appConfig.load({})
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
    config = await appConfig.load({})
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
    config = await appConfig.load({})
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
    config = await appConfig.load({})
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
    config = await appConfig.load({})
    expect(config.all.application.web['response-headers']).toEqual({ '/*': { testHeader: 'foo' } })
  })

  test('valid configSchema with two fields', async () => {
    global.fakeFileSystem.addJson(
      {
        '/package.json': '{}',
        '/app.config.yaml': `
        application:
          runtimeManifest: { packages: {}}
        configSchema:
          properties:
            - envKey: HELLO
              type: string
              secret: true
              default: hello
              title: yo
              description: my description
              enum:
                - hello
                - hola
                - bonjour
            - envKey: BYE
              type: boolean
`
      }
    )
    await expect(appConfig.load({})).resolves.toEqual(expect.objectContaining({
      configSchema: {
        properties: [{
          default: 'hello',
          enum: ['hello', 'hola', 'bonjour'],
          envKey: 'HELLO',
          secret: true,
          title: 'yo',
          type: 'string',
          description: 'my description'
        }, {
          envKey: 'BYE',
          type: 'boolean'
        }]
      }
    }))
  })

  test('valid configSchema with two fields a description and a title', async () => {
    global.fakeFileSystem.addJson(
      {
        '/package.json': '{}',
        '/app.config.yaml': `
        application:
          runtimeManifest: { packages: {}}
        configSchema:
          title: 'config title'
          description: 'config description'
          properties:
            - envKey: HELLO
              type: string
              secret: true
              default: hello
              title: yo
              enum:
                - hello
                - hola
                - bonjour
            - envKey: BYE
              type: boolean
`
      }
    )
    await expect(appConfig.load({})).resolves.toEqual(expect.objectContaining({
      configSchema: {
        title: 'config title',
        description: 'config description',
        properties: [{
          default: 'hello',
          enum: ['hello', 'hola', 'bonjour'],
          envKey: 'HELLO',
          secret: true,
          title: 'yo',
          type: 'string'
        }, {
          envKey:
          'BYE',
          type: 'boolean'
        }]
      }
    }))
  })

  test('default boolean = true', async () => {
    global.fakeFileSystem.addJson(
      {
        '/package.json': '{}',
        '/app.config.yaml': `
        application:
          runtimeManifest: { packages: {}}
        configSchema:
          properties:
            - envKey: BYE
              type: boolean
              default: true
`
      }
    )
    await expect(appConfig.load({})).resolves.toEqual(expect.objectContaining({
      configSchema: {
        properties: [{
          envKey: 'BYE',
          type: 'boolean',
          default: true
        }]
      }
    }))
  })

  test('valid no configSchema', async () => {
    global.fakeFileSystem.addJson(
      {
        '/package.json': '{}',
        '/app.config.yaml': `
        application:
          runtimeManifest: { packages: {}}
`
      }
    )
    await expect(appConfig.load({})).resolves.toEqual(expect.objectContaining({ configSchema: {} }))
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
    await expect(appConfig.load({})).rejects.toThrow('must NOT have additional properties')
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
    await expect(appConfig.load({})).rejects.toThrow('"missingProperty": "packages"')
  })

  test('invalid schema: configSchema has an item without envKey', async () => {
    global.fakeFileSystem.addJson(
      {
        '/package.json': '{}',
        '/app.config.yaml': `
        configSchema: { properties: [ { type: string } ] }
        application:
          runtimeManifest: { packages: {}}
`
      }
    )
    await expect(appConfig.load({})).rejects.toThrow("\"must have required property 'envKey'\"")
  })

  test('invalid schema: configSchema has an item without type', async () => {
    global.fakeFileSystem.addJson(
      {
        '/package.json': '{}',
        '/app.config.yaml': `
        configSchema: { properties: [ { envKey: HELLO} ] }
        application:
          runtimeManifest: { packages: {}}
`
      }
    )
    await expect(appConfig.load({})).rejects.toThrow("\"must have required property 'type'\"")
  })

  test('invalid schema: configSchema with an additional property', async () => {
    global.fakeFileSystem.addJson(
      {
        '/package.json': '{}',
        '/app.config.yaml': `
        configSchema: { properties: [ { envKey: HELLO, type: string, somenotallowed: prop} ] }
        application:
          runtimeManifest: { packages: {}}
`
      }
    )
    await expect(appConfig.load({})).rejects.toThrow('must NOT have additional properties')
  })

  test('invalid schema: configSchema with an invalid type', async () => {
    global.fakeFileSystem.addJson(
      {
        '/package.json': '{}',
        '/app.config.yaml': `
        configSchema: { properties: [ { envKey: HELLO, type: invalid} ] }
        application:
          runtimeManifest: { packages: {}}
`
      }
    )
    await expect(appConfig.load({})).rejects.toThrow('must be equal to one of the allowed values')
  })

  test('invalid schema: configSchema with an invalid option', async () => {
    global.fakeFileSystem.addJson(
      {
        '/package.json': '{}',
        '/app.config.yaml': `
        configSchema: { invalid: 'key', properties: [ { envKey: HELLO } ] }
        application:
          runtimeManifest: { packages: {}}
`
      }
    )
    await expect(appConfig.load({})).rejects.toThrow('Missing or invalid keys in app.config.yaml')
  })

  test('invalid schema: configSchema without properties', async () => {
    global.fakeFileSystem.addJson(
      {
        '/package.json': '{}',
        '/app.config.yaml': `
        configSchema: { title: 'config title' }
        application:
          runtimeManifest: { packages: {}}
`
      }
    )
    await expect(appConfig.load({})).rejects.toThrow('Missing or invalid keys in app.config.yaml')
  })

  test('valid schema with productDependencies', async () => {
    global.fakeFileSystem.addJson(
      {
        '/package.json': '{}',
        '/app.config.yaml': `
        productDependencies:
          - code: 'somecode'
            minVersion: '1.0.0'
            maxVersion: '2.0.0'
          - code: 'someOthercode'
            minVersion: '1.0.0'
            maxVersion: '3.0.0'
        application:
          runtimeManifest: { packages: {}}
`
      }
    )
    await expect(appConfig.load({})).resolves.toEqual(expect.objectContaining({ productDependencies: [{ code: 'somecode', maxVersion: '2.0.0', minVersion: '1.0.0' }, { code: 'someOthercode', maxVersion: '3.0.0', minVersion: '1.0.0' }] }))
  })

  test('valid no productDependencies', async () => {
    global.fakeFileSystem.addJson(
      {
        '/package.json': '{}',
        '/app.config.yaml': `
        application:
          runtimeManifest: { packages: {}}
`
      }
    )
    await expect(appConfig.load({})).resolves.toEqual(expect.objectContaining({ productDependencies: [] }))
  })

  test('valid productDependencies: no items', async () => {
    global.fakeFileSystem.addJson(
      {
        '/package.json': '{}',
        '/app.config.yaml': `
        productDependencies: []
        application:
          runtimeManifest: { packages: {}}
`
      }
    )
    await expect(appConfig.load({})).resolves.toEqual(expect.objectContaining({ productDependencies: [] }))
  })

  test('invalid productDependencies: missing minVersion', async () => {
    global.fakeFileSystem.addJson(
      {
        '/package.json': '{}',
        '/app.config.yaml': `
        productDependencies:
          - code: 'somecode'
            minVersion: '1.0.0'
            maxVersion: '2.0.0'
          - code: 'someOthercode'
            maxVersion: '3.0.0'
        application:
          runtimeManifest: { packages: {}}
`
      }
    )
    await expect(appConfig.load({})).rejects.toThrow("must have required property 'minVersion'")
  })

  test('invalid productDependencies: missing maxVersion', async () => {
    global.fakeFileSystem.addJson(
      {
        '/package.json': '{}',
        '/app.config.yaml': `
        productDependencies:
          - code: 'somecode'
            minVersion: '1.0.0'
            maxVersion: '2.0.0'
          - code: 'someOthercode'
            minVersion: '3.0.0'
        application:
          runtimeManifest: { packages: {}}
`
      }
    )
    await expect(appConfig.load({})).rejects.toThrow("must have required property 'maxVersion'")
  })

  test('invalid productDependencies: missing code', async () => {
    global.fakeFileSystem.addJson(
      {
        '/package.json': '{}',
        '/app.config.yaml': `
        productDependencies:
          - 
            minVersion: '1.0.0'
            maxVersion: '2.0.0'
        application:
          runtimeManifest: { packages: {}}
`
      }
    )
    await expect(appConfig.load({})).rejects.toThrow("must have required property 'code'")
  })

  test('invalid productDependencies: invalid extra field', async () => {
    global.fakeFileSystem.addJson(
      {
        '/package.json': '{}',
        '/app.config.yaml': `
        productDependencies:
          - code: somecode
            minVersion: '1.0.0'
            maxVersion: '2.0.0'
            midVersion: 'field'
        application:
          runtimeManifest: { packages: {}}
`
      }
    )
    await expect(appConfig.load({})).rejects.toThrow('must NOT have additional properties')
  })
})

describe('validate config', () => {
  // most validation tests are run as part of load this is just to test the validate config interface
  test('config pass', async () => {
    await expect(appConfig.validate({ application: {} })).resolves.toEqual({ errors: null, valid: true })
  })
  test('config pass, throws= true', async () => {
    await expect(appConfig.validate({ application: {} }, { throws: true })).resolves.toEqual({ errors: null, valid: true })
  })
  test('config not pass', async () => {
    await expect(appConfig.validate({ applications: {} })).resolves.toEqual({ errors: expect.any(Array), valid: false })
  })
  test('config not pass, throws=true', async () => {
    await expect(appConfig.validate({ applications: {} }, { throws: true })).rejects.toThrow('Missing')
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
    coalesced = await appConfig.coalesce('app.config.yaml') // {} or not for coverage
    // NOTE how relative paths are always unix style
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
    coalesced = await appConfig.coalesce('app.config.yaml', { absolutePaths: true }) // {} or not for coverage
    expect(coalesced.config).toEqual({ extensions: { 'dx/excshell/1': { actions: winCompat('/src/dx-excshell-1/actions'), operations: { view: [{ impl: 'index.html', type: 'web' }] }, runtimeManifest: { packages: { 'my-exc-package': { actions: { action: { annotations: { final: true, 'require-adobe-auth': true }, function: winCompat('/src/dx-excshell-1/actions/action.js'), include: [[winCompat('/src/dx-excshell-1/actions/somefile.txt'), 'file.txt']], inputs: { LOG_LEVEL: 'debug' }, limits: { concurrency: 189 }, runtime: 'nodejs:14', web: 'yes' } }, license: 'Apache-2.0' } } }, web: winCompat('/src/dx-excshell-1/web-src') } } })
    // index stay relative to cwd
    expect(coalesced.includeIndex.extensions).toEqual({ file: 'app.config.yaml', key: 'extensions' })
    expect(coalesced.includeIndex['extensions.dx/excshell/1']).toEqual({ file: 'app.config2.yaml', key: 'dx/excshell/1' })
    expect(coalesced.includeIndex['extensions.dx/excshell/1.runtimeManifest']).toEqual({ file: 'src/dx-excshell-1/ext.config.yaml', key: 'runtimeManifest' })
    expect(coalesced.includeIndex['extensions.dx/excshell/1.runtimeManifest.packages.my-exc-package.actions']).toEqual({ file: 'src/dx-excshell-1/actions/pkg.manifest.yaml', key: 'packages.my-exc-package.actions' })
    expect(coalesced.includeIndex['extensions.dx/excshell/1.runtimeManifest.packages.my-exc-package.actions.action']).toEqual({ file: 'src/dx-excshell-1/actions/sub/action.manifest.yaml', key: 'action' })
  })

  test('app.config.yaml not in root folder, relative paths', async () => {
    // this test is to ensure that files are relative to the app.config.yaml file and not the current working directory
    global.loadFixtureApp('app-not-in-root')
    coalesced = await appConfig.coalesce('app/app.config.yaml') // {} or not for coverage
    // here we want to make sure to not have something like actions: app/myactions or function: app/myactions/action.js
    expect(coalesced.config).toEqual({ application: { actions: 'myactions', runtimeManifest: { packages: { 'my-app-package': { actions: { action: { annotations: { final: true, 'require-adobe-auth': true }, function: 'myactions/action.js', include: [['myactions/somefile.txt', 'file.txt']], inputs: { LOG_LEVEL: 'debug' }, runtime: 'nodejs:14', web: 'yes' } } } } } } })
    // index is still relative to cwd though!
    expect(coalesced.includeIndex.application).toEqual({ file: 'app/app.config.yaml', key: 'application' })
    expect(coalesced.includeIndex['application.runtimeManifest.packages.my-app-package.actions.action']).toEqual({ file: 'app/app.config.yaml', key: 'application.runtimeManifest.packages.my-app-package.actions.action' })
    expect(coalesced.includeIndex['application.runtimeManifest.packages.my-app-package.actions.action.function']).toEqual({ file: 'app/myactions/action.config.yaml', key: 'function' })
  })

  test('app.config.yaml not in root folder, absolute paths', async () => {
    global.loadFixtureApp('app-not-in-root')
    coalesced = await appConfig.coalesce('app/app.config.yaml', { absolutePaths: true }) // {} or not for coverage
    expect(coalesced.config).toEqual({ application: { actions: winCompat('/app/myactions'), runtimeManifest: { packages: { 'my-app-package': { actions: { action: { annotations: { final: true, 'require-adobe-auth': true }, function: winCompat('/app/myactions/action.js'), include: [[winCompat('/app/myactions/somefile.txt'), 'file.txt']], inputs: { LOG_LEVEL: 'debug' }, runtime: 'nodejs:14', web: 'yes' } } } } } } })
    // index is still relative to cwd though!
    expect(coalesced.includeIndex.application).toEqual({ file: 'app/app.config.yaml', key: 'application' })
    expect(coalesced.includeIndex['application.runtimeManifest.packages.my-app-package.actions.action']).toEqual({ file: 'app/app.config.yaml', key: 'application.runtimeManifest.packages.my-app-package.actions.action' })
    expect(coalesced.includeIndex['application.runtimeManifest.packages.my-app-package.actions.action.function']).toEqual({ file: 'app/myactions/action.config.yaml', key: 'function' })
  })
})
