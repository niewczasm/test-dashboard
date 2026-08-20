const REQUIRED = [22, 5, 0];

const [major, minor, patch] = process.versions.node.split(".").map(Number);
const current = [major, minor, patch];

function isTooOld() {
  for (let i = 0; i < REQUIRED.length; i++) {
    if (current[i] > REQUIRED[i]) return false;
    if (current[i] < REQUIRED[i]) return true;
  }
  return false;
}

if (isTooOld()) {
  console.error(
    `\nThis app requires Node.js >=${REQUIRED.join(".")} (that's the version node:sqlite ` +
      `shipped in — see src/lib/db.ts). You're running ${process.versions.node}.\n` +
      `Install a newer Node (nvm/nvm-windows/fnm, or nodejs.org) and try again.\n`
  );
  process.exit(1);
}
