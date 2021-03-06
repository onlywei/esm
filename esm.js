/* eslint strict: off, node/no-unsupported-features: ["error", { version: 6 }] */
"use strict"

const { apply, defineProperty } = Reflect
const { freeze } = Object
const { chakracore } = process.versions
const { filename, id } = module

const bootstrap = id.startsWith("internal/")
  ? safeRequire("internal/bootstrap/loaders")
  : void 0

const { Script } = require("vm")
const { runInNewContext, runInThisContext } = Script.prototype
const { sep } = require("path")

const {
  Stats,
  mkdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync
} = require("fs")

const { isFile } = Stats.prototype

const Module = require("module")
const NativeModule = bootstrap && bootstrap.NativeModule

const esmModule = new Module(id)
const useBuiltins = module.constructor.length > 1

esmModule.filename = filename
esmModule.parent = module.parent

let esmRequire = require

if (! useBuiltins &&
    ! NativeModule &&
    typeof esmModule.require === "function") {
  esmRequire = (request) => esmModule.require(request)
}

function compileESM() {
  let cachedData
  let cacheFilename
  let cachePath
  let content
  let filename = "esm.js"

  if (NativeModule) {
    content = NativeModule._source["internal/esm/loader"]
  } else {
    const loaderPath = __dirname + sep + "esm" + sep + "loader.js"

    cachePath = __dirname + sep + "node_modules" + sep + ".cache" + sep + "esm"
    cacheFilename = cachePath + sep + ".loader.blob"
    cachedData = readFile(cacheFilename)
    content = readFile(loaderPath, "utf8")
    filename = __dirname + sep + filename
  }

  const script = new Script(
    "(function (require, module, __shared__) { " +
    content +
    "\n});", {
    __proto__: null,
    cachedData,
    filename,
    produceCachedData: ! NativeModule
  })

  let scriptData
  let changed = false

  if (! cachedData &&
      script.cachedData) {
    changed = true
    scriptData = script.cachedData
  } else if (cachedData &&
      script.cachedDataRejected) {
    changed = true
  }

  if (changed) {
    if (scriptData) {
      if (mkdirp(cachePath)) {
        writeFile(cacheFilename, scriptData)
      }
    } else {
      removeFile(cacheFilename)
    }
  }

  const options = {
    __proto__: null,
    filename
  }

  if (chakracore) {
    return apply(runInThisContext, script, [options])
  }

  const context = {
    __proto__: null,
    global
  }

  return apply(runInNewContext, script, [context, options])
}

function loadESM() {
  compiledESM(esmRequire, esmModule, shared)
  return esmModule.exports
}

function makeRequireFunction(mod, options) {
  return loadESM()(mod, options)
}

function mkdir(dirPath) {
  try {
    mkdirSync(dirPath)
    return true
  } catch (e) {}

  return false
}

function mkdirp(dirPath) {
  const paths = []

  while (true) {
    if (stat(dirPath) === 1) {
      break
    }

    paths.push(dirPath)

    const lastIndex = dirPath.lastIndexOf(sep)
    const parentPath = lastIndex === -1 ? "." : dirPath.slice(0, lastIndex)

    if (dirPath === parentPath) {
      break
    }

    dirPath = parentPath
  }

  let { length } = paths

  while (length--) {
    if (! mkdir(paths[length])) {
      return false
    }
  }

  return true
}

function readFile(filename, options) {
  try {
    return readFileSync(filename, options)
  } catch (e) {}
}

function removeFile(filename) {
  try {
    return unlinkSync(filename)
  } catch (e) {}
}

function safeRequire(request) {
  try {
    return require(request)
  } catch (e) {}
}

function stat(thePath) {
  try {
    return apply(isFile, statSync(thePath), []) ? 0 : 1
  } catch (e) {}

  return -1
}

function writeFile(filename, options) {
  try {
    return writeFileSync(filename, options)
  } catch (e) {}
}

const compiledESM = compileESM()

// Declare `shared` before assignment to avoid the TDZ.
let shared

shared = loadESM()

defineProperty(makeRequireFunction, shared.symbol.package, {
  __proto__: null,
  value: true
})

defineProperty(makeRequireFunction, shared.customInspectKey, {
  __proto__: null,
  value: () => "esm enabled"
})

freeze(makeRequireFunction)

module.exports = makeRequireFunction
