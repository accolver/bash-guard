import { describe, expect, test } from "bun:test";

import { DEFAULT_GUARD_ENABLED, parseBooleanEnv } from "./config";

describe("DEFAULT_GUARD_ENABLED", () => {
	test("starts disabled unless PI_BASH_GUARD_ENABLED opts in", () => {
		expect(DEFAULT_GUARD_ENABLED).toBe(false);
	});
});

describe("parseBooleanEnv", () => {
	test("uses the default when unset or unrecognized", () => {
		expect(parseBooleanEnv(undefined, true)).toBe(true);
		expect(parseBooleanEnv(undefined, false)).toBe(false);
		expect(parseBooleanEnv("maybe", true)).toBe(true);
		expect(parseBooleanEnv("maybe", false)).toBe(false);
	});

	test("recognizes enabled values", () => {
		for (const value of ["1", "true", "yes", "on", "enabled", " TRUE "]) {
			expect(parseBooleanEnv(value, false)).toBe(true);
		}
	});

	test("recognizes disabled values", () => {
		for (const value of ["0", "false", "no", "off", "disabled", " OFF "]) {
			expect(parseBooleanEnv(value, true)).toBe(false);
		}
	});
});
