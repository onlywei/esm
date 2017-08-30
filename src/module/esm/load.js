import _load from "../load.js"
import createOptions from "../../util/create-options.js"
import { dirname } from "path"
import extname from "../../path/extname.js"
import moduleState from "../state.js"
import nodeModulePaths from "../node-module-paths.js"
import resolveFilename from "./resolve-filename.js"
import setGetter from "../../util/set-getter.js"

const BuiltinModule = __non_webpack_module__.constructor

const queryHashRegExp = /[?#].*$/

function load(id, parent, options) {
  options = createOptions(options)

  const state = parent ? parent.constructor : moduleState
  const filePath = resolveFilename(id, parent, options)

  let oldChildA
  let oldChildB
  let cacheId = filePath
  let queryHash = queryHashRegExp.exec(id)

  if (queryHash !== null) {
    // Each id with a query+hash is given a new cache entry.
    cacheId = filePath + queryHash[0]

    if (cacheId in state._cache) {
      return state._cache[cacheId]
    }

    // Backup the existing cache entries. The child module will be stored
    // there because Node sees the file path without the query+hash.
    if (filePath in state._cache) {
      oldChildA = state._cache[filePath]
      delete state._cache[filePath]
    }

    if (filePath in BuiltinModule._cache) {
      oldChildB = state._cache[filePath]
      delete BuiltinModule._cache[filePath]
    }
  }

  let child
  let error

  try {
    child = _load(filePath, parent, options.isMain, loader, () => filePath)
  } catch (e) {
    error = e
  }

  if (queryHash !== null) {
    state._cache[cacheId] =
    BuiltinModule._cache[cacheId] = child

    if (oldChildA) {
      state._cache[filePath] = oldChildA
    } else {
      delete state._cache[filePath]
    }

    if (oldChildB) {
      BuiltinModule._cache[filePath] = oldChildB
    } else {
      delete BuiltinModule._cache[filePath]
    }
  }

  if (error) {
    // Unlike CJS, ESM errors are preserved for subsequent loads.
    setGetter(state._cache, cacheId, () => {
      throw error
    })

    throw error
  }

  return child
}

function loader(filePath) {
  let { _extensions } = moduleState
  let ext = extname(filePath)
  const mod = this

  if (! ext || typeof _extensions[ext] !== "function") {
    ext = ".js"
  }

  if (ext === ".js") {
    ({ _extensions } = mod.constructor)
  }

  const compiler = _extensions[ext]

  if (typeof compiler === "function") {
    mod.filename = filePath
    mod.paths = nodeModulePaths(dirname(filePath))
    compiler.call(_extensions, mod, filePath)
    mod.loaded = true
  } else {
    mod.load(filePath)
  }
}

export default load