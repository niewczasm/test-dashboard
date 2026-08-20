/**
 * Jenkins JUnit reports for some test runners (ctest/gtest, native binaries,
 * etc.) put the absolute workspace path into the class/test name instead of
 * a short package.Class — e.g.
 *   "/jenkins/tmp/server/workspace/team/job-master/test-release/test.exe"
 * for the job "team/job-master". Strip everything up through and including
 * the job's own path segment, leaving just the meaningful relative part
 * ("test-release/test.exe"). Falls back to the original string unchanged
 * when the job path isn't found in it — the normal case for ordinary short
 * class names, which is why this can run unconditionally on every name.
 */
export function shortenTestIdentifier(raw: string, jenkinsPath: string): string {
  if (!raw || !jenkinsPath) return raw;

  const segments = jenkinsPath.split("/").filter(Boolean);
  if (segments.length === 0) return raw;

  const sep = "[\\\\/]";
  const pathPattern = segments.map(escapeRegExp).join(sep);
  const match = raw.match(new RegExp(sep + pathPattern + sep));
  if (!match || match.index === undefined) return raw;

  const rest = raw.slice(match.index + match[0].length);
  return rest || raw;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
