import { fileURLToPath as __eveFileURLToPath } from "node:url";
import { dirname as __eveDirname } from "node:path";
const __filename = __eveFileURLToPath(import.meta.url);
__eveDirname(__filename);
import "../_runtime.mjs";
import { finalizeInstrumentationProviders, seedInstrumentationProviders, shutdownInstrumentationProviders } from "file:///Users/dammyola/Projects/mystudypartnar/node_modules/.pnpm/eve@0.81.0_ai@7.0.145_zod@4.6.7_/node_modules/eve/dist/src/instrumentation/providers.js";
//#region .eve/dev-hosts/efd8515b-e40d-4c69-b484-02632253b25e/artifacts/compiled-artifacts-instrumentation.mjs
seedInstrumentationProviders();
finalizeInstrumentationProviders({ serviceName: "mystudypartnar" });
function installInstrumentationPlugin(nitroApp) {
	nitroApp?.hooks?.hook("close", async () => {
		await shutdownInstrumentationProviders();
	});
}
//#endregion
export { installInstrumentationPlugin };

//# sourceMappingURL=compiled-artifacts-instrumentation.mjs.map