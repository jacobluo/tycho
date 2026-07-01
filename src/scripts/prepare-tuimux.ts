import { writeTuimuxConfig } from "../runtime/config.js";
import { tuimuxLocalConfigPath } from "../shared/paths.js";

await writeTuimuxConfig();
console.log(`Wrote ${tuimuxLocalConfigPath}`);
