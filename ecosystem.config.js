// pm2 process definition for running the production server as a managed,
// auto-restartable service (see README's "Auto-rebuild on git pull"
// section). Start once with `pm2 start ecosystem.config.js`; the post-merge
// git hook restarts it by name after every rebuild.
module.exports = {
  apps: [
    {
      name: "test-failures-dashboard",
      script: "npm",
      args: "start",
      cwd: __dirname,
      windowsHide: true,
      autorestart: true,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
