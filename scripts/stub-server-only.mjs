// Lets scripts/e2e-upload.ts import server modules under plain tsx: the
// server-only marker throws outside Next, so resolve it to an empty module.
export async function resolve(specifier, context, next) {
  if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
  return next(specifier, context);
}
