// Ambient declaration: @cloudflare/puppeteer is not vendored here; the Worker build resolves it from the registry.
declare module '@cloudflare/puppeteer' {
  const puppeteer: { launch(binding: unknown): Promise<unknown>; default?: unknown };
  export default puppeteer;
}
