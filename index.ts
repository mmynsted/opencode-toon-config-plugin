// Root entrypoint for the OpenCode V2 plugin loader.
//
// For absolute-path (local) plugin packages, Host.resolve looks for
// <dir>/server.ts or <dir>/index.ts at the package root — it does not read
// package.json main/exports (that path is only used for npm-installed
// packages). Without this file the plugin is silently skipped.
//
// The .js specifier lets this run directly under both Bun and tsc-emitted
// Node output; it resolves to src/index.ts in development and to the
// compiled src/index.js in published builds.
export { default } from "./src/index.js"
export * from "./src/index.js"
