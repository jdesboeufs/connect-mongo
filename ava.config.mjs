export default {
  files: [
    'src/**/*.{test,spec}.ts'
  ],
  failFast: false,
  typescript: {
    // map TS paths -> compiled JS paths
    rewritePaths: {
      'src/': 'build/'
    },
    compile: 'tsc'
  },
  timeout: '15s',
  environmentVariables: {
    NODE_ENV: 'test'
  }
};
