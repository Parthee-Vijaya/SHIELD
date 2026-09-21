// Include up to 500k source-text characters, provenance, the questionnaire,
// the base report and an evaluated draft. Wire JSON also needs whitespace room.
// These transport bounds do not change JEV's per-call context or call budget.
export const MAX_AI_INPUT_CHARS = 1_600_000;
export const MAX_AI_RAW_INPUT_CHARS = 2_000_000;
