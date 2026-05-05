export function parseBooleanEnv(value: string | undefined, defaultValue: boolean) {
	if (value === undefined) return defaultValue;

	const normalized = value.trim().toLowerCase();
	if (["1", "true", "yes", "on", "enabled"].includes(normalized)) return true;
	if (["0", "false", "no", "off", "disabled"].includes(normalized)) return false;

	return defaultValue;
}

export const DEFAULT_GUARD_ENABLED = parseBooleanEnv(process.env.PI_BASH_GUARD_ENABLED, false);
