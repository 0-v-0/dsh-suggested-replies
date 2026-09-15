import { randomUUID } from "node:crypto";
import z from "@deepseek-ai/schemastery";
import { SessionId } from "@deepseek-ai/dsh-session";
import { z as z$1 } from "zod";
import { defineDomain, domainTable } from "@deepseek-ai/dsh-storage-domain";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { PERSONA_SECTION } from "@deepseek-ai/dsh-system-prompt";
//#region src/generation-gate.ts
/**
* Ensures at most one candidate-generation request can commit per session.
* Starting a later request, receiving new user input, timing out, or disposing
* the plugin invalidates the prior lease before it can commit stale sidecar state.
*/
var GenerationGate = class {
	active = /* @__PURE__ */ new Map();
	revisions = /* @__PURE__ */ new Map();
	/**
	* Start the current generation for a session, cancelling an older one first.
	* @param key - stable session-local identity.
	* @param timeoutMs - maximum time the auxiliary model call may remain active.
	* @returns the lease whose holder may commit if it remains current.
	*/
	start(key, timeoutMs) {
		this.cancel(key);
		const revision = (this.revisions.get(key) ?? 0) + 1;
		this.revisions.set(key, revision);
		const controller = new AbortController();
		const timeout = setTimeout(() => {
			controller.abort(/* @__PURE__ */ new Error("suggested replies generation timed out"));
		}, timeoutMs);
		const active = {
			key,
			revision,
			signal: controller.signal,
			controller,
			timeout
		};
		this.active.set(key, active);
		return active;
	}
	/**
	* Test whether a lease is still the current, non-aborted generation.
	* @param lease - a lease returned by {@link start}.
	* @returns whether the lease may commit its generation state.
	*/
	isCurrent(lease) {
		return this.active.get(lease.key)?.revision === lease.revision && !lease.signal.aborted;
	}
	/**
	* Test whether a lease still owns the current map entry, even when its own
	* timeout signal has fired. Callers use this to replace a loading state with
	* cleared state after a timeout without allowing explicitly cancelled work to commit.
	* @param lease - a lease returned by {@link start}.
	* @returns whether no newer request or explicit invalidation replaced it.
	*/
	owns(lease) {
		return this.active.get(lease.key)?.revision === lease.revision;
	}
	/**
	* Release a completed current lease. A stale lease cannot release a newer one.
	* @param lease - the finished generation lease.
	* @returns whether this lease owned the active generation.
	*/
	release(lease) {
		if (!this.owns(lease)) return false;
		const active = this.active.get(lease.key);
		if (active === void 0) return false;
		clearTimeout(active.timeout);
		this.active.delete(lease.key);
		return true;
	}
	/**
	* Invalidate a session's active generation.
	* @param key - stable session-local identity.
	* @returns whether a generation was cancelled.
	*/
	cancel(key) {
		const active = this.active.get(key);
		if (active === void 0) return false;
		clearTimeout(active.timeout);
		this.active.delete(key);
		active.controller.abort(/* @__PURE__ */ new Error("suggested replies generation invalidated"));
		return true;
	}
	/**
	* Invalidate every active generation during settings changes or teardown.
	* @returns affected session keys.
	*/
	cancelAll() {
		const keys = [...this.active.keys()];
		for (const key of keys) this.cancel(key);
		return keys;
	}
	/** Abort all active requests and clear retained session state. */
	dispose() {
		this.cancelAll();
		this.revisions.clear();
	}
};
//#endregion
//#region src/rpc.ts
/** Dedicated channel for this plugin's Web endpoints. */
const CHANNEL = "/suggested-replies";
function ok(value) {
	return {
		ok: true,
		value
	};
}
function fail(message) {
	return {
		ok: false,
		error: {
			code: "internal",
			message,
			details: {}
		}
	};
}
/** Register settings and cancellable sidecar-state endpoints. */
function registerSuggestedRepliesRpc(ctx, store, getEnabled, setEnabled, getConfig, setConfig, generateFn, dismissFn) {
	ctx.connection.rpc.handle(CHANNEL, async (endpoint, payload, signal) => {
		switch (endpoint) {
			case "settings.get": return ok({ enabled: getEnabled() });
			case "settings.set":
				if (!isSettingsSetPayload(payload)) return fail("payload must be { enabled: boolean }");
				try {
					await setEnabled(payload.enabled);
					return ok({ enabled: getEnabled() });
				} catch (error) {
					return fail(error instanceof Error ? error.message : String(error));
				}
			case "state.get":
				if (!isStateGetPayload(payload)) return fail("payload must be { sessionId: string }");
				try {
					return ok(await store.get(SessionId(payload.sessionId), signal));
				} catch (error) {
					return fail(error instanceof Error ? error.message : String(error));
				}
			case "state.watch":
				if (!isStateWatchPayload(payload)) return fail("payload must be { sessionId: string, lifecycle: { createdAt, cwd? }, revision: non-negative safe integer }");
				try {
					return ok(await store.watch(SessionId(payload.sessionId), payload.lifecycle, payload.revision, signal));
				} catch (error) {
					if (signal.aborted) throw error;
					return fail(error instanceof Error ? error.message : String(error));
				}
			case "suggestions.generate":
				if (!isGeneratePayload(payload)) return fail("payload must be { sessionId: string, turn?: number }");
				try {
					await generateFn(payload.sessionId, payload.turn);
					return ok({ ok: true });
				} catch (error) {
					return fail(error instanceof Error ? error.message : String(error));
				}
			case "suggestions.dismiss":
				if (!isDismissPayload(payload)) return fail("payload must be { sessionId: string }");
				try {
					await dismissFn(payload.sessionId);
					return ok({ ok: true });
				} catch (error) {
					return fail(error instanceof Error ? error.message : String(error));
				}
			case "config.get": return ok(getConfig());
			case "config.set":
				if (!isRecord(payload)) return fail("payload must be a config object");
				try {
					return ok(await setConfig(payload));
				} catch (error) {
					return fail(error instanceof Error ? error.message : String(error));
				}
			default: return fail(`unknown endpoint: ${endpoint}`);
		}
	}, { authority: "trusted-host" });
}
function isRecord(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
function isSettingsSetPayload(value) {
	return isRecord(value) && typeof value.enabled === "boolean";
}
function isStateGetPayload(value) {
	return isRecord(value) && typeof value.sessionId === "string" && value.sessionId.length > 0;
}
function isStateWatchPayload(value) {
	return isRecord(value) && typeof value.sessionId === "string" && value.sessionId.length > 0 && isSessionIdentity(value.lifecycle) && typeof value.revision === "number" && Number.isSafeInteger(value.revision) && value.revision >= 0;
}
function isSessionIdentity(value) {
	if (!isRecord(value) || typeof value.createdAt !== "number" || !Number.isSafeInteger(value.createdAt) || value.createdAt < 0) return false;
	return value.cwd === void 0 || typeof value.cwd === "string";
}
function isGeneratePayload(value) {
	if (!isRecord(value) || typeof value.sessionId !== "string" || value.sessionId.length === 0) return false;
	return value.turn === void 0 || typeof value.turn === "number" && Number.isSafeInteger(value.turn) && value.turn >= 0;
}
function isDismissPayload(value) {
	return isRecord(value) && typeof value.sessionId === "string" && value.sessionId.length > 0;
}
//#endregion
//#region src/state.ts
/** Durable per-Session sidecar state for the suggested-replies Web surface. */
const nonNegativeSafeInteger = z$1.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
/** Session header fields that fence one sidecar row to one log lifecycle. */
const suggestedRepliesSessionIdentitySchema = z$1.object({
	createdAt: nonNegativeSafeInteger,
	cwd: z$1.string().optional()
});
/** Runtime schema for one durable suggested-replies row. */
const suggestedRepliesRowSchema = z$1.object({
	session: suggestedRepliesSessionIdentitySchema,
	revision: nonNegativeSafeInteger,
	turn: nonNegativeSafeInteger,
	phase: z$1.union([
		z$1.literal("generating"),
		z$1.literal("ready"),
		z$1.literal("cleared")
	]),
	suggestions: z$1.array(z$1.string()),
	generationSessionId: z$1.string().min(1).optional()
}).superRefine((row, ctx) => {
	if (row.phase === "generating" && row.generationSessionId === void 0) ctx.addIssue({
		code: "custom",
		path: ["generationSessionId"],
		message: "generating suggested-replies state requires generationSessionId"
	});
	if (row.phase !== "generating" && row.generationSessionId !== void 0) ctx.addIssue({
		code: "custom",
		path: ["generationSessionId"],
		message: "only generating suggested-replies state may retain generationSessionId"
	});
	if (row.phase !== "ready" && row.suggestions.length !== 0) ctx.addIssue({
		code: "custom",
		path: ["suggestions"],
		message: "only ready suggested-replies state may retain suggestions"
	});
});
/** Plugin-owned state domain; parent Session logs contain no plugin event types. */
const suggestedRepliesStateDomainSpec = defineDomain({
	name: "suggested_replies_state",
	version: 0,
	tables: { sessions: domainTable(suggestedRepliesRowSchema) }
});
function identityOf(header) {
	return Object.freeze({
		createdAt: header.createdAt,
		...header.cwd === void 0 ? {} : { cwd: header.cwd }
	});
}
function sameIdentity(row, header) {
	return row.session.createdAt === header.createdAt && row.session.cwd === header.cwd;
}
function rowSnapshot(row) {
	const suggestions = Object.freeze([...row.suggestions]);
	return Object.freeze({
		...row,
		session: Object.freeze({ ...row.session }),
		suggestions
	});
}
function responseOf(header, row) {
	const lifecycle = identityOf(header);
	if (row === void 0) return Object.freeze({
		lifecycle,
		revision: 0,
		turn: null,
		phase: "cleared",
		suggestions: Object.freeze([])
	});
	return Object.freeze({
		lifecycle,
		revision: row.revision,
		turn: row.turn,
		phase: row.phase,
		suggestions: Object.freeze([...row.suggestions])
	});
}
function abortReason(signal) {
	return signal.reason instanceof Error ? signal.reason : /* @__PURE__ */ new Error("suggested-replies request aborted");
}
function sameLifecycle(left, right) {
	return left.createdAt === right.createdAt && left.cwd === right.cwd;
}
function sameCursor(state, lifecycle, revision) {
	return sameLifecycle(state.lifecycle, lifecycle) && state.revision === revision;
}
/** Owns the storage-domain handle, serialized row mutations, and RPC waiters. */
var SuggestedRepliesStateStore = class SuggestedRepliesStateStore {
	ctx;
	table;
	domain;
	operationTails = /* @__PURE__ */ new Map();
	waiters = /* @__PURE__ */ new Map();
	lifecycle = new AbortController();
	closing = false;
	closeTask;
	/**
	* Open the plugin domain through the official storage-domain facility.
	* Falls back to an in-memory no-op store when the storage backend is
	* unavailable, so the plugin never crashes the host profile.
	*/
	static async open(ctx) {
		try {
			const storageDomain = ctx.get("storageDomain");
			if (storageDomain === void 0) {
				ctx.logger.warn("dsh-suggested-replies: storageDomain service not available, running in-memory only");
				const noopStore = SuggestedRepliesStateStore.inMemory(ctx);
				ctx.effect(() => () => noopStore.close(), "dsh-suggested-replies: sidecar lifecycle (in-memory)");
				return noopStore;
			}
			const domain = await storageDomain.open(suggestedRepliesStateDomainSpec);
			const store = new SuggestedRepliesStateStore(ctx, domain.table("sessions"), domain);
			ctx.effect(() => () => store.close(), "dsh-suggested-replies: sidecar lifecycle");
			await store.clearInterruptedGenerations();
			return store;
		} catch (error) {
			ctx.logger.warn(`dsh-suggested-replies: storage domain unavailable, running in-memory only: ${String(error)}`);
			const noopStore = SuggestedRepliesStateStore.inMemory(ctx);
			ctx.effect(() => () => noopStore.close(), "dsh-suggested-replies: sidecar lifecycle (in-memory)");
			return noopStore;
		}
	}
	/** Build an in-memory store with no persistence, used when storage is unavailable. */
	static inMemory(ctx) {
		const rows = /* @__PURE__ */ new Map();
		return new SuggestedRepliesStateStore(ctx, {
			get: (id) => rows.get(id),
			put: async (id, row) => {
				rows.set(id, row);
			},
			delete: async (id) => {
				rows.delete(id);
			},
			entries: () => rows.entries()
		}, { close: async () => void 0 });
	}
	/** Construct around one owned table; public for focused storage tests. */
	constructor(ctx, table, domain) {
		this.ctx = ctx;
		this.table = table;
		this.domain = domain;
	}
	/** Read state only when the sidecar identity matches the addressed Session. */
	async get(sessionId, signal) {
		signal?.throwIfAborted();
		const header = await this.inspectHeader(sessionId, signal);
		signal?.throwIfAborted();
		const row = this.table.get(sessionId);
		return responseOf(header, row !== void 0 && sameIdentity(row, header) ? row : void 0);
	}
	/** Wait until the Session state revision differs, or until the request is aborted. */
	async watch(sessionId, observedLifecycle, observedRevision, signal) {
		const combined = AbortSignal.any([signal, this.lifecycle.signal]);
		while (true) {
			const before = await this.get(sessionId, combined);
			if (!sameCursor(before, observedLifecycle, observedRevision)) return before;
			await new Promise((resolve, reject) => {
				let settled = false;
				const listeners = this.waiters.get(sessionId) ?? /* @__PURE__ */ new Set();
				this.waiters.set(sessionId, listeners);
				const cleanup = () => {
					listeners.delete(onChanged);
					if (listeners.size === 0) this.waiters.delete(sessionId);
					combined.removeEventListener("abort", onAbort);
				};
				const finish = (error) => {
					if (settled) return;
					settled = true;
					cleanup();
					if (error === void 0) resolve();
					else reject(error);
				};
				const onChanged = () => {
					finish();
				};
				const onAbort = () => {
					finish(abortReason(combined));
				};
				listeners.add(onChanged);
				combined.addEventListener("abort", onAbort, { once: true });
				if (combined.aborted) {
					onAbort();
					return;
				}
				this.get(sessionId, combined).then((after) => {
					if (!sameCursor(after, observedLifecycle, observedRevision)) finish();
				}, (error) => {
					finish(error instanceof Error ? error : new Error(String(error)));
				});
			});
		}
	}
	/** Publish loading state after the parent turn is durably checkpointed. */
	async setGenerating(session, turn, generationSessionId, isCurrent) {
		await this.ensureSessionDurable(session);
		return await this.enqueue(session.id, async () => {
			if (!isCurrent()) return false;
			const current = this.currentRow(session.header);
			await this.put(session.id, rowSnapshot({
				session: identityOf(session.header),
				revision: (current?.revision ?? 0) + 1,
				turn,
				phase: "generating",
				suggestions: [],
				generationSessionId
			}));
			return true;
		});
	}
	/** Commit candidates only over the exact generation row that produced them. */
	async setReady(session, turn, generationSessionId, suggestions, isCurrent) {
		return await this.enqueue(session.id, async () => {
			if (!isCurrent()) return false;
			const current = this.currentRow(session.header);
			if (current?.phase !== "generating" || current.turn !== turn || current.generationSessionId !== generationSessionId) return false;
			await this.put(session.id, rowSnapshot({
				session: identityOf(session.header),
				revision: current.revision + 1,
				turn,
				phase: "ready",
				suggestions: [...suggestions]
			}));
			return true;
		});
	}
	/** Clear one current row, optionally checkpointing a new parent Session fact first. */
	async clear(session, flushSession) {
		if (flushSession) await this.ensureSessionDurable(session);
		return await this.enqueue(session.id, async () => {
			const current = this.currentRow(session.header);
			if (current === void 0 || current.phase === "cleared") return false;
			await this.put(session.id, rowSnapshot({
				session: identityOf(session.header),
				revision: current.revision + 1,
				turn: current.turn,
				phase: "cleared",
				suggestions: []
			}));
			return true;
		});
	}
	/** Clear only if no newer generation has replaced the expected row. */
	async clearGeneration(session, generationSessionId) {
		return await this.enqueue(session.id, async () => {
			const current = this.currentRow(session.header);
			if (current?.phase !== "generating" || current.generationSessionId !== generationSessionId) return false;
			await this.put(session.id, rowSnapshot({
				session: identityOf(session.header),
				revision: current.revision + 1,
				turn: current.turn,
				phase: "cleared",
				suggestions: []
			}));
			return true;
		});
	}
	/** Clear every stored non-cleared row after a global disable or plugin unload. */
	async clearAll() {
		const rows = [...this.table.entries()];
		await Promise.all(rows.map(([sessionId]) => this.enqueue(sessionId, async () => {
			const current = this.table.get(sessionId);
			if (current === void 0 || current.phase === "cleared") return;
			await this.put(sessionId, rowSnapshot({
				session: current.session,
				revision: current.revision + 1,
				turn: current.turn,
				phase: "cleared",
				suggestions: []
			}));
		})));
	}
	/** Replace crash-orphaned loading rows before the RPC surface becomes available. */
	async clearInterruptedGenerations() {
		const rows = [...this.table.entries()];
		await Promise.all(rows.map(([sessionId]) => this.enqueue(sessionId, async () => {
			const current = this.table.get(sessionId);
			if (current?.phase !== "generating") return;
			await this.put(sessionId, rowSnapshot({
				session: current.session,
				revision: current.revision + 1,
				turn: current.turn,
				phase: "cleared",
				suggestions: []
			}));
		})));
	}
	/** Reject new operations, wake long polls, drain writes, and release the domain. */
	async close() {
		this.closeTask ??= (async () => {
			this.closing = true;
			this.lifecycle.abort(/* @__PURE__ */ new Error("suggested-replies state store disposed"));
			await Promise.all(this.operationTails.values());
			await this.domain.close();
		})();
		return await this.closeTask;
	}
	currentRow(header) {
		const row = this.table.get(header.id);
		return row !== void 0 && sameIdentity(row, header) ? row : void 0;
	}
	async inspectHeader(sessionId, signal) {
		const live = this.ctx.sessions.get(sessionId);
		if (live !== void 0) return live.header;
		return (await this.ctx.sessionPersistence.inspect(sessionId, signal)).meta;
	}
	async ensureSessionDurable(session) {
		if (!await this.ctx.sessions.flush(session)) throw new Error(`dsh-suggested-replies: no durability listener participated for Session '${session.id}'`);
	}
	async put(sessionId, row) {
		await this.table.put(sessionId, row);
		for (const resolve of [...this.waiters.get(sessionId) ?? []]) resolve();
	}
	enqueue(sessionId, operation) {
		if (this.closing) return Promise.reject(/* @__PURE__ */ new Error("dsh-suggested-replies: state store is disposing"));
		const result = (this.operationTails.get(sessionId) ?? Promise.resolve()).then(operation);
		const tail = result.then(() => void 0, () => void 0);
		this.operationTails.set(sessionId, tail);
		return result.finally(() => {
			if (this.operationTails.get(sessionId) === tail) this.operationTails.delete(sessionId);
		});
	}
};
//#endregion
//#region src/suggestion-prompt.ts
/**
* Build the system instruction for one auxiliary next-message prediction call.
* @param limits - resolved output cardinality and per-candidate text bound.
* @returns the complete model instruction.
*/
function buildSuggestionSystemPrompt(limits) {
	return [
		"You predict the next message a user is likely to send after an AI reply.",
		`Return exactly ${String(limits.suggestionCount)} candidate messages.`,
		"Follow the language used in the recent conversation, preferably its latest user and assistant messages.",
		"Every candidate must be a natural message the user can send directly, with no prefix, quote, explanation, or numbering.",
		"Keep candidates specific, concise, and meaningfully different. Prefer a practical next action, a verification or follow-up question, or a decision or choice when the conversation supports it.",
		`Keep every candidate at most ${String(limits.maxSuggestionChars)} characters.`,
		"Do not invent completed work, decisions, files, results, or facts that are not supported by the conversation.",
		`Return only valid JSON in this exact form: {"suggestions":[${Array.from({ length: limits.suggestionCount }, () => "\"...\"").join(",")}]}.`
	].join("\n");
}
/**
* Build the conversation prompt supplied beside the system instruction.
*
* Candidate prediction is useful only after a visible assistant answer. A
* context containing no assistant text therefore returns `null` rather than
* spending an auxiliary model call on an unfinished or tool-only turn.
* @param messages - recent model-visible conversation messages, oldest first.
* @returns serialized conversation context, or `null` when no assistant text is available.
*/
function buildSuggestedRepliesUserPrompt(messages) {
	const lines = [];
	let hasAssistantText = false;
	let lastTextRole;
	for (const message of messages) {
		const text = extractPlainText(message);
		if (text === "") continue;
		if (message.role === "assistant") hasAssistantText = true;
		lastTextRole = message.role;
		lines.push(`${message.role === "assistant" ? "Assistant" : "User"}: ${text}`);
	}
	if (!hasAssistantText || lastTextRole !== "assistant") return null;
	return [
		"Recent conversation:",
		...lines,
		"",
		"Predict the user's next message."
	].join("\n");
}
/**
* Parse one model response into the configured number of candidate messages.
* A single outer Markdown code fence is accepted defensively, but every other
* non-JSON response is rejected.
* @param raw - model text accumulated from the stream.
* @param limits - resolved output cardinality and per-candidate text bound.
* @returns ready candidates, or `null` when the response does not meet the format.
*/
function parseSuggestedReplies(raw, limits) {
	const stripped = stripCodeFence(raw.trim());
	if (stripped === "") return null;
	let parsed;
	try {
		parsed = JSON.parse(stripped);
	} catch {
		return null;
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
	const suggestions = parsed.suggestions;
	if (!Array.isArray(suggestions) || suggestions.length !== limits.suggestionCount) return null;
	const output = [];
	const seen = /* @__PURE__ */ new Set();
	for (const suggestion of suggestions) {
		if (typeof suggestion !== "string") return null;
		const normalized = normalizeCandidate(suggestion);
		if (normalized === "") return null;
		const bounded = normalized.slice(0, limits.maxSuggestionChars).trim();
		if (bounded === "") return null;
		const identity = bounded.toLowerCase();
		if (seen.has(identity)) return null;
		seen.add(identity);
		output.push(bounded);
	}
	return output;
}
/**
* Produce a bounded deterministic fallback when the auxiliary model does not
* return the required JSON. The fallback follows the recent conversation's
* language and preserves the configured candidate count.
*/
function fallbackSuggestedReplies(conversation, limits) {
	return (/[\u3400-\u9fff]/u.test(conversation) ? [
		"继续",
		"请详细说明一下",
		"给我一个具体例子",
		"接下来建议做什么？"
	] : [
		"Continue",
		"Could you explain that in more detail?",
		"Can you give me a concrete example?",
		"What should I do next?"
	]).slice(0, limits.suggestionCount).map((candidate) => normalizeCandidate(candidate).slice(0, limits.maxSuggestionChars).trim());
}
/** Flatten text blocks only; tool calls, tool results, images, and reasoning stay out of the prompt. */
function extractPlainText(message) {
	const parts = [];
	for (const block of message.content) if (block.type === "text") parts.push(block.text);
	return normalizeCandidate(parts.join("\n"));
}
/** Normalize whitespace so candidates fit a single compact bubble without changing their words. */
function normalizeCandidate(text) {
	return text.replace(/\s+/g, " ").trim();
}
/** Remove one outer Markdown fence that a model supplied despite the JSON-only instruction. */
function stripCodeFence(text) {
	return /^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/i.exec(text)?.[1] ?? text;
}
//#endregion
//#region src/sanitize.ts
/**
* Common credential shapes masked before the transcript reaches the model.
* Patterns are applied sequentially so a later pattern sees the output of an
* earlier one.
*/
const SECRET_PATTERNS = [
	{
		pattern: /\bAKIA[0-9A-Z]{16,}\b/g,
		label: "<aws_access_key>"
	},
	{
		pattern: /\bsk-[a-zA-Z0-9]{20,}\b/g,
		label: "<openai_api_key>"
	},
	{
		pattern: /\bgh[opsu]_[a-zA-Z0-9]{36,}\b/g,
		label: "<github_token>"
	},
	{
		pattern: /\bxox[bpoa]-[a-zA-Z0-9-]+\b/g,
		label: "<slack_token>"
	},
	{
		pattern: /\beyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g,
		label: "<jwt_token>"
	},
	{
		pattern: /\brk_[a-zA-Z0-9]+\b/g,
		label: "<api_key>"
	},
	{
		pattern: /\b[Bb]earer\s+[a-zA-Z0-9_\-\.]+/g,
		label: "Bearer [REDACTED_SECRET]"
	}
];
/**
* Mask secret-shaped substrings so the auxiliary model never receives them.
* Uses a single function that applies all redactions sequentially.
* @param text - transcript text that may contain credentials.
* @returns the same text with every matched secret replaced by a label.
*/
function redactSecrets(text) {
	let out = text;
	for (const { pattern, label } of SECRET_PATTERNS) {
		pattern.lastIndex = 0;
		out = out.replace(pattern, label);
	}
	return out;
}
/** CSI escape sequences: `ESC[` followed by parameters and a final byte. */
const CSI_ESCAPE = /\x1B\[[0-9;]*[a-zA-Z]/g;
/** OSC escape sequences: `ESC]` ... terminated by BEL (0x07). */
const OSC_ESCAPE = /\x1B\][^\x07]*\x07/g;
/** Character set designation: `ESC(` followed by one of AB012. */
const CHARSET_ESCAPE = /\x1B[()][AB012]/g;
/** C0 controls (0x00-0x1F) except tab/newline/CR; C1 controls (0x7F-0x9F). */
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g;
/** Bidi override marks: U+202A–U+202E and U+2066–U+2069. */
const BIDI_OVERRIDES = /[\u202A-\u202E\u2066-\u2069]/g;
/** Lone surrogate code units (unpaired high or low surrogates). */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
/** Triple-backtick code fence surrounding the whole text. */
const BACKTICK_FENCE = /^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/;
/** Triple-tilde code fence surrounding the whole text. */
const TILDE_FENCE = /^~~~\s*\n([\s\S]*?)\n~~~\s*$/;
/** Surrounding paired quotes: straight double, straight single, CJK corner, curly double. */
const PAIRED_QUOTES = [
	/^"([\s\S]*)"$/,
	/^'([\s\S]*)'$/,
	/^\u300C([\s\S]*)\u300D$/,
	/^\u201C([\s\S]*)\u201D$/
];
/**
* Structurally clean one raw model output candidate into composer-safe text.
*
* Each cleaning step is individually controlled by the options so callers can
* tune the pipeline. The result is trimmed but not truncated; the caller is
* responsible for applying `maxSuggestionChars` after filtering.
* @param text - raw model output.
* @param options - per-step cleaning toggles.
* @returns the cleaned text.
*/
function cleanSuggestion(text, options) {
	let value = text;
	if (options.stripEscapes) value = value.replace(CSI_ESCAPE, "").replace(OSC_ESCAPE, "").replace(CHARSET_ESCAPE, "");
	if (options.stripControls) value = value.replace(CONTROL_CHARS, "").replace(BIDI_OVERRIDES, "").replace(LONE_SURROGATE, "");
	if (options.stripFencesAndQuotes) {
		value = value.trim();
		const backtick = BACKTICK_FENCE.exec(value);
		if (backtick !== null && backtick[1] !== void 0) value = backtick[1];
		const tilde = TILDE_FENCE.exec(value);
		if (tilde !== null && tilde[1] !== void 0) value = tilde[1];
		value = value.trim();
		for (const quote of PAIRED_QUOTES) {
			const match = quote.exec(value);
			if (match !== null && match[1] !== void 0) {
				value = match[1];
				break;
			}
		}
	}
	if (options.collapseWhitespace) value = value.replace(/\s+/g, " ");
	if (options.singleLine) value = value.replace(/\n/g, " ");
	return value.trim();
}
/** Meta-text the model might emit instead of a suggestion ("no suggestion", "stay silent"). */
const META_TEXT_PATTERNS = [
	/no suggestion/i,
	/stay silent/i,
	/无建议/,
	/没有建议/,
	/^\s*none\s*$/i,
	/^\s*n\/a\s*$/i
];
/** Error echo patterns the model might pass through. */
const ERROR_ECHO_PATTERNS = [
	/^api error:/i,
	/^error:/i,
	/错误:/,
	/请求失败/
];
/** Evaluative filler the model should never offer as a next prompt. */
const EVALUATIVE_PATTERN = /\b(thanks|thank you|looks good|great|perfect)\b|谢谢|不错|很好|完美|好的/i;
/** Assistant-voice phrasing: the suggestion must read as the USER typing. */
const ASSISTANT_VOICE_PATTERN = /^(let me|i'll|i will|i can|我来|我会|我可以|让我)/i;
/** Residual formatting: newlines or markdown emphasis asterisks. */
const FORMATTING_PATTERN = /[\n*]/;
/** Single-word commands that are valid next prompts when allowSingleCommands is true. */
const ALLOWED_SINGLE_COMMANDS = /* @__PURE__ */ new Set([
	"yes",
	"ok",
	"no",
	"sure",
	"继续",
	"提交",
	"取消",
	"好",
	"是",
	"否"
]);
/**
* Report whether `text` contains a CJK unified ideograph.
* @param text - inspected text.
* @returns true when any code point falls in the CJK unified ideographs range.
*/
function hasCJK(text) {
	return /[\u4e00-\u9fff]/u.test(text);
}
/**
* Compute the UTF-8 byte length of a string.
* @param text - the string to measure.
* @returns the number of UTF-8 bytes.
*/
function byteLength(text) {
	return Buffer.byteLength(text, "utf8");
}
/**
* Reject cleaned model output that is not a usable next prompt.
*
* Returns `true` when the candidate should be dropped silently (not displayed).
* When `allowSingleCommands` is true and the text matches a known single-word
* command or starts with `/`, it is allowed regardless of other checks.
* @param text - cleaned, single-line model output.
* @param options - per-check filter toggles.
* @returns true when the suggestion should be filtered out.
*/
function shouldFilterSuggestion(text, options) {
	const value = text.trim();
	if (value === "") return true;
	const lower = value.toLowerCase();
	if (options.allowSingleCommands) {
		if (lower.startsWith("/")) return false;
		if (ALLOWED_SINGLE_COMMANDS.has(lower)) return false;
	}
	if (options.filterMetaText) {
		for (const pattern of META_TEXT_PATTERNS) if (pattern.test(value)) return true;
	}
	if (options.filterErrorEcho) {
		for (const pattern of ERROR_ECHO_PATTERNS) if (pattern.test(value)) return true;
	}
	if (options.filterEvaluative) {
		if (EVALUATIVE_PATTERN.test(value)) return true;
	}
	if (options.filterAssistantVoice) {
		if (ASSISTANT_VOICE_PATTERN.test(value)) return true;
	}
	if (options.filterMultiSentence) {
		if ((value.match(/[.!?]\s+[A-Z]/g) ?? []).length >= 2) return true;
		if ((value.match(/。/g) ?? []).length >= 2) return true;
	}
	if (options.filterFormatting) {
		if (FORMATTING_PATTERN.test(value)) return true;
	}
	if (options.filterTooLong) {
		const wordCount = value.split(/\s+/).filter(Boolean).length;
		if (!hasCJK(value) && wordCount > 12) return true;
		if (byteLength(value) >= 100) return true;
	}
	return false;
}
//#endregion
//#region src/generate.ts
/** Build the clean options from a GeneratePipelineConfig. */
function deriveCleanOptions(config) {
	return {
		stripEscapes: config.stripEscapes,
		stripControls: config.stripControls,
		stripFencesAndQuotes: config.stripFencesAndQuotes,
		collapseWhitespace: config.collapseWhitespace,
		singleLine: config.singleLine,
		maxSuggestionChars: config.maxSuggestionChars
	};
}
/** Build the filter options from a GeneratePipelineConfig. */
function deriveFilterOptions(config) {
	return {
		filterMetaText: config.filterMetaText,
		filterErrorEcho: config.filterErrorEcho,
		filterEvaluative: config.filterEvaluative,
		filterAssistantVoice: config.filterAssistantVoice,
		filterMultiSentence: config.filterMultiSentence,
		filterTooLong: config.filterTooLong,
		allowSingleCommands: config.allowSingleCommands,
		filterFormatting: config.filterFormatting,
		maxSuggestionChars: config.maxSuggestionChars
	};
}
/**
* Sanitize the conversation transcript before sending to the model.
*
* Applies secret redaction (when enabled) and truncates the result to
* `maxTranscriptChars` so the framed prompt stays within the byte budget.
* @param text - raw transcript text.
* @param config - pipeline configuration supplying toggle and character budget.
* @returns the sanitized, truncated transcript.
*/
function sanitizeTranscript(text, config) {
	let result = text;
	if (config.redactSecrets) result = redactSecrets(result);
	if (result.length > config.maxTranscriptChars) result = result.slice(0, config.maxTranscriptChars);
	return result;
}
/**
* Clean and filter a single model output candidate.
* @param raw - raw model output string.
* @param config - pipeline configuration supplying clean and filter toggles.
* @returns the cleaned, truncated candidate, or `null` when filtered out.
*/
function processSuggestion(raw, config) {
	const cleaned = cleanSuggestion(raw, deriveCleanOptions(config));
	if (cleaned === "") return null;
	if (shouldFilterSuggestion(cleaned, deriveFilterOptions(config))) return null;
	return cleaned.slice(0, config.maxSuggestionChars).trim();
}
/**
* Process an array of raw candidates, cleaning and filtering each.
*
* Deduplicates by case-insensitive identity so the user never sees the same
* suggestion twice. Order from the model is preserved.
* @param raw - raw model output strings.
* @param config - pipeline configuration supplying clean and filter toggles.
* @returns the deduplicated, cleaned, and filtered candidates.
*/
function processSuggestions(raw, config) {
	const seen = /* @__PURE__ */ new Set();
	const output = [];
	for (const candidate of raw) {
		const processed = processSuggestion(candidate, config);
		if (processed === null) continue;
		const identity = processed.toLowerCase();
		if (seen.has(identity)) continue;
		seen.add(identity);
		output.push(processed);
	}
	return output;
}
//#endregion
//#region src/suggestion-llm.ts
/** Select the trailing model-visible conversation messages from a Session. */
function deriveRecentMessages(agent, contextMessageCount) {
	return agent.session.deriveMessages().filter((message) => message.role === "assistant" || message.source.kind === "user").slice(-contextMessageCount);
}
/** Resolve the latest logged route, falling back to the Agent creation route. */
function resolveSuggestionRoute(agent) {
	const logged = agent.session.requestHeader()?.config;
	if (logged !== void 0 && logged.provider.length > 0 && logged.model.length > 0) return {
		provider: logged.provider,
		model: logged.model
	};
	const { provider, model } = agent.options;
	return provider !== void 0 && provider.length > 0 && model !== void 0 && model.length > 0 ? {
		provider,
		model
	} : null;
}
/** Validate and normalize an optional explicit auxiliary route. */
function resolveConfiguredSuggestionRoute(provider, model) {
	if (provider === void 0 && model === void 0) return void 0;
	if (provider === void 0 || model === void 0 || provider.trim().length === 0 || model.trim().length === 0) throw new Error("dsh-suggested-replies: suggestionProvider and suggestionModel must be set together as a non-empty pair");
	return {
		provider,
		model
	};
}
/** Prepare one internal Agent request when the completed turn has usable text and routing. */
function prepareSuggestionRequest(agent, config, turn, signal) {
	if (signal.aborted || !turnHasAssistantText(agent, turn)) return null;
	const route = config.suggestionRoute ?? resolveSuggestionRoute(agent);
	if (route === null) return null;
	const rawPrompt = buildSuggestedRepliesUserPrompt(deriveRecentMessages(agent, config.contextMessageCount));
	if (rawPrompt === null) return null;
	const prompt = sanitizeTranscript(rawPrompt, config);
	return {
		route,
		system: buildSuggestionSystemPrompt(config),
		prompt,
		maxTokens: config.maxTokens,
		origin: "auto"
	};
}
function getSessionEvents(session) {
	if (typeof session.snapshotEvents === "function") return session.snapshotEvents();
	return session.events ?? [];
}
function turnHasAssistantText(agent, turn) {
	return getSessionEvents(agent.session).some((event) => event.type === "assistant/message" && event.data.turn === turn && event.data.message.content.some((block) => block.type === "text" && block.text.trim() !== ""));
}
/** Extract the last non-empty assistant text produced inside one owned run interval. */
function extractSuggestionText(events, firstSeq) {
	let started = false;
	let text = "";
	for (const event of events) {
		if (event.seq < firstSeq) continue;
		if (event.type === "turn/start") {
			started = true;
			continue;
		}
		if (!started || event.type !== "assistant/message") continue;
		const joined = event.data.message.content.filter((block) => block.type === "text").map((block) => block.text).join("");
		if (joined !== "") text = joined;
	}
	return text === "" ? null : text;
}
function abortError(signal) {
	return signal.reason instanceof Error ? signal.reason : /* @__PURE__ */ new Error("suggested replies generation aborted");
}
/**
* Run the auxiliary request through an official Agent Session, archive it
* before model work starts, flush its log, then dispose the live handle.
*/
async function generateSuggestedReplies(ctx, parent, internalSessionId, request, config, signal) {
	signal.throwIfAborted();
	let handle;
	let output = null;
	let failure;
	let onAbort;
	try {
		handle = await ctx.agents.withoutInitiator(() => ctx.agents.create({
			sessionId: internalSessionId,
			...parent.session.header.cwd === void 0 ? {} : { meta: { cwd: parent.session.header.cwd } },
			agentOptions: {
				provider: request.route.provider,
				model: request.route.model,
				maxTokens: request.maxTokens,
				...config.reasoningEffort === "off" ? { reasoningEffort: "off" } : {}
			},
			signal,
			setup: (agentCtx) => {
				agentCtx.tools.presentAs("native");
				agentCtx.tools.restrict({ allow: [] });
				agentCtx.systemPrompt.section({
					name: PERSONA_SECTION,
					order: 0,
					text: request.system,
					complete: true
				});
			}
		}));
		const agent = handle.agent;
		try {
			await ctx.workspaceRegistry.archiveSession(internalSessionId);
		} catch (error) {
			throw new Error(`dsh-suggested-replies: could not archive internal Session '${internalSessionId}' before generation`, { cause: error });
		}
		onAbort = () => {
			agent.cancel({ kind: "parent" });
		};
		signal.addEventListener("abort", onAbort, { once: true });
		if (signal.aborted) onAbort();
		await agent.whenIdle();
		signal.throwIfAborted();
		const firstSeq = agent.session.seq;
		agent.followup(createUserMessage({
			content: [{
				type: "text",
				text: request.prompt
			}],
			source: {
				kind: "plugin",
				plugin: "dsh-suggested-replies"
			}
		}));
		await agent.whenIdle();
		if (signal.aborted) throw abortError(signal);
		output = extractSuggestionText(getSessionEvents(agent.session), firstSeq);
	} catch (error) {
		failure = error;
	}
	if (handle !== void 0) {
		if (onAbort !== void 0) signal.removeEventListener("abort", onAbort);
		try {
			await handle.agent.whenIdle();
			if (!await ctx.sessions.flush(handle.agent.session)) throw new Error(`dsh-suggested-replies: no durability listener flushed internal Session '${internalSessionId}'`);
		} catch (error) {
			failure ??= error;
		} finally {
			await handle.dispose();
		}
	}
	if (failure !== void 0) {
		if (signal.aborted) return null;
		throw failure;
	}
	if (output === null) return null;
	const processed = processSuggestions(parseSuggestedReplies(output, config) ?? fallbackSuggestedReplies(request.prompt, config), config);
	return processed.length > 0 ? processed : null;
}
//#endregion
//#region src/index.ts
/** Suggested replies host plugin with plugin-owned sidecar state. */
/** Cordis plugin identity. */
const name = "dsh-suggested-replies";
/** Required official extension points. */
const inject = [
	"agents",
	"connection",
	"sessionPersistence",
	"sessions",
	"systemPrompt",
	"tools",
	"workspaceRegistry"
];
/** User-settings namespace used by the master enable switch. */
const SETTINGS_NAMESPACE = "suggested-replies";
/** Config schema with deployment-adjustable generation limits. */
const Config = z.object({
	enabled: z.boolean().default(true).description("Enable next-message suggestions after completed turns."),
	suggestionCount: z.number().step(1).min(2).max(4).default(3).description("Number of candidate replies requested per completed turn."),
	contextMessageCount: z.number().step(1).min(2).max(6).default(4).description("Trailing visible conversation messages supplied as context."),
	maxSuggestionChars: z.number().step(1).min(32).max(300).default(160).description("Maximum characters retained for each candidate."),
	maxTokens: z.number().step(1).min(64).max(1024).default(384).description("Maximum output tokens for the auxiliary model call."),
	timeoutMs: z.number().step(1).min(1e3).max(3e4).default(15e3).description("Maximum milliseconds an auxiliary model call may run."),
	suggestionProvider: z.string().required(false).description("Optional explicit provider for auxiliary calls; omitted means inherit the current Session route."),
	suggestionModel: z.string().required(false).description("Optional explicit model for auxiliary calls; must be paired with suggestionProvider."),
	followSessionRoute: z.boolean().default(true).description("Follow the current Session route instead of an explicit provider/model."),
	reasoningEffort: z.union([z.const("off"), z.const("auto")]).default("off").description("Reasoning effort override: off disables thinking, auto follows model default."),
	maxInputBytes: z.number().step(1).min(256).max(32768).default(4096).description("Maximum UTF-8 bytes of the final framed user prompt."),
	maxRecentTurns: z.number().step(1).min(1).max(4).default(1).description("Number of recent completed turns retained in the transcript."),
	maxTranscriptChars: z.number().step(1).min(1e3).max(6e4).default(12e3).description("Character budget for the transcript sent to the auxiliary model."),
	maxContextTurns: z.number().step(1).min(1).max(10).default(3).description("Number of conversation turns retained as context."),
	maxContextContextBytes: z.number().step(1).min(1024).max(65536).default(16384).description("Byte budget for retained context turns JSON."),
	redactSecrets: z.boolean().default(true).description("Mask API keys and bearer tokens in transcripts before sending to the model."),
	stripEscapes: z.boolean().default(true).description("Strip ANSI/OSC/CSI escape sequences from transcripts."),
	stripControls: z.boolean().default(true).description("Strip C0/C1 control chars, bidi override marks, and lone surrogates."),
	stripFencesAndQuotes: z.boolean().default(true).description("Strip code fences and surrounding paired quotes from model output."),
	collapseWhitespace: z.boolean().default(true).description("Collapse whitespace and force single-line output."),
	singleLine: z.boolean().default(true).description("Force candidates to a single line with no embedded newlines."),
	filterMetaText: z.boolean().default(true).description("Filter meta-text like “no suggestion” or “stay silent”."),
	filterErrorEcho: z.boolean().default(true).description("Filter error echoes like “api error:” or “error:”."),
	filterEvaluative: z.boolean().default(true).description("Filter evaluative phrases like “thanks”, “looks good”."),
	filterAssistantVoice: z.boolean().default(true).description("Filter assistant-voice phrases like “Let me…”."),
	filterMultiSentence: z.boolean().default(true).description("Filter multi-sentence candidates."),
	filterTooLong: z.boolean().default(true).description("Filter candidates that are too long (>12 English words or ≥100 bytes)."),
	allowSingleCommands: z.boolean().default(true).description("Allow single-word whitelist entries and slash commands."),
	filterFormatting: z.boolean().default(true).description("Filter residual formatting (newlines, asterisks)."),
	manualShortcut: z.string().default("Mod+Shift+Space").description("Keyboard shortcut for manual trigger; disabled turns it off."),
	manualReplacesDraft: z.boolean().default(true).description("Whether manual trigger writes directly to the draft."),
	manualDedupe: z.boolean().default(true).description("Pass current candidates as negative examples when regenerating manually."),
	maxCycleSkipped: z.number().step(1).min(0).max(50).default(10).description("Maximum retained skipped candidates per cycle for dedup."),
	maxLocalOutcomes: z.number().step(1).min(0).max(200).default(50).description("Maximum interaction outcome records stored in browser localStorage."),
	recordMetrics: z.boolean().default(true).description("Retain recent performance/cost metrics in host memory."),
	excludeNonHumanEvents: z.boolean().default(true).description("Exclude non-human events from transcripts.")
});
/** Settings schema intentionally exposes only the user-facing master switch. */
const SettingsSchema = z.object({
	enabled: z.boolean().default(true).description("Enable suggested replies after completed turns."),
	reasoningEffort: z.union([z.const("off"), z.const("auto")]).default("off").description("Reasoning effort override."),
	suggestionCount: z.number().step(1).min(2).max(4).default(3).description("Number of candidate replies per turn."),
	redactSecrets: z.boolean().default(true).description("Mask API keys and tokens in transcripts."),
	stripControls: z.boolean().default(true).description("Strip control characters from output."),
	singleLine: z.boolean().default(true).description("Force single-line output."),
	filterMetaText: z.boolean().default(true).description("Filter meta-text."),
	filterEvaluative: z.boolean().default(true).description("Filter evaluative phrases."),
	filterAssistantVoice: z.boolean().default(true).description("Filter assistant-voice phrases."),
	filterTooLong: z.boolean().default(true).description("Filter overly long suggestions."),
	manualShortcut: z.string().default("Mod+Shift+Space").description("Keyboard shortcut for manual trigger."),
	manualReplacesDraft: z.boolean().default(true).description("Manual trigger writes directly to draft.")
});
/** Install durable state, internal Agent generation, cancellation, and Web RPC. */
async function apply(ctx, config) {
	const store = await SuggestedRepliesStateStore.open(ctx);
	const gate = new GenerationGate();
	const internalSessions = /* @__PURE__ */ new Set();
	const generationTasks = /* @__PURE__ */ new Set();
	let source = () => ({
		enabled: config.enabled,
		reasoningEffort: config.reasoningEffort,
		suggestionCount: config.suggestionCount,
		redactSecrets: config.redactSecrets,
		stripControls: config.stripControls,
		singleLine: config.singleLine,
		filterMetaText: config.filterMetaText,
		filterEvaluative: config.filterEvaluative,
		filterAssistantVoice: config.filterAssistantVoice,
		filterTooLong: config.filterTooLong,
		manualShortcut: config.manualShortcut,
		manualReplacesDraft: config.manualReplacesDraft
	});
	let enabledBeforeChange = source().enabled;
	let disposing = false;
	const cancelSession = (agent, flushSession) => {
		const key = String(agent.id);
		gate.cancel(key);
		store.clear(agent.session, flushSession).catch((error) => {
			if (!disposing) ctx.logger.warn(`dsh-suggested-replies: failed to clear Session ${key}: ${String(error)}`);
		});
	};
	const clearAll = async () => {
		gate.cancelAll();
		await store.clearAll();
	};
	const settingsService = ctx.get("settings");
	if (settingsService !== void 0) settingsService.installSection(ctx, SETTINGS_NAMESPACE, SettingsSchema, source(), {
		setSource: (next) => {
			source = next;
		},
		onChange: () => {
			const enabled = source().enabled;
			if (!enabled && enabledBeforeChange) clearAll().catch((error) => {
				if (!disposing) ctx.logger.warn(`dsh-suggested-replies: failed to clear sidecar state: ${String(error)}`);
			});
			enabledBeforeChange = enabled;
		}
	});
	const suggestionRoute = resolveConfiguredSuggestionRoute(config.suggestionProvider, config.suggestionModel);
	const getGenerationConfig = () => {
		const s = source();
		return {
			suggestionCount: s.suggestionCount,
			contextMessageCount: config.contextMessageCount,
			maxSuggestionChars: config.maxSuggestionChars,
			maxTokens: config.maxTokens,
			maxInputBytes: config.maxInputBytes,
			maxRecentTurns: config.maxRecentTurns,
			maxTranscriptChars: config.maxTranscriptChars,
			maxContextTurns: config.maxContextTurns,
			maxContextContextBytes: config.maxContextContextBytes,
			reasoningEffort: s.reasoningEffort,
			redactSecrets: s.redactSecrets,
			stripEscapes: config.stripEscapes,
			stripControls: s.stripControls,
			stripFencesAndQuotes: config.stripFencesAndQuotes,
			collapseWhitespace: config.collapseWhitespace,
			singleLine: s.singleLine,
			filterMetaText: s.filterMetaText,
			filterErrorEcho: config.filterErrorEcho,
			filterEvaluative: s.filterEvaluative,
			filterAssistantVoice: s.filterAssistantVoice,
			filterMultiSentence: config.filterMultiSentence,
			filterTooLong: s.filterTooLong,
			allowSingleCommands: config.allowSingleCommands,
			filterFormatting: config.filterFormatting,
			manualReplacesDraft: s.manualReplacesDraft,
			manualDedupe: config.manualDedupe,
			maxCycleSkipped: config.maxCycleSkipped,
			excludeNonHumanEvents: config.excludeNonHumanEvents,
			...suggestionRoute === void 0 ? {} : { suggestionRoute }
		};
	};
	const startGenerationForSession = (agent, turn, _origin) => {
		if (!source().enabled) return;
		if (agent.inbox.hasPending) return;
		const lease = gate.start(String(agent.id), config.timeoutMs);
		const request = prepareSuggestionRequest(agent, getGenerationConfig(), turn, lease.signal);
		if (request === null) {
			gate.release(lease);
			return;
		}
		const task = runGeneration(ctx, store, internalSessions, gate, lease, agent, turn, request, getGenerationConfig()).catch((error) => {
			if (!disposing) ctx.logger.warn(`dsh-suggested-replies: generation for Session ${String(agent.id)} failed: ${String(error)}`);
		});
		generationTasks.add(task);
		task.finally(() => {
			generationTasks.delete(task);
		});
	};
	ctx.on("session/event", (session, event) => {
		if (internalSessions.has(String(session.id))) return;
		if (event.type === "turn/start") {
			const agent = ctx.agents.get(session.id);
			if (agent?.session === session) cancelSession(agent, true);
			return;
		}
		if (event.type !== "turn/end") return;
		if (event.data.reason.kind !== "completed" && event.data.reason.kind !== "max-tokens") return;
		const agent = ctx.agents.get(session.id);
		if (agent?.session !== session) return;
		startGenerationForSession(agent, event.data.turn, "auto");
	});
	ctx.on("agent/inbox/inserted", ({ agent }) => {
		if (internalSessions.has(String(agent.id))) return;
		cancelSession(agent, true);
	});
	ctx.on("agent/disposed", ({ agent }) => {
		if (internalSessions.has(String(agent.id))) return;
		gate.cancel(String(agent.id));
	});
	const generateFn = async (sessionId, turn) => {
		const agent = ctx.agents.get(SessionId(sessionId));
		if (agent === void 0) return;
		const resolvedTurn = turn ?? lastCompletedTurn(agent);
		if (resolvedTurn === null) return;
		startGenerationForSession(agent, resolvedTurn, "manual");
	};
	const dismissFn = async (sessionId) => {
		const agent = ctx.agents.get(SessionId(sessionId));
		if (agent === void 0) return;
		cancelSession(agent, true);
	};
	registerSuggestedRepliesRpc(ctx, store, () => source().enabled, async (enabled) => {
		const settings = ctx.get("settings");
		if (settings === void 0) {
			source = () => ({ enabled });
			if (!enabled) await clearAll();
			enabledBeforeChange = enabled;
			return;
		}
		await settings.update(SETTINGS_NAMESPACE, { enabled });
		if (!enabled) await clearAll();
		enabledBeforeChange = source().enabled;
	}, () => {
		const s = source();
		return {
			enabled: s.enabled,
			reasoningEffort: s.reasoningEffort,
			suggestionCount: s.suggestionCount,
			redactSecrets: s.redactSecrets,
			stripControls: s.stripControls,
			singleLine: s.singleLine,
			filterMetaText: s.filterMetaText,
			filterEvaluative: s.filterEvaluative,
			filterAssistantVoice: s.filterAssistantVoice,
			filterTooLong: s.filterTooLong,
			manualShortcut: s.manualShortcut,
			manualReplacesDraft: s.manualReplacesDraft
		};
	}, async (patch) => {
		const settings = ctx.get("settings");
		if (settings === void 0) {
			const prev = source();
			source = () => ({
				...prev,
				...patch
			});
			return source();
		}
		const next = {
			...source(),
			...patch
		};
		await settings.update(SETTINGS_NAMESPACE, next);
		return source();
	}, generateFn, dismissFn);
	return async () => {
		disposing = true;
		gate.cancelAll();
		await Promise.all(generationTasks);
		await store.clearAll();
		internalSessions.clear();
		gate.dispose();
		await store.close();
	};
}
/** Run one freshness-owned internal Agent and commit only its current result. */
async function runGeneration(ctx, store, internalSessions, gate, lease, parent, turn, request, config) {
	const internalSessionId = SessionId(`session-${randomUUID()}`);
	internalSessions.add(String(internalSessionId));
	try {
		if (!await store.setGenerating(parent.session, turn, internalSessionId, () => gate.isCurrent(lease))) return;
		const suggestions = await generateSuggestedReplies(ctx, parent, internalSessionId, request, config, lease.signal);
		if (suggestions === null) {
			await store.clearGeneration(parent.session, internalSessionId);
			return;
		}
		await store.setReady(parent.session, turn, internalSessionId, suggestions, () => gate.isCurrent(lease));
	} catch (error) {
		await store.clearGeneration(parent.session, internalSessionId).catch(() => void 0);
		if (!lease.signal.aborted) throw error;
	} finally {
		internalSessions.delete(String(internalSessionId));
		gate.release(lease);
	}
}
/** Find the last turn that completed normally or hit the max-tokens limit. */
function lastCompletedTurn(agent) {
	const events = getSessionEvents(agent.session);
	for (let i = events.length - 1; i >= 0; i--) {
		const event = events[i];
		if (event === void 0) continue;
		if (event.type === "turn/end" && (event.data.reason.kind === "completed" || event.data.reason.kind === "max-tokens")) return event.data.turn;
	}
	return null;
}
//#endregion
export { Config, SETTINGS_NAMESPACE, apply, inject, name };
