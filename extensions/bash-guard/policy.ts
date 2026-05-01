import { execFileSync } from "node:child_process";
import path from "node:path";

export type PolicyDecision =
	| { action: "none" }
	| { action: "allow"; reason: string }
	| { action: "review"; reason: string };

const CLOUD_MUTATION_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
	{ pattern: /^\s*(terraform|terragrunt)\s+.*\b(apply|destroy|import|state\s+(rm|mv|push)|taint|untaint|force-unlock)\b/i, label: "Terraform/Terragrunt state or resource mutation" },
	{ pattern: /^\s*gcloud\s+.*\b(create|update|delete|deploy|enable|disable|set-iam-policy|add-iam-policy-binding|remove-iam-policy-binding|set|unset)\b/i, label: "gcloud cloud-resource mutation" },
	{ pattern: /^\s*(aws|aws-vault)\s+.*\b(create|put|update|delete|remove|attach|detach|authorize|revoke|terminate|start|stop|modify|run-instances)\b/i, label: "AWS cloud-resource mutation" },
	{ pattern: /^\s*(gsutil|bq)\s+.*\b(cp|mv|rm|setmeta|ch|mk|update|delete|load|query)\b/i, label: "GCP data/resource mutation" },
	{ pattern: /^\s*kubectl\s+.*\b(apply|delete|patch|create|replace|scale|rollout|cordon|drain|taint|annotate|label)\b/i, label: "Kubernetes cluster mutation" },
];

const SENSITIVE_COMMAND_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
	{ pattern: /^\s*(sudo|su)\b/i, label: "privilege escalation" },
	{ pattern: /curl\b.*\|\s*(sh|bash)|wget\b.*\|\s*(sh|bash)/i, label: "remote script execution" },
	{ pattern: /\bchmod\s+777\b/i, label: "world-writable permissions" },
	{ pattern: /\brm\s+(-[^\s]*r[^\s]*f|-rf|-fr)\s+(\/|~|\$HOME)(\s|$)/i, label: "recursive force delete of a broad path" },
	{ pattern: /^\s*(env|printenv|set)\b/i, label: "environment variable disclosure" },
];

const MUTATION_COMMAND_PATTERN = /^\s*(rm|mv|cp|mkdir|touch|truncate|ln|chmod|chown|install)\b/i;

const SENSITIVE_PATH_PARTS = new Set([
	".aws",
	".azure",
	".config/gcloud",
	".docker/config.json",
	".gnupg",
	".kube",
	".netrc",
	".npmrc",
	".pypirc",
	".ssh",
]);

const SENSITIVE_BASENAMES = new Set([
	".env",
	".env.local",
	".env.production",
	".envrc",
	"credentials",
	"credentials.json",
	"id_rsa",
	"id_dsa",
	"id_ecdsa",
	"id_ed25519",
	"known_hosts",
	"service-account.json",
	"terraform.tfvars",
]);

const SENSITIVE_EXTENSIONS = new Set([".key", ".pem", ".p12", ".pfx"]);

export function normalizeCommand(command: string): string {
	// Collapse line-continuations and stray newlines into spaces so that
	// long paths wrapped by the LLM do not trigger the newline guard.
	return command.trim().replace(/\\\n\s*/g, "").replace(/\n\s*/g, " ");
}

function shellWords(command: string): string[] {
	const words: string[] = [];
	let current = "";
	let quote: "'" | '"' | null = null;
	let escaped = false;

	for (const char of command) {
		if (escaped) {
			current += char;
			escaped = false;
			continue;
		}
		if (char === "\\" && quote !== "'") {
			escaped = true;
			continue;
		}
		if ((char === "'" || char === '"') && !quote) {
			quote = char;
			continue;
		}
		if (quote === char) {
			quote = null;
			continue;
		}
		if (!quote && /\s/.test(char)) {
			if (current) words.push(current);
			current = "";
			continue;
		}
		current += char;
	}
	if (current) words.push(current);
	return words;
}

function isLikelyPathArg(arg: string): boolean {
	if (!arg || arg === "--" || arg.startsWith("-")) return false;
	if (/^(https?:|git@|ssh:)/i.test(arg)) return false;
	if (/^(~|\.|\.\.|\/)(\/|$)/.test(arg)) return true;
	if (arg.includes("/")) return true;
	if (SENSITIVE_BASENAMES.has(path.basename(arg))) return true;
	return false;
}

function extractPathArgs(command: string): string[] {
	const normalized = normalizeCommand(command);
	const words = shellWords(normalized);
	const positional = words.slice(1).filter((arg) => arg !== "--" && !arg.startsWith("-") && !/^(https?:|git@|ssh:)/i.test(arg));
	if (MUTATION_COMMAND_PATTERN.test(normalized)) return positional;
	return positional.filter(isLikelyPathArg);
}

function resolveCommandPath(arg: string, cwd: string): string {
	const withoutQuotes = arg.replace(/^[']|[']$/g, "").replace(/^[\"]|[\"]$/g, "");
	const expanded = withoutQuotes === "~" || withoutQuotes.startsWith("~/")
		? path.join(process.env.HOME ?? "", withoutQuotes.slice(1))
		: withoutQuotes;
	return path.resolve(cwd, expanded);
}

function isInside(parent: string, child: string): boolean {
	const rel = path.relative(parent, child);
	return rel === "" || (!!rel && !rel.startsWith("..") && !path.isAbsolute(rel));
}

function isInTmp(filePath: string): boolean {
	return isInside(path.resolve("/tmp"), filePath) || isInside(path.resolve("/private/tmp"), filePath);
}

function sensitivePathReason(filePath: string, cwd: string): string | null {
	const relToHome = process.env.HOME ? path.relative(process.env.HOME, filePath) : "";
	const relToCwd = path.relative(cwd, filePath);
	const candidates = [relToHome, relToCwd, filePath].map((p) => p.split(path.sep).join("/"));
	const base = path.basename(filePath);
	const ext = path.extname(filePath);

	if (SENSITIVE_BASENAMES.has(base) || SENSITIVE_EXTENSIONS.has(ext)) return `sensitive file ${base}`;
	for (const candidate of candidates) {
		for (const part of SENSITIVE_PATH_PARTS) {
			if (candidate === part || candidate.startsWith(`${part}/`) || candidate.includes(`/${part}/`)) {
				return `sensitive path ${part}`;
			}
		}
		if (/\b(secret|secrets|credential|credentials|token|tokens)\b/i.test(candidate)) return "path name suggests secrets or credentials";
	}
	return null;
}

function isGitTracked(cwd: string, filePath: string): boolean {
	const rel = path.relative(cwd, filePath);
	if (rel.startsWith("..") || path.isAbsolute(rel)) return false;
	try {
		execFileSync("git", ["-C", cwd, "ls-files", "--error-unmatch", "--", rel], { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}

function isFreelyMutablePath(cwd: string, filePath: string): boolean {
	return isInTmp(filePath) || (isInside(cwd, filePath) && !isGitTracked(cwd, filePath));
}

export function evaluateCommandPolicy(command: string, cwd: string): PolicyDecision {
	const normalized = normalizeCommand(command);

	for (const { pattern, label } of CLOUD_MUTATION_PATTERNS) {
		if (pattern.test(normalized)) return { action: "review", reason: label };
	}
	for (const { pattern, label } of SENSITIVE_COMMAND_PATTERNS) {
		if (pattern.test(normalized)) return { action: "review", reason: label };
	}

	const pathArgs = extractPathArgs(normalized);
	const resolvedPaths = pathArgs.map((arg) => resolveCommandPath(arg, cwd));

	for (const filePath of resolvedPaths) {
		const reason = sensitivePathReason(filePath, cwd);
		if (reason) return { action: "review", reason };
		if (!isInside(cwd, filePath) && !isInTmp(filePath)) {
			return { action: "review", reason: `path outside current working directory: ${filePath}` };
		}
	}

	if (MUTATION_COMMAND_PATTERN.test(normalized) && resolvedPaths.length > 0) {
		if (resolvedPaths.every((filePath) => isFreelyMutablePath(cwd, filePath))) {
			return { action: "allow", reason: "mutation is limited to /tmp or files not tracked by git" };
		}
	}

	return { action: "none" };
}
