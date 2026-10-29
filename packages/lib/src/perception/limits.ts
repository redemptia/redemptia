/** Perception isn't priced for cloud, and the public demo is read-only. */
export const PERCEPTION_MODES = ["local", "whitelabel"] as const;

export function perceptionAvailableIn(mode: string): boolean {
	return (PERCEPTION_MODES as readonly string[]).includes(mode);
}
