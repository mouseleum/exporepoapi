// Next.js regenerates server-action IDs on every deployment. A browser tab
// left open across a deploy still references the old IDs, so the next server
// action call fails with one of the messages below. It is fully recoverable
// by reloading the page, which pulls the current bundle.

const SIGNATURES = [
  /server action .*was not found on the server/i,
  /failed to find server action/i,
  /from an older or newer deployment/i,
];

export const STALE_DEPLOYMENT_MESSAGE =
  "The app was updated since this page loaded. Reload to continue.";

export function isStaleDeploymentError(value: unknown): boolean {
  const text =
    value instanceof Error
      ? value.message
      : typeof value === "string"
        ? value
        : "";
  if (!text) return false;
  return SIGNATURES.some((re) => re.test(text));
}
