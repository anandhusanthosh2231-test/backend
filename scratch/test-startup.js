const cp = require('child_process');

console.log('Starting without ADMIN_INITIAL_PASSWORD...');
const noPass = cp.spawnSync('node', ['--env-file=../../.env', './dist/index.mjs'], {
  cwd: './artifacts/api-server',
  env: { ...process.env, ADMIN_INITIAL_PASSWORD: '' }
});

console.log('Exit code:', noPass.status);
console.log('Stderr:', noPass.stderr.toString());
