import type { JestConfigWithTsJest } from 'ts-jest'

const jestConfig: JestConfigWithTsJest = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.(spec|test).ts'],
  preset: 'ts-jest/presets/default-esm',
  // https://github.com/kulshekhar/ts-jest/issues/1057
  moduleNameMapper: {
    '(.+)\\.js': '$1'
  },
}

export default jestConfig
