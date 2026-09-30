import { homeServices } from "@/modules/home-services";
import { recurringHome } from "@/modules/recurring-home";
import type { ModuleManifest } from "@/lib/modules/types";

/**
 * Every module the app knows about. This is the ONLY file that imports
 * modules; app/ code passes MODULES into lib/ helpers (lib/modules/types.ts).
 * Add a module here once it's built; a business still only gets it when its
 * org_modules row is enabled.
 */
export const MODULES: readonly ModuleManifest[] = [homeServices, recurringHome];
