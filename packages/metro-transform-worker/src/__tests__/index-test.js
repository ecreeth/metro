/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+metro_bundler
 * @flow strict-local
 * @format
 */

'use strict';

jest
  .mock('../utils/getMinifier', () => () => ({code, map}) => ({
    code: code.replace('arbitrary(code)', 'minified(code)'),
    map,
  }))
  .mock('metro-transform-plugins', () => ({
    ...jest.requireActual('metro-transform-plugins'),
    inlinePlugin: () => ({}),
    constantFoldingPlugin: () => ({}),
  }))
  .mock('metro-minify-uglify');

import type {JsTransformerConfig} from '../index';
import typeof TransformerType from '../index';
import typeof FSType from 'fs';

const HermesCompiler = require('metro-hermes-compiler');
const path = require('path');

const babelTransformerPath = require.resolve(
  'metro-react-native-babel-transformer',
);
const transformerContents = (() =>
  require('fs').readFileSync(babelTransformerPath))();

const HEADER_DEV =
  '__d(function (global, _$$_REQUIRE, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {';
const HEADER_PROD = '__d(function (g, r, i, a, m, e, d) {';

let fs: FSType;
let Transformer: TransformerType;

const baseConfig: JsTransformerConfig = {
  allowOptionalDependencies: false,
  assetPlugins: [],
  assetRegistryPath: '',
  asyncRequireModulePath: 'asyncRequire',
  babelTransformerPath,
  dynamicDepsInPackages: 'reject',
  enableBabelRCLookup: false,
  enableBabelRuntime: true,
  experimentalImportBundleSupport: false,
  globalPrefix: '',
  hermesParser: false,
  minifierConfig: {},
  minifierPath: 'minifyModulePath',
  optimizationSizeLimit: 100000,
  publicPath: '/assets',
  unstable_collectDependenciesPath:
    'metro/src/ModuleGraph/worker/collectDependencies',
  unstable_dependencyMapReservedName: null,
  unstable_compactOutput: false,
  unstable_disableModuleWrapping: false,
  unstable_disableNormalizePseudoGlobals: false,
};

beforeEach(() => {
  jest.resetModules();

  jest.mock('fs', () => new (require('metro-memory-fs'))());

  fs = require('fs');
  Transformer = require('../');
  // $FlowFixMe[prop-missing] Cannot call `fs.reset` because property `reset` is missing in  module `fs`
  fs.reset();

  fs.mkdirSync('/root/local', {recursive: true});
  fs.mkdirSync(path.dirname(babelTransformerPath), {recursive: true});
  fs.writeFileSync(babelTransformerPath, transformerContents);
});

it('transforms a simple script', async () => {
  const result = await Transformer.transform(
    baseConfig,
    '/root',
    'local/file.js',
    // $FlowFixMe[incompatible-call] Added when annotating Transformer. string is incompatible with Buffer.
    'someReallyArbitrary(code)',
    // $FlowFixMe[prop-missing] Added when annotating Transformer.
    {
      dev: true,
      type: 'script',
    },
  );

  expect(result.output[0].type).toBe('js/script');
  expect(result.output[0].data.code).toBe(
    [
      '(function (global) {',
      '  someReallyArbitrary(code);',
      "})(typeof globalThis !== 'undefined' ? globalThis : typeof global !== 'undefined' ? global : typeof window !== 'undefined' ? window : this);",
    ].join('\n'),
  );
  expect(result.output[0].data.map).toMatchSnapshot();
  expect(result.output[0].data.functionMap).toMatchSnapshot();
  expect(result.dependencies).toEqual([]);
});

it('transforms a simple module', async () => {
  const result = await Transformer.transform(
    baseConfig,
    '/root',
    'local/file.js',
    // $FlowFixMe[incompatible-call] Added when annotating Transformer. string is incompatible with Buffer.
    'arbitrary(code)',
    // $FlowFixMe[prop-missing] Added when annotating Transformer.
    {
      dev: true,
      type: 'module',
    },
  );

  expect(result.output[0].type).toBe('js/module');
  expect(result.output[0].data.code).toBe(
    [HEADER_DEV, '  arbitrary(code);', '});'].join('\n'),
  );
  expect(result.output[0].data.map).toMatchSnapshot();
  expect(result.output[0].data.functionMap).toMatchSnapshot();
  expect(result.dependencies).toEqual([]);
});

it('transforms a module with dependencies', async () => {
  const contents = [
    '"use strict";',
    'require("./a");',
    'arbitrary(code);',
    'const b = require("b");',
    'import c from "./c";',
  ].join('\n');

  const result = await Transformer.transform(
    baseConfig,
    '/root',
    'local/file.js',
    // $FlowFixMe[incompatible-call] Added when annotating Transformer. string is incompatible with Buffer.
    contents,
    // $FlowFixMe[prop-missing] Added when annotating Transformer.
    {
      dev: true,
      type: 'module',
    },
  );

  expect(result.output[0].type).toBe('js/module');
  expect(result.output[0].data.code).toBe(
    [
      HEADER_DEV,
      '  "use strict";',
      '',
      '  var _interopRequireDefault = _$$_REQUIRE(_dependencyMap[0], "@babel/runtime/helpers/interopRequireDefault");',
      '',
      '  var _c = _interopRequireDefault(_$$_REQUIRE(_dependencyMap[1], "./c"));',
      '',
      '  _$$_REQUIRE(_dependencyMap[2], "./a");',
      '',
      '  arbitrary(code);',
      '',
      '  var b = _$$_REQUIRE(_dependencyMap[3], "b");',
      '});',
    ].join('\n'),
  );
  expect(result.output[0].data.map).toMatchSnapshot();
  expect(result.output[0].data.functionMap).toMatchSnapshot();
  expect(result.dependencies).toEqual([
    {
      data: expect.objectContaining({asyncType: null}),
      name: '@babel/runtime/helpers/interopRequireDefault',
    },
    {data: expect.objectContaining({asyncType: null}), name: './c'},
    {data: expect.objectContaining({asyncType: null}), name: './a'},
    {data: expect.objectContaining({asyncType: null}), name: 'b'},
  ]);
});

it('transforms an es module with asyncToGenerator', async () => {
  const result = await Transformer.transform(
    baseConfig,
    '/root',
    'local/file.js',
    // $FlowFixMe[incompatible-call] Added when annotating Transformer. string is incompatible with Buffer.
    'export async function test() {}',
    // $FlowFixMe[prop-missing] Added when annotating Transformer.
    {
      dev: true,
      type: 'module',
    },
  );

  expect(result.output[0].type).toBe('js/module');
  expect(result.output[0].data.code).toMatchSnapshot();
  expect(result.output[0].data.map).toHaveLength(6);
  expect(result.output[0].data.functionMap).toMatchSnapshot();
  expect(result.dependencies).toEqual([
    {
      data: expect.objectContaining({asyncType: null}),
      name: '@babel/runtime/helpers/interopRequireDefault',
    },
    {
      data: expect.objectContaining({asyncType: null}),
      name: '@babel/runtime/helpers/asyncToGenerator',
    },
  ]);
});

it('transforms async generators', async () => {
  const result = await Transformer.transform(
    baseConfig,
    '/root',
    'local/file.js',
    // $FlowFixMe[incompatible-call] Added when annotating Transformer. string is incompatible with Buffer.
    'export async function* test() { yield "ok"; }',
    // $FlowFixMe[prop-missing] Added when annotating Transformer.
    {
      dev: true,
      type: 'module',
    },
  );

  expect(result.output[0].data.code).toMatchSnapshot();
  expect(result.dependencies).toEqual([
    {
      data: expect.objectContaining({asyncType: null}),
      name: '@babel/runtime/helpers/interopRequireDefault',
    },
    {
      data: expect.objectContaining({asyncType: null}),
      name: '@babel/runtime/helpers/awaitAsyncGenerator',
    },
    {
      data: expect.objectContaining({asyncType: null}),
      name: '@babel/runtime/helpers/wrapAsyncGenerator',
    },
  ]);
});

it('transforms import/export syntax when experimental flag is on', async () => {
  const contents = ['import c from "./c";'].join('\n');

  const result = await Transformer.transform(
    baseConfig,
    '/root',
    'local/file.js',
    // $FlowFixMe[incompatible-call] Added when annotating Transformer. string is incompatible with Buffer.
    contents,
    // $FlowFixMe[prop-missing] Added when annotating Transformer.
    {
      dev: true,
      experimentalImportSupport: true,
      type: 'module',
    },
  );

  expect(result.output[0].type).toBe('js/module');
  expect(result.output[0].data.code).toBe(
    [
      HEADER_DEV,
      '  "use strict";',
      '',
      '  var c = _$$_IMPORT_DEFAULT(_dependencyMap[0], "./c");',
      '});',
    ].join('\n'),
  );
  expect(result.output[0].data.map).toMatchSnapshot();
  expect(result.output[0].data.functionMap).toMatchSnapshot();
  expect(result.dependencies).toEqual([
    {
      data: expect.objectContaining({
        asyncType: null,
      }),
      name: './c',
    },
  ]);
});

it('does not add "use strict" on non-modules', async () => {
  const result = await Transformer.transform(
    baseConfig,
    '/root',
    'node_modules/local/file.js',
    // $FlowFixMe[incompatible-call] Added when annotating Transformer. string is incompatible with Buffer.
    'module.exports = {};',
    // $FlowFixMe[prop-missing] Added when annotating Transformer.
    {
      dev: true,
      experimentalImportSupport: true,
      type: 'module',
    },
  );

  expect(result.output[0].type).toBe('js/module');
  expect(result.output[0].data.code).toBe(
    [HEADER_DEV, '  module.exports = {};', '});'].join('\n'),
  );
});

it('preserves require() calls when module wrapping is disabled', async () => {
  const contents = ['require("./c");'].join('\n');

  const result = await Transformer.transform(
    {
      ...baseConfig,
      unstable_disableModuleWrapping: true,
    },
    '/root',
    'local/file.js',
    // $FlowFixMe[incompatible-call] Added when annotating Transformer. string is incompatible with Buffer.
    contents,
    // $FlowFixMe[prop-missing] Added when annotating Transformer.
    {
      dev: true,
      type: 'module',
    },
  );

  expect(result.output[0].type).toBe('js/module');
  expect(result.output[0].data.code).toBe('require("./c");');
});

it('reports filename when encountering unsupported dynamic dependency', async () => {
  const contents = [
    'require("./a");',
    'let a = arbitrary(code);',
    'const b = require(a);',
  ].join('\n');

  try {
    await Transformer.transform(
      baseConfig,
      '/root',
      'local/file.js',
      // $FlowFixMe[incompatible-call] Added when annotating Transformer. string is incompatible with Buffer.
      contents,
      // $FlowFixMe[prop-missing] Added when annotating Transformer.
      {
        dev: true,
        type: 'module',
      },
    );
    throw new Error('should not reach this');
  } catch (error) {
    expect(error.message).toMatchSnapshot();
  }
});

it('supports dynamic dependencies from within `node_modules`', async () => {
  expect(
    (
      await Transformer.transform(
        {
          ...baseConfig,
          dynamicDepsInPackages: 'throwAtRuntime',
        },
        '/root',
        'node_modules/foo/bar.js',
        // $FlowFixMe[incompatible-call] Added when annotating Transformer. string is incompatible with Buffer.
        'require(foo.bar);',
        // $FlowFixMe[prop-missing] Added when annotating Transformer.
        {
          dev: true,
          type: 'module',
        },
      )
    ).output[0].data.code,
  ).toBe(
    [
      HEADER_DEV,
      '  (function (line) {',
      "    throw new Error('Dynamic require defined at line ' + line + '; not supported by Metro');",
      '  })(1);',
      '});',
    ].join('\n'),
  );
});

it('minifies the code correctly', async () => {
  expect(
    (
      await Transformer.transform(
        baseConfig,
        '/root',
        'local/file.js',
        // $FlowFixMe[incompatible-call] Added when annotating Transformer. string is incompatible with Buffer.
        'arbitrary(code);',
        // $FlowFixMe[prop-missing] Added when annotating Transformer.
        {
          dev: true,
          minify: true,
          type: 'module',
        },
      )
    ).output[0].data.code,
  ).toBe([HEADER_PROD, '  minified(code);', '});'].join('\n'));
});

it('minifies a JSON file', async () => {
  expect(
    (
      await Transformer.transform(
        baseConfig,
        '/root',
        'local/file.json',
        // $FlowFixMe[incompatible-call] Added when annotating Transformer. string is incompatible with Buffer.
        'arbitrary(code);',
        // $FlowFixMe[prop-missing] Added when annotating Transformer.
        {
          dev: true,
          minify: true,
          type: 'module',
        },
      )
    ).output[0].data.code,
  ).toBe(
    [
      '__d(function(global, require, _importDefaultUnused, _importAllUnused, module, exports, _dependencyMapUnused) {',
      '  module.exports = minified(code);;',
      '});',
    ].join('\n'),
  );
});

it('does not wrap a JSON file when disableModuleWrapping is enabled', async () => {
  expect(
    (
      await Transformer.transform(
        {
          ...baseConfig,
          unstable_disableModuleWrapping: true,
        },
        '/root',
        'local/file.json',
        // $FlowFixMe[incompatible-call] Added when annotating Transformer. string is incompatible with Buffer.
        'arbitrary(code);',
        // $FlowFixMe[prop-missing] Added when annotating Transformer.
        {
          dev: true,
          type: 'module',
        },
      )
    ).output[0].data.code,
  ).toBe('module.exports = arbitrary(code);;');
});

it('transforms a script to JS source and bytecode', async () => {
  const result = await Transformer.transform(
    baseConfig,
    '/root',
    'local/file.js',
    // $FlowFixMe[incompatible-call] Added when annotating Transformer. string is incompatible with Buffer.
    'someReallyArbitrary(code)',
    // $FlowFixMe[prop-missing] Added when annotating Transformer.
    {
      dev: true,
      runtimeBytecodeVersion: 1,
      type: 'script',
    },
  );

  const jsOutput = result.output.find(output => output.type === 'js/script');
  const bytecodeOutput = result.output.find(
    output => output.type === 'bytecode/script',
  );
  // $FlowFixMe[incompatible-use] Added when annotating Transformer. data missing in jsOutput.
  expect(jsOutput.data.code).toBe(
    [
      '(function (global) {',
      '  someReallyArbitrary(code);',
      "})(typeof globalThis !== 'undefined' ? globalThis : typeof global !== 'undefined' ? global : typeof window !== 'undefined' ? window : this);",
    ].join('\n'),
  );

  expect(() =>
    // $FlowFixMe[incompatible-use] Added when annotating Transformer. data missing in bytecodeOutput.
    // $FlowFixMe[incompatible-call] Added when annotating Transformer. bytecode property is missing.
    HermesCompiler.validateBytecodeModule(bytecodeOutput.data.bytecode, 0),
  ).not.toThrow();
});

it('allows replacing the collectDependencies implementation', async () => {
  jest.mock(
    'metro-transform-worker/__virtual__/collectModifiedDependencies',
    () =>
      jest.fn((ast, opts) => {
        const metroCoreCollectDependencies = jest.requireActual(
          'metro/src/ModuleGraph/worker/collectDependencies',
        );
        const collectedDeps = metroCoreCollectDependencies(ast, opts);
        return {
          ...collectedDeps,
          dependencies: collectedDeps.dependencies.map(dep => ({
            ...dep,
            name: 'modified_' + dep.name,
          })),
        };
      }),
    {virtual: true},
  );

  const config = {
    ...baseConfig,
    unstable_collectDependenciesPath:
      'metro-transform-worker/__virtual__/collectModifiedDependencies',
  };
  const options = {
    dev: true,
    type: 'module',
  };
  const result = await Transformer.transform(
    config,
    '/root',
    'local/file.js',
    // $FlowFixMe[incompatible-call] Added when annotating Transformer. string is incompatible with Buffer.
    'require("foo")',
    // $FlowFixMe[prop-missing] Added when annotating Transformer.
    options,
  );

  // $FlowIgnore[cannot-resolve-module] this is a virtual module
  const collectModifiedDependencies = require('metro-transform-worker/__virtual__/collectModifiedDependencies');
  expect(collectModifiedDependencies).toHaveBeenCalledWith(
    expect.objectContaining({type: 'File'}),
    {
      allowOptionalDependencies: config.allowOptionalDependencies,
      asyncRequireModulePath: config.asyncRequireModulePath,
      dynamicRequires: 'reject',
      inlineableCalls: ['_$$_IMPORT_DEFAULT', '_$$_IMPORT_ALL'],
      keepRequireNames: options.dev,
      dependencyMapName: null,
    },
  );
  expect(result.dependencies).toEqual([
    expect.objectContaining({name: 'modified_foo'}),
  ]);
});

it('uses a reserved dependency map name and prevents it from being minified', async () => {
  const result = await Transformer.transform(
    {...baseConfig, unstable_dependencyMapReservedName: 'THE_DEP_MAP'},
    '/root',
    'local/file.js',
    // $FlowFixMe[incompatible-call] Added when annotating Transformer. string is incompatible with Buffer.
    'arbitrary(code);',
    // $FlowFixMe[prop-missing] Added when annotating Transformer.
    {
      dev: false,
      minify: true,
      type: 'module',
    },
  );
  expect(result.output[0].data.code).toMatchInlineSnapshot(`
    "__d(function (g, r, i, a, m, e, THE_DEP_MAP) {
      minified(code);
    });"
  `);
});

it('throws if the reserved dependency map name appears in the input', async () => {
  await expect(
    Transformer.transform(
      {...baseConfig, unstable_dependencyMapReservedName: 'THE_DEP_MAP'},
      '/root',
      'local/file.js',
      // $FlowFixMe[incompatible-call] Added when annotating Transformer. string is incompatible with Buffer.
      'arbitrary(code); /* the code is not allowed to mention THE_DEP_MAP, even in a comment */',
      // $FlowFixMe[prop-missing] Added when annotating Transformer.
      {
        dev: false,
        minify: true,
        type: 'module',
      },
    ),
  ).rejects.toThrowErrorMatchingInlineSnapshot(
    `"Source code contains the reserved string \`THE_DEP_MAP\` at character offset 55"`,
  );
});

it('allows disabling the normalizePseudoGlobals pass when minifying', async () => {
  const result = await Transformer.transform(
    {...baseConfig, unstable_disableNormalizePseudoGlobals: true},
    '/root',
    'local/file.js',
    // $FlowFixMe[incompatible-call] Added when annotating Transformer. string is incompatible with Buffer.
    'arbitrary(code);',
    // $FlowFixMe[prop-missing] Added when annotating Transformer.
    {
      dev: false,
      minify: true,
      type: 'module',
    },
  );
  expect(result.output[0].data.code).toMatchInlineSnapshot(`
    "__d(function (global, _$$_REQUIRE, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
      minified(code);
    });"
  `);
});

it('allows emitting compact code when not minifying', async () => {
  const result = await Transformer.transform(
    {...baseConfig, unstable_compactOutput: true},
    '/root',
    'local/file.js',
    // $FlowFixMe[incompatible-call] Added when annotating Transformer. string is incompatible with Buffer.
    'arbitrary(code);',
    // $FlowFixMe[prop-missing] Added when annotating Transformer.
    {
      dev: false,
      minify: false,
      type: 'module',
    },
  );
  expect(result.output[0].data.code).toMatchInlineSnapshot(
    `"__d(function(global,_$$_REQUIRE,_$$_IMPORT_DEFAULT,_$$_IMPORT_ALL,module,exports,_dependencyMap){arbitrary(code);});"`,
  );
});

it('skips minification in Hermes stable transform profile', async () => {
  const result = await Transformer.transform(
    baseConfig,
    '/root',
    'local/file.js',
    // $FlowFixMe[incompatible-call] Added when annotating Transformer. string is incompatible with Buffer.
    'arbitrary(code);',
    // $FlowFixMe[prop-missing] Added when annotating Transformer.
    {
      dev: false,
      minify: true,
      type: 'module',
      unstable_transformProfile: 'hermes-canary',
    },
  );
  expect(result.output[0].data.code).toMatchInlineSnapshot(`
    "__d(function (global, _$$_REQUIRE, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
      arbitrary(code);
    });"
  `);
});

it('skips minification in Hermes canary transform profile', async () => {
  const result = await Transformer.transform(
    baseConfig,
    '/root',
    'local/file.js',
    // $FlowFixMe[incompatible-call] Added when annotating Transformer. string is incompatible with Buffer.
    'arbitrary(code);',
    // $FlowFixMe[prop-missing] Added when annotating Transformer.
    {
      dev: false,
      minify: true,
      type: 'module',
      unstable_transformProfile: 'hermes-canary',
    },
  );
  expect(result.output[0].data.code).toMatchInlineSnapshot(`
    "__d(function (global, _$$_REQUIRE, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
      arbitrary(code);
    });"
  `);
});

it('counts all line endings correctly', async () => {
  const transformStr = (
    str: $TEMPORARY$string<'one\ntwo\nthree\nfour\nfive\nsix'> | string,
  ) =>
    Transformer.transform(
      baseConfig,
      '/root',
      'local/file.js',
      // $FlowFixMe[incompatible-call] Added when annotating Transformer. string is incompatible with Buffer.
      str,
      // $FlowFixMe[prop-missing] Added when annotating Transformer.
      {
        dev: false,
        minify: false,
        type: 'module',
      },
    );

  const differentEndingsResult = await transformStr(
    'one\rtwo\r\nthree\nfour\u2028five\u2029six',
  );

  const standardEndingsResult = await transformStr(
    'one\ntwo\nthree\nfour\nfive\nsix',
  );

  expect(differentEndingsResult.output[0].data.lineCount).toEqual(
    standardEndingsResult.output[0].data.lineCount,
  );
});
