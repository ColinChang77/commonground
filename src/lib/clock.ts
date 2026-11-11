/** Request-time clock for server components (kept out of render bodies for lint purity). */
export const nowMs = () => Date.now();
