// The shared api/ modules are plain CommonJS JavaScript; vite.config.ts wraps them as ES modules.
// Types for what the demo uses live in ./types.ts and are applied in ./index.ts.
declare module "@gotime/api/*" {
  const value: any;
  export default value;
}
