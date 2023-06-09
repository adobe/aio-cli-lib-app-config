/*
Copyright 2021 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

const path = require('path')
const yaml = require('js-yaml')
const fs = require('fs-extra')
const aioConfigLoader = require('@adobe/aio-lib-core-config')
const aioLogger = require('@adobe/aio-lib-core-logging')('@adobe/aio-cli-lib-app-config', { provider: 'debug' })
const Ajv = require('ajv')
const ajvAddFormats = require('ajv-formats')

// eslint-disable-next-line node/no-unpublished-require
const schema = require('../schema/app.config.yaml.schema.json')

// give or take daylight savings, and leap seconds ...
const AboutAWeekInSeconds = '604800'
const defaults = {
  defaultAppHostname: 'adobeio-static.net',
  defaultTvmUrl: 'https://firefly-tvm.adobe.io',
  defaultOwApihost: 'https://adobeioruntime.net',
  defaultHTMLCacheDuration: '60',
  defaultJSCacheDuration: AboutAWeekInSeconds,
  defaultCSSCacheDuration: AboutAWeekInSeconds,
  defaultImageCacheDuration: AboutAWeekInSeconds,
  stageAppHostname: 'dev.runtime.adobe.io',
  USER_CONFIG_FILE: 'app.config.yaml',
  LEGACY_RUNTIME_MANIFEST: 'manifest.yml',
  INCLUDE_DIRECTIVE: '$include',
  APPLICATION_CONFIG_KEY: 'application',
  EXTENSIONS_CONFIG_KEY: 'extensions'
}

const HookKeys = [
  'pre-app-build',
  'post-app-build',
  'build-actions',
  'build-static',
  'pre-app-deploy',
  'post-app-deploy',
  'deploy-actions',
  'deploy-static',
  'pre-app-undeploy',
  'post-app-undeploy',
  'undeploy-actions',
  'undeploy-static',
  'pre-app-run',
  'post-app-run',
  'serve-static'
]

// please add any key that points to a path here
// if they are defined in an included file, those need to be rewritten to be relative to the root folder
const PATH_KEYS = [
  /^(application|extensions\.[^.]+)\.web$/,
  /^(application|extensions\.[^.]+)\.web\.src$/,
  /^(application|extensions\.[^.]+)\.actions$/,
  /^(application|extensions\.[^.]+)\.unitTest$/,
  /^(application|extensions\.[^.]+)\.e2eTest$/,
  /^(application|extensions\.[^.]+)\.dist$/,
  /^(application|extensions\.[^.]+)\.runtimeManifest\.packages\.[^.]+\.actions\.[^.]+\.function$/,
  /^(application|extensions\.[^.]+)\.runtimeManifest\.packages\.[^.]+\.actions\.[^.]+\.include\.\d+\.0$/
]

const {
  getCliEnv, /* function */
  STAGE_ENV /* string */
} = require('@adobe/aio-lib-env')
const cloneDeep = require('lodash.clonedeep')

/**
 * Loads app builder configuration in the current working directory.
 *
 * loading config returns following object (this config is internal, not user facing):
 *  {
 *    configSchema: { app.config.yaml configSchema field }
 *    aio: {...aioConfig...},
 *    packagejson: {...package.json...},
 *    all: {
 *      OPTIONAL:'application': {
 *        app: {
 *          name,
 *          version,
 *          hasFrontend,
 *          hasBackend,
 *          dist
 *        },
 *        ow: {
 *          apihost,
 *          apiversion,
 *          auth,
 *          namespace,
 *          package
 *        },
 *        s3: {
 *          creds || tvmUrl,
 *          credsCacheFile,
 *          folder,
 *        },
 *        web: {
 *          src,
 *          injectedConfig,
 *          distDev,
 *          distProd,
 *        },
 *        manifest: {
 *          full,
 *          package,
 *          packagePlaceholder,
 *          src,
 *        },
 *        actions: {
 *          src,
 *          dist,
 *          remote,
 *          urls
 *        },
 *        events: {}
 *      }
 *    },
 *    OPTIONAL:'dx/asset-compute/worker/1': {
 *       ...same as above...
 *    },
 *    OPTIONAL:'dx/excshell/1': {
 *       ...same as above...
 *    },
 *  }
 *
 * @param {object} options options to load Config
 * @param {boolean} options.allowNoImpl do not throw if there is no implementation
 * @param {boolean} options.ignoreAioConfig do not load .aio config via aio-lib-core-config, which is loaded synchronously and blocks the main thread.
 * @returns {object} the config
 */
async function load (options = {}) {
  const allowNoImpl = options.allowNoImpl === undefined ? false : options.allowNoImpl
  const ignoreAioConfig = options.ignoreAioConfig === undefined ? false : options.ignoreAioConfig
  // *NOTE* it would be nice to support an appFolder option to load config from a different folder.
  // However, this requires to update aio-lib-core-config to support loading
  // from a different folder aswell (or enforcing ignore).

  // I. load common config
  // configuration that is shared for application and each extension config
  // holds things like ow credentials, packagejson and aioConfig
  const commonConfig = await loadCommonConfig({ ignoreAioConfig })
  // checkCommonConfig(commonConfig)

  // II. load app.config.yaml & validate + load/merge legacy configuration if any
  // support backward compatibility, include legacy application configuration
  const legacyAppConfigWithIndex = await legacyToAppConfig(commonConfig)
  let { config: appConfig, includeIndex } = legacyAppConfigWithIndex
  // no validation on the legacy configuration, which will be deprecated eventually

  if (await fs.exists(defaults.USER_CONFIG_FILE)) {
    // this will resolve $include directives and output the app config into a single object
    // paths config values in $included files will be rewritten
    const appConfigWithIndex = await coalesce(defaults.USER_CONFIG_FILE, { absolutePaths: true })
    await validate(appConfigWithIndex.config, { throws: true })
    const mergedAppConfig = await mergeLegacyAppConfig(appConfigWithIndex, legacyAppConfigWithIndex)

    appConfig = mergedAppConfig.config
    includeIndex = mergedAppConfig.includeIndex
  }

  // III. build output object
  // full standalone application and extension configurations
  const all = await buildAllConfigs(appConfig, commonConfig, includeIndex)
  const impl = Object.keys(all).sort() // sort for predictable configuration
  if (!allowNoImpl && impl.length <= 0) {
    throw new Error(`Couldn't find configuration in '${process.cwd()}', make sure to add at least one extension or a standalone app`)
  }
  return {
    configSchema: appConfig?.configSchema,
    all,
    implements: impl, // e.g. 'dx/excshell/1', 'application'
    // includeIndex keeps a map from config keys to files that includes them and the relative key in the file.
    // e.g. 'extension.dx/excshell/1.runtimeManifest.packages' => { path: 'src/dx-excshell-1/ext.config.yaml', key: 'runtimeManifest.packages' }
    includeIndex,
    aio: commonConfig.aio,
    packagejson: commonConfig.packagejson,
    root: process.cwd()
  }
}

/**
 * Validates the app configuration.
 * To validate an app.config.yaml file, use `await validate(await coalesce('app.config.yaml'))`
 *
 * @param {object} coalescedAppConfigObj the resolved app config object.
 * @param {object} options options
 * @param {boolean} options.throws defaults to false, if true throws on validation error instead of returning the error
 * @throws if not valid
 */
async function validate (coalescedAppConfigObj, options = {}) {
  const throws = options.throws === undefined ? false : options.throws
  /* eslint-disable-next-line node/no-unpublished-require */
  const ajv = new Ajv({
    allErrors: true,
    allowUnionTypes: true
  })
  ajvAddFormats(ajv)
  const validate = ajv.compile(schema)

  const valid = validate(coalescedAppConfigObj)
  const errors = validate.errors
  if (!valid && throws) {
    throw new Error(`Missing or invalid keys in ${defaults.USER_CONFIG_FILE}: ${JSON.stringify(errors, null, 2)}`)
  }
  return { valid, errors }
}

/** @private */
async function loadCommonConfig (/* istanbul ignore next */options = {}) {
  let aioConfig = {}
  if (!options.ignoreAioConfig) {
    // load aio config (mostly runtime and console config)
    aioConfigLoader.reload()
    aioConfig = aioConfigLoader.get() || {}
  }

  const packagejson = await fs.readJson('package.json', { throws: true })

  // defaults
  // remove scoped name to use this for open whisk entities
  let unqualifiedName = 'unnamed-app'
  if (packagejson.name) {
    unqualifiedName = packagejson.name.split('/').pop()
  }
  packagejson.name = unqualifiedName
  packagejson.version = packagejson.version || '0.1.0'

  const owConfig = aioConfig.runtime || {}
  owConfig.defaultApihost = defaults.defaultOwApihost
  owConfig.apihost = owConfig.apihost || defaults.defaultOwApihost // set by user
  owConfig.apiversion = owConfig.apiversion || 'v1'
  // default package name for replacing the legacy __APP_PACKAGE__ placeholder
  owConfig.package = `${packagejson.name}-${packagejson.version}`

  return {
    packagejson,
    ow: owConfig,
    aio: aioConfig,
    // soon not needed anymore (for old headless validator)
    imsOrgId: aioConfig.project?.org?.ims_org_id
  }
}

/** @private */
// function checkCommonConfig (commonConfig) {
//   // todo this depends on the commands, expose a throwOnMissingConsoleInfo ?
//   // if (!commonConfig.aio.project || !commonConfig.ow.auth) {
//   //   throw new Error('Missing project configuration, import a valid Console configuration first via \'aio app use\'')
//   // }
// }

/**
 * Resolve all includes, update relative paths and return a coalesced app configuration object.
 *
 * @param {string} appConfigFile path to the app.config.yaml
 * @param {object} options options
 * @param {object} options.absolutePaths boolean, true for absolute paths, default for relative to appConfigFile directory.
 * @returns {object} single appConfig with resolved includes
 */
async function coalesce (appConfigFile, options = { absolutePaths: false }) {
  // this code is traversing app.config.yaml recursively to resolve all $includes directives

  const absolutePaths = options.absolutePaths === undefined ? false : options.absolutePaths
  const config = yaml.safeLoad(await fs.readFile(appConfigFile, 'utf8'))
  // keep an index that will map keys like 'extensions.abc.runtimeManifest' to the config file where there are defined
  const includeIndex = {}
  // keep a cache for common included files - avoid to read a same file twice
  const configCache = {}

  // stack entries to be iterated on
  /** @private */
  function buildStackEntries (obj, fullKeyParent, relativeFullKeyParent, includedFiles, filterKeys = null) {
    return Object.keys(obj || {})
      // include filtered keys only
      .filter(key => !filterKeys || filterKeys.includes(key))
      // `parentObj` stores the parent config object
      // `includedFiles` tracks already included files, is used for cycle detection and building the index key,
      // `fullKey` store parents and used for building the index,
      // `relativeFullKey` stores the key relative to the included file (e.g. actions are included  actions.
      .map(key => ({ parentObj: obj, includedFiles, key, fullKey: fullKeyParent.concat(`.${key}`), relativeFullKey: relativeFullKeyParent.concat(`.${key}`) }))
  }

  // initialize with top level config object, each key will be traversed and checked for $include directive
  const traverseStack = buildStackEntries(config, '', '', [appConfigFile])

  // ITERATIONS
  // iterate until there are no entries
  while (traverseStack.length > 0) {
    const { parentObj, key, includedFiles, fullKey, relativeFullKey } = traverseStack.pop()

    const currConfigFile = includedFiles[includedFiles.length - 1]

    // add full key to the index, slice(1) to remove initial dot
    const fullIndexKey = fullKey.slice(1)
    includeIndex[fullIndexKey] = {
      file: currConfigFile,
      key: relativeFullKey.slice(1)
    }

    const value = parentObj[key]

    if (typeof value === 'object') {
      // if value is an object or an array, add new entries to be traversed
      traverseStack.push(...buildStackEntries(value, fullKey, relativeFullKey, includedFiles))
      continue
    }

    if (key === defaults.INCLUDE_DIRECTIVE) {
      // $include: 'configFile', value is string pointing to config file
      // includes are relative to the current config file

      // config path in index always as unix path, it doesn't matter but makes it easier to generate testing mock data
      const incFile = path.join(path.dirname(currConfigFile), value)
      const configFile = incFile.split(path.sep).join(path.posix.sep)

      // 1. check for include cycles
      if (includedFiles.includes(configFile)) {
        throw new Error(`Detected '${defaults.INCLUDE_DIRECTIVE}' cycle: '${[...includedFiles, configFile].toString()}', please make sure that your configuration has no cycles.`)
      }
      // 2. check if file exists
      if (!configCache[configFile] && !(await fs.exists(configFile))) {
        throw new Error(`'${defaults.INCLUDE_DIRECTIVE}: ${configFile}' cannot be resolved, please make sure the file exists.`)
      }
      // 3. delete the $include directive to be replaced
      delete parentObj[key]
      // 4. load the included file
      // Note the included file can in turn also have includes, so we will have to traverse it as well
      const loadedConfig = configCache[configFile] || yaml.safeLoad(await fs.readFile(configFile, 'utf8'))
      if (Array.isArray(loadedConfig) || typeof loadedConfig !== 'object') {
        throw new Error(`'${defaults.INCLUDE_DIRECTIVE}: ${configFile}' does not resolve to an object. Including an array or primitive type config is not supported.`)
      }
      // 5. merge and set the configuration, fields defined in parentObj take precedence
      const resolvedObject = { ...loadedConfig, ...parentObj }
      Object.entries(resolvedObject).forEach(([k, v]) => { parentObj[k] = v })
      // 6. set the cache to avoid reading the file twice
      configCache[configFile] = loadedConfig
      // 7. add included to cycle detection, note the alreadyIncluded array should not be modified
      const newAlreadyIncluded = includedFiles.concat(configFile)
      // 8. set new loop entries, only include new once, remove .$include from index key, reset relative key
      traverseStack.push(...buildStackEntries(parentObj, fullKey.split(`.${defaults.INCLUDE_DIRECTIVE}`).join(''), '', newAlreadyIncluded, Object.keys(loadedConfig)))
    }

    // else primitive types: do nothing
  }

  const appConfigWithIncludeIndex = { config, includeIndex }
  rewritePathsInPlace(appConfigWithIncludeIndex, { absolutePaths })

  return appConfigWithIncludeIndex
}

/** @private */
async function legacyToAppConfig (commonConfig) {
  // load legacy user app config from manifest.yml, package.json, .aio.app
  const includeIndex = {}
  const legacyAppConfig = {}

  // 1. load .aio.app config
  // todo: new value usingLegacyConfig
  // this module should not console.log/warn ... or include chalk ...
  if (commonConfig.aio.cna !== undefined || commonConfig.aio.app !== undefined) {
    // this might have never have been seen in the wild as we don't know
    // what log-level users have set
    aioLogger.error('App config in \'.aio\' file is deprecated. Please move your \'.aio.app\' or \'.aio.cna\' to \'app.config.yaml\'.')
    const appConfig = { ...commonConfig.aio.app, ...commonConfig.aio.cna }
    Object.entries(appConfig).forEach(([k, v]) => {
      legacyAppConfig[k] = v
      includeIndex[`${defaults.APPLICATION_CONFIG_KEY}.${k}`] = { file: '.aio', key: `app.${k}` }
    })
  }

  // 2. load legacy manifest.yaml
  if (await fs.exists(defaults.LEGACY_RUNTIME_MANIFEST)) {
    const runtimeManifest = yaml.safeLoad(await fs.readFile(defaults.LEGACY_RUNTIME_MANIFEST, 'utf8'))
    legacyAppConfig.runtimeManifest = runtimeManifest
    // populate index
    const baseKey = `${defaults.APPLICATION_CONFIG_KEY}.runtimeManifest`
    includeIndex[baseKey] = { file: 'manifest.yml', key: '' }
    const stack = Object.keys(runtimeManifest).map(rtk => ({ key: rtk, parent: runtimeManifest, fullKey: '' }))
    while (stack.length > 0) {
      const { key, parent, fullKey } = stack.pop()
      const newFullKey = fullKey.concat(`.${key}`)
      includeIndex[baseKey + newFullKey] = { file: 'manifest.yml', key: newFullKey.slice(1) } // remove first dot
      if (typeof parent[key] === 'object' && parent[key] !== null) {
        // includes arrays
        stack.push(...Object.keys(parent[key]).map(rtk => ({ key: rtk, parent: parent[key], fullKey: newFullKey })))
      }
    }
  }

  // 3. load legacy hooks
  const pkgjsonscripts = commonConfig.packagejson.scripts
  if (pkgjsonscripts) {
    const hooks = {}
    // https://www.adobe.io/apis/experienceplatform/project-firefly/docs.html#!AdobeDocs/project-firefly/master/guides/app-hooks.md

    HookKeys.forEach(hookKey => {
      if (pkgjsonscripts[hookKey]) {
        hooks[hookKey] = pkgjsonscripts[hookKey]
        includeIndex[`${defaults.APPLICATION_CONFIG_KEY}.hooks.${hookKey}`] = { file: 'package.json', key: `scripts.${hookKey}` }
      }
    })

    // todo: new val usingLegacyHooks:Boolean
    if (Object.keys(hooks).length > 0) {
      aioLogger.error('hooks in \'package.json\' are deprecated. Please move your hooks to \'app.config.yaml\' under the \'hooks\' key')
      legacyAppConfig.hooks = hooks
      // build index
      includeIndex[`${defaults.APPLICATION_CONFIG_KEY}.hooks`] = { file: 'package.json', key: 'scripts' }
      Object.keys(hooks).forEach((hk) => {
        const fullKey = `${defaults.APPLICATION_CONFIG_KEY}.hooks.${hk}`
        includeIndex[fullKey] = {
          file: 'package.json',
          key: `scripts.${hk}`
        }
      })
    }
  }

  const appConfigWithIncludeIndex = { includeIndex, config: { [defaults.APPLICATION_CONFIG_KEY]: legacyAppConfig } }
  if (Object.keys(includeIndex).length <= 0) {
    // no legacy configuration return now
    // todo return undefined here and for normal config, rewrite load and merge logic
    return appConfigWithIncludeIndex
  }

  // add the top key
  includeIndex[`${defaults.APPLICATION_CONFIG_KEY}`] = { file: '.aio', key: 'app' }

  /* always absolute paths for now. Note that if we were interested in relative
  paths there would be no need to rewrite, as all paths are
  defined in the app root folder for legacy apps */
  rewritePathsInPlace(appConfigWithIncludeIndex, { absolutePaths: true })

  return appConfigWithIncludeIndex
}

/** @private */
function rewritePathsInPlace (appConfigWithIncludeIndex, options) {
  const { config: appConfig, includeIndex } = appConfigWithIncludeIndex

  const buildStackEntries = (currObj, currFullKey) => Object.keys(currObj || {} /* cover for null */).map(k => {
    const fullKey = currFullKey ? currFullKey + '.' + k : k
    const includedFromConfigFile = includeIndex[fullKey].file
    return { fullKey, includedFromConfigFile, key: k, parentObj: currObj }
  })
  const stack = buildStackEntries(appConfig)

  while (stack.length > 0) {
    const { fullKey, includedFromConfigFile, key, parentObj } = stack.pop()
    const value = parentObj[key]

    if (typeof value === 'string' && PATH_KEYS.filter(reg => fullKey.match(reg)).length) {
      // rewrite path value to be relative to the root instead of being relative to the config file that includes it
      parentObj[key] = resolveToRoot(value, includedFromConfigFile, { absolutePaths: options.absolutePaths })
    }
    if (typeof value === 'object') {
      // object or Array
      stack.push(...buildStackEntries(value, fullKey))
    }
  }
}

/** @private */
async function mergeLegacyAppConfig (appConfigWithIncludeIndex, legacyAppConfigWithIncludeIndex) {
  // NOTE: here we do a simplified merge, deep merge with copy might be wanted

  // only need to merge application configs as legacy config system does not work with extensions
  const application = appConfigWithIncludeIndex.config[defaults.APPLICATION_CONFIG_KEY]
  const legacyApplication = legacyAppConfigWithIncludeIndex.config[defaults.APPLICATION_CONFIG_KEY]

  // merge 1 level config fields, such as 'actions': 'path/to/actions', precedence for new config
  const mergedApplication = { ...legacyApplication, ...application }

  // special cases if both are defined
  if (application && legacyApplication) {
    // for simplicity runtimeManifest is not merged, it's one or the other
    if (legacyApplication.runtimeManifest && application.runtimeManifest) {
      aioLogger.warn('\'manifest.yml\' is ignored in favor of key \'runtimeManifest\' in \'app.config.yaml\'.')
    }
    // hooks are merged
    if (legacyApplication.hooks && application.hooks) {
      mergedApplication.hooks = { ...legacyApplication.hooks, ...application.hooks }
    }
  }

  return {
    config: {
      ...appConfigWithIncludeIndex.config,
      [defaults.APPLICATION_CONFIG_KEY]: mergedApplication
    },
    // new configuration index takes precedence
    includeIndex: { ...legacyAppConfigWithIncludeIndex.includeIndex, ...appConfigWithIncludeIndex.includeIndex }
  }
}

/** @private */
async function buildAllConfigs (userConfig, commonConfig, includeIndex) {
  return {
    ...(await buildAppConfig(userConfig, commonConfig, includeIndex)),
    ...(await buildExtConfigs(userConfig, commonConfig, includeIndex))
  }
}

/** @private */
async function buildExtConfigs (userConfig, commonConfig, includeIndex) {
  const configs = {}
  if (userConfig[defaults.EXTENSIONS_CONFIG_KEY]) {
    const entries = Object.entries(userConfig[defaults.EXTENSIONS_CONFIG_KEY])
    for (const [extName, singleUserConfig] of entries) {
      configs[extName] = await buildSingleConfig(extName, singleUserConfig, commonConfig, includeIndex)
      // extensions have an extra operations field
      configs[extName].operations = singleUserConfig.operations
      // this is checked by the schema validation
      // if (!configs[extName].operations) {
      //   throw new Error(`Missing 'operations' config field for extension point ${extName}`)
      // }
    }
  }
  return configs
}

/** @private */
async function buildAppConfig (userConfig, commonConfig, includeIndex) {
  const fullAppConfig = await buildSingleConfig(defaults.APPLICATION_CONFIG_KEY,
    userConfig[defaults.APPLICATION_CONFIG_KEY],
    commonConfig,
    includeIndex)

  // todo: this needs to be updated; an app doesn't exist if there is no config.
  if (!fullAppConfig.app.hasBackend && !fullAppConfig.app.hasFrontend) {
    // only set application config if there is an actual app, meaning either some backend or frontend
    return {}
  }
  return { [defaults.APPLICATION_CONFIG_KEY]: fullAppConfig }
}

/** @private */
async function buildSingleConfig (configName, singleUserConfig, commonConfig, includeIndex) {
  // used as subfolder folder in dist, converts to a single dir, e.g. dx/excshell/1 =>
  // dx-excshell-1 and dist/dx-excshell-1/actions/action-xyz.zip
  const subFolderName = configName.replace(/\//g, '-')
  const fullKeyPrefix = configName === defaults.APPLICATION_CONFIG_KEY ? defaults.APPLICATION_CONFIG_KEY : `${defaults.EXTENSIONS_CONFIG_KEY}.${configName}`

  const config = {
    app: {},
    ow: {},
    s3: {},
    web: {},
    manifest: {},
    actions: {},
    tests: {},
    // root of the app folder
    root: process.cwd(),
    name: configName
  }

  if (!includeIndex[fullKeyPrefix]) {
    // config does not exist, return empty config
    return config
  }

  // Default paths are relative to the folder holding the config file.
  // Let's search the config path that defines a key in the same config object level as 'web' or
  // 'action'
  const otherKeyInObject = Object.keys(singleUserConfig)[0]
  const configFilePath = includeIndex[`${fullKeyPrefix}.${otherKeyInObject}`].file

  const defaultActionPath = resolveToRoot('actions/', configFilePath)
  const defaultWebPath = resolveToRoot('web-src/', configFilePath)
  const defaultUnitTestPath = resolveToRoot('test/', configFilePath)
  const defaultE2eTestPath = resolveToRoot('e2e/', configFilePath)
  const defaultDistPath = 'dist/' // relative to root

  // absolute paths
  const actions = singleUserConfig.actions || defaultActionPath
  const unitTest = singleUserConfig.unitTest || defaultUnitTestPath
  const e2eTest = singleUserConfig.e2eTest || defaultE2eTestPath
  const dist = singleUserConfig.dist || defaultDistPath

  // web src folder might be defined in 'web' key or 'web.src' key
  let web
  if (typeof singleUserConfig.web === 'string') {
    web = singleUserConfig.web
  } else if (typeof singleUserConfig.web === 'object') {
    web = singleUserConfig.web.src || defaultWebPath
  } else {
    web = defaultWebPath
  }

  config.tests.unit = path.resolve(unitTest)
  config.tests.e2e = path.resolve(e2eTest)

  const manifest = singleUserConfig.runtimeManifest

  config.app.hasBackend = !!manifest
  config.app.hasFrontend = await fs.exists(web)
  config.app.dist = path.resolve(dist, dist === defaultDistPath ? subFolderName : '')

  if (singleUserConfig.events) {
    config.events = { ...singleUserConfig.events }
  }
  if (commonConfig?.aio?.project) {
    config.project = commonConfig.aio.project
  }

  // actions
  config.actions.src = path.resolve(actions) // needed for app add first action
  if (config.app.hasBackend) {
    config.actions.dist = path.join(config.app.dist, 'actions')
    config.manifest = { src: 'manifest.yml' } // even for non legacy config paths, it is required for runtime sync
    config.manifest.full = cloneDeep(manifest)
    config.manifest.packagePlaceholder = '__APP_PACKAGE__'
    config.manifest.package = config.manifest.full.packages && config.manifest.full.packages[config.manifest.packagePlaceholder]
    if (config.manifest.package) {
      aioLogger.debug(`Use of ${config.manifest.packagePlaceholder} in manifest.yml.`)
    }
    // Note: we should set the config.manifest.package also if it's not using a placeholder
  }

  // web
  config.web.src = path.resolve(web) // needed for app add first web-assets
  if (singleUserConfig.web && singleUserConfig.web['response-headers']) {
    config.web['response-headers'] = singleUserConfig.web['response-headers']
  }
  if (config.app.hasFrontend) {
    config.web.injectedConfig = path.resolve(path.join(web, 'src', 'config.json'))
    // only add subfolder name if dist is default value
    config.web.distDev = path.join(config.app.dist, 'web-dev')
    config.web.distProd = path.join(config.app.dist, 'web-prod')
    config.s3.credsCacheFile = path.resolve('.aws.tmp.creds.json')
    config.s3.folder = commonConfig.ow.namespace

    if (singleUserConfig.awsaccesskeyid &&
      singleUserConfig.awssecretaccesskey &&
      singleUserConfig.s3bucket) {
      config.s3.creds = {
        accessKeyId: singleUserConfig.awsaccesskeyid,
        secretAccessKey: singleUserConfig.awssecretaccesskey,
        params: { Bucket: singleUserConfig.s3bucket }
      }
    }
    if (singleUserConfig.tvmurl !== defaults.defaultTvmUrl) {
      // Legacy applications set the defaultTvmUrl in .env, so we need to ignore it to not
      // consider it as custom. The default will be set downstream by aio-lib-core-tvm.
      config.s3.tvmUrl = singleUserConfig.tvmurl
    }
  }

  config.ow = commonConfig.ow

  config.app.defaultHostname = getCliEnv() === STAGE_ENV ? defaults.stageAppHostname : defaults.defaultAppHostname
  config.app.hostname = singleUserConfig.hostname || config.app.defaultHostname
  config.app.htmlCacheDuration = singleUserConfig.htmlcacheduration || defaults.defaultHTMLCacheDuration
  config.app.jsCacheDuration = singleUserConfig.jscacheduration || defaults.defaultJSCacheDuration
  config.app.cssCacheDuration = singleUserConfig.csscacheduration || defaults.defaultCSSCacheDuration
  config.app.imageCacheDuration = singleUserConfig.imagecacheduration || defaults.defaultImageCacheDuration
  config.hooks = singleUserConfig.hooks || {}

  config.imsOrgId = commonConfig.imsOrgId
  config.app.name = commonConfig.packagejson.name
  config.app.version = commonConfig.packagejson.version

  return config
}

// Because of the $include directives, config paths (e.g actions: './path/to/actions') can
// be relative to config files in any subfolder. Config keys that define path values are
// identified and their value is rewritten relative to the root folder.
/** @private */
function resolveToRoot (pathValue, includedFromConfigPath, options = {}) {
  // path.resolve => support both absolute pathValue and relative (relative joins with
  // config dir and process.cwd, absolute returns pathValue)
  return options.absolutePaths
    ? path.resolve(path.dirname(includedFromConfigPath), pathValue)
    // if relative keep unix paths
    : path.join(path.dirname(includedFromConfigPath), pathValue).split(path.sep).join(path.posix.sep)
}

module.exports = {
  load,
  validate,
  coalesce
}
