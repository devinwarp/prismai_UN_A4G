import { cache } from "react";
import { loadRelease } from "./release-store";

/** loadRelease, worked out once per request: the use-case layout (the Next step card) and the page under it both ask. */
export const loadReleaseCached = cache(loadRelease);
