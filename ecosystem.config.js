// pm2 process definition for running the production server as a managed,
// auto-restartable service (see README's "Auto-rebuild on git pull"
// section). Start once with `pm2 start ecosystem.config.js`; the post-merge
// git hook restarts it by name after every rebuild.
//
// Runs Next's own entry script directly through node rather than `npm
// start` — pm2 on Windows resolves "npm" to npm.cmd and tries to execute
// that batch file as if it were a JS module, which fails with
// `SyntaxError: Unexpected token ':'` on its very first line. Next's
// script has a plain `#!/usr/bin/env node` shebang, so there's no
// .cmd/batch wrapper in the way on any platform.
module.exports = {
  apps: [
    {
      name: "test-failures-dashboard",
      script: "node_modules/next/dist/bin/next",
      args: "start",
      interpreter: "node",
      cwd: __dirname,
      windowsHide: true,
      autorestart: true,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
