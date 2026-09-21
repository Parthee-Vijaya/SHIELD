// Transport limits are separate from each model call's bounded context.
// Complete sources are mapped in smaller batches, never silently truncated.
export const MAX_AI_INPUT_CHARS = 16_000_000;
export const MAX_AI_RAW_INPUT_CHARS = 20_000_000;
