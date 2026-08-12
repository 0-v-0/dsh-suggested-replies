import z from "schemastery";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
//#region src/generation-gate.ts
/**
* Ensures at most one candidate-generation request can commit per session.
* Starting a later request, receiving new user input, timing out, or disposing
* the plugin invalidates the prior lease before it can append stale results.
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
	* @returns whether the lease may append a session event.
	*/
	isCurrent(lease) {
		return this.active.get(lease.key)?.revision === lease.revision && !lease.signal.aborted;
	}
	/**
	* Test whether a lease still owns the current map entry, even when its own
	* timeout signal has fired. Callers use this to replace a loading state with
	* an empty result after a timeout without allowing cancelled work to commit.
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
//#region src/suggestion-llm.ts
/**
* Select the trailing visible conversation messages from a session.
* @param agent - agent whose session owns the conversation.
* @param contextMessageCount - maximum retained message count.
* @returns recent messages in chronological order.
*/
function deriveRecentMessages(agent, contextMessageCount) {
	return agent.session.deriveMessages().slice(-contextMessageCount);
}
/**
* Resolve the latest logged route, falling back to the Agent creation route.
* @param agent - agent whose conversation route should be reused.
* @returns provider/model pair, or `null` when neither source has both fields.
*/
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
/**
* Validate and normalize an optional explicit auxiliary route.
* @param provider - optional configured provider, or `undefined` to inherit.
* @param model - optional configured model, or `undefined` to inherit.
* @returns the explicit route, or `undefined` when both fields are omitted.
*/
function resolveConfiguredSuggestionRoute(provider, model) {
	if (provider === void 0 && model === void 0) return void 0;
	if (provider === void 0 || model === void 0 || provider.trim().length === 0 || model.trim().length === 0) throw new Error("dsh-suggested-replies: suggestionProvider and suggestionModel must be set together as a non-empty pair");
	return {
		provider,
		model
	};
}
/**
* Prepare the detached request when the current route and conversation support it.
* @param ctx - host context that may own an LLM service.
* @param agent - agent whose completed turn supplied the context.
* @param config - resolved model-call options.
* @param turn - completed turn that must contain visible assistant text.
* @param signal - cancellation signal held by the session generation gate.
* @returns loggable and dispatchable request, or `null` for an expected no-op.
*/
function prepareSuggestionRequest(ctx, agent, config, turn, signal) {
	if (ctx.get("llm") === void 0 || signal.aborted) return null;
	if (!turnHasAssistantText(agent, turn)) return null;
	const route = config.suggestionRoute ?? resolveSuggestionRoute(agent);
	if (route === null) return null;
	const prompt = buildSuggestedRepliesUserPrompt(deriveRecentMessages(agent, config.contextMessageCount));
	if (prompt === null) return null;
	const system = buildSuggestionSystemPrompt(config);
	return {
		log: {
			route,
			system,
			prompt,
			maxTokens: config.maxTokens
		},
		options: buildSuggestionCallOptions(route, prompt, system, config.maxTokens, signal, agent.id)
	};
}
/** Test whether the completed turn itself contributed visible assistant text. */
function turnHasAssistantText(agent, turn) {
	return agent.session.events.some((event) => event.type === "assistant/message" && event.data.turn === turn && event.data.message.content.some((block) => block.type === "text" && block.text.trim() !== ""));
}
/**
* Assemble the standalone LLM request from already resolved inputs.
* @param route - provider/model route reused from the conversation.
* @param prompt - recent conversation serialized for the user role.
* @param system - complete auxiliary model instruction.
* @param maxTokens - detached-call output token cap.
* @param signal - cancellation signal held by the session generation gate.
* @param sessionId - session identity used by global LLM middleware routing.
* @returns ready provider-neutral LLM options.
*/
function buildSuggestionCallOptions(route, prompt, system, maxTokens, signal, sessionId) {
	return {
		provider: route.provider,
		model: route.model,
		system,
		messages: [localMessage(prompt)],
		tools: [],
		maxTokens,
		signal,
		...sessionId === void 0 ? {} : { sessionId }
	};
}
/** Construct the minimum valid provider-neutral message for this auxiliary request. */
function localMessage(text) {
	return {
		id: crypto.randomUUID(),
		role: "user",
		content: [{
			type: "text",
			text
		}],
		source: {
			kind: "plugin",
			plugin: "dsh-suggested-replies"
		}
	};
}
/**
* Drain a stream to plain text, accepting only normal `stop` completion.
* @param stream - LLM chunks returned by the selected provider.
* @returns complete output text, or `null` after an aborted or failed finish.
*/
async function drainTextStream(stream) {
	const parts = [];
	let completed = false;
	for await (const chunk of stream) {
		if (chunk.type === "text-delta") {
			parts.push(chunk.text);
			continue;
		}
		if (chunk.type === "finish" && chunk.reason.kind === "stop") completed = true;
	}
	if (!completed) return null;
	const output = parts.join("");
	return output === "" ? null : output;
}
/**
* Generate ready candidates, returning null for expected provider, parsing, or
* cancellation failures. The caller's freshness gate decides whether a result
* may still be appended after this promise settles.
* @param ctx - host context carrying the optional LLM service.
* @param request - prepared request whose inputs were logged before dispatch.
* @param config - resolved output and context limits.
* @param signal - session-specific cancellation signal.
* @returns parsed candidates, or `null` when no usable result was produced.
*/
async function generateSuggestedReplies(ctx, request, config, signal) {
	const llm = ctx.get("llm");
	if (llm === void 0 || signal.aborted) return null;
	try {
		const output = await drainTextStream(llm.stream(request.options));
		return output === null || signal.aborted ? null : parseSuggestedReplies(output, config);
	} catch {
		return null;
	}
}
//#endregion
//#region src/projection.ts
/** Minimal value schema required by the projection registry. */
const schema = { parse(value) {
	return value;
} };
/**
* Fold suggested-replies events into the client-facing state.
* @param state - current projected state.
* @param event - newly committed session event.
* @returns updated state, preserving identity for unrelated events.
*/
function foldSuggestedReplies(state, event) {
	if (event.type === "suggested-replies/generating") return {
		turn: event.data.turn,
		generating: true,
		suggestions: []
	};
	if (event.type === "suggested-replies/suggestions") {
		const payload = event.data;
		return {
			turn: payload.turn,
			generating: false,
			suggestions: payload.suggestions
		};
	}
	if (event.type === "suggested-replies/cleared" || event.type === "turn/start") return null;
	return state;
}
/**
* Register the projection when the session-projection capability is composed.
* @param ctx - plugin host context.
*/
function registerSuggestedRepliesProjection(ctx) {
	ctx.inject(["sessionProjections"], (projectionCtx) => {
		projectionCtx.sessionProjections.register({
			key: "suggestedReplies",
			schema,
			init: () => null,
			apply: foldSuggestedReplies,
			view: (state) => state,
			stateVersion: 1
		});
	});
}
//#endregion
//#region src/rpc.ts
/** Dedicated channel for this plugin's settings endpoints. */
const CHANNEL = "/suggested-replies";
/** Construct a successful RPC branch. */
function ok(value) {
	return {
		ok: true,
		value
	};
}
/** Construct a stable RPC error branch. */
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
/**
* Register settings endpoints against the connection service.
* @param ctx - plugin host context.
* @param getEnabled - reads the current settings source.
* @param setEnabled - persists and applies a new enabled state.
*/
function registerSuggestedRepliesRpc(ctx, getEnabled, setEnabled) {
	ctx.inject(["connection"], (connectionCtx) => {
		connectionCtx.connection.rpc.handle(CHANNEL, async (endpoint, payload) => {
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
				default: return fail(`unknown endpoint: ${endpoint}`);
			}
		}, { authority: "trusted-host" });
	});
}
/** Narrow unknown wire data at the RPC boundary. */
function isSettingsSetPayload(value) {
	return value !== null && typeof value === "object" && typeof value.enabled === "boolean";
}
//#endregion
//#region src/index.ts
/** Cordis plugin identity. */
const name = "dsh-suggested-replies";
/** Host services required before turn-end observation can start. */
const inject = ["agents", "connection"];
/** User-settings namespace used by the master enable switch. */
const SETTINGS_NAMESPACE = settingsNamespace("suggested-replies");
/** Config schema with deployment-adjustable generation limits. */
const Config = z.object({
	enabled: z.boolean().default(true).description("Enable next-message suggestions after completed turns."),
	suggestionCount: z.number().step(1).min(2).max(4).default(3).description("Number of candidate replies requested per completed turn."),
	contextMessageCount: z.number().step(1).min(2).max(6).default(4).description("Trailing visible conversation messages supplied as context."),
	maxSuggestionChars: z.number().step(1).min(32).max(300).default(160).description("Maximum characters retained for each candidate."),
	maxTokens: z.number().step(1).min(64).max(1024).default(384).description("Maximum output tokens for the auxiliary model call."),
	timeoutMs: z.number().step(1).min(1e3).max(3e4).default(15e3).description("Maximum milliseconds an auxiliary model call may run."),
	suggestionProvider: z.string().required(false).description("Optional explicit provider for auxiliary calls; omitted means inherit the conversation route."),
	suggestionModel: z.string().required(false).description("Optional explicit model for auxiliary calls; must be paired with suggestionProvider.")
});
/**
* Install generation, projection, cancellation, and settings wiring.
* @param ctx - host plugin context.
* @param config - resolved composition configuration.
*/
function apply(ctx, config) {
	registerSuggestedRepliesProjection(ctx);
	const gate = new GenerationGate();
	const agents = /* @__PURE__ */ new Map();
	const visibleSessions = /* @__PURE__ */ new Set();
	let source = () => ({ enabled: config.enabled });
	let enabledBeforeChange = source().enabled;
	const clearVisibleSession = (key, reason) => {
		gate.cancel(key);
		if (!visibleSessions.delete(key)) return;
		agents.get(key)?.session.append("suggested-replies/cleared", { reason });
	};
	const clearVisibleSessions = (reason) => {
		for (const key of [...visibleSessions]) clearVisibleSession(key, reason);
	};
	installSettingsSection(ctx, SETTINGS_NAMESPACE, SettingsSchema, { enabled: config.enabled }, {
		setSource: (next) => {
			source = next;
		},
		onChange: () => {
			const enabled = source().enabled;
			if (!enabled && enabledBeforeChange) clearVisibleSessions("disabled");
			enabledBeforeChange = enabled;
		}
	});
	const suggestionRoute = resolveConfiguredSuggestionRoute(config.suggestionProvider, config.suggestionModel);
	const generationConfig = {
		suggestionCount: config.suggestionCount,
		contextMessageCount: config.contextMessageCount,
		maxSuggestionChars: config.maxSuggestionChars,
		maxTokens: config.maxTokens,
		...suggestionRoute === void 0 ? {} : { suggestionRoute }
	};
	ctx.on("session/event", (session, event) => {
		if (event.type === "turn/start") {
			const key = String(session.id);
			gate.cancel(key);
			visibleSessions.delete(key);
			return;
		}
		if (event.type !== "turn/end") return;
		if (event.data.reason.kind !== "completed" && event.data.reason.kind !== "max-tokens") return;
		if (!source().enabled) return;
		const agent = ctx.agents.get(session.id);
		if (agent?.session !== session) return;
		if (agent.inbox.hasPending) return;
		const key = String(agent.id);
		agents.set(key, agent);
		const lease = gate.start(key, config.timeoutMs);
		const request = prepareSuggestionRequest(ctx, agent, generationConfig, event.data.turn, lease.signal);
		if (request === null) {
			gate.release(lease);
			return;
		}
		visibleSessions.add(key);
		queueMicrotask(() => {
			if (!gate.isCurrent(lease)) return;
			agent.session.append("suggested-replies/generating", {
				turn: event.data.turn,
				...request.log
			});
			runGeneration(ctx, agent, event.data.turn, request, generationConfig, gate, lease).catch((error) => {
				ctx.logger.warn(`dsh-suggested-replies: generation for session ${String(agent.id)} failed: ${String(error)}`);
			});
		});
	});
	ctx.on("agent/inbox/inserted", ({ agent }) => {
		const key = String(agent.id);
		agents.set(key, agent);
		clearVisibleSession(key, "new-input");
	});
	ctx.on("agent/disposed", ({ agent }) => {
		const key = String(agent.id);
		gate.cancel(key);
		agents.delete(key);
		visibleSessions.delete(key);
	});
	ctx.effect(() => () => {
		gate.dispose();
		agents.clear();
		visibleSessions.clear();
	}, "dsh-suggested-replies: abort active generations");
	registerSuggestedRepliesRpc(ctx, () => source().enabled, async (enabled) => {
		const settings = ctx.get("settings");
		if (settings !== void 0) await settings.update(SETTINGS_NAMESPACE, { enabled });
		else {
			source = () => ({ enabled });
			enabledBeforeChange = enabled;
			if (!enabled) clearVisibleSessions("disabled");
		}
	});
}
/** Settings schema intentionally exposes only the user-facing master switch. */
const SettingsSchema = z.object({ enabled: z.boolean().default(true).description("Enable suggested replies after completed turns.") });
/**
* Resolve one detached generation and append only if its lease is current.
* @param ctx - plugin host context.
* @param agent - agent whose session receives the result.
* @param turn - completed turn associated with the candidates.
* @param request - fully logged auxiliary request.
* @param config - resolved generation configuration.
* @param gate - session freshness and cancellation gate.
* @param lease - current generation capability.
*/
async function runGeneration(ctx, agent, turn, request, config, gate, lease) {
	try {
		const suggestions = await settleGeneration(ctx, request, config, lease.signal);
		if (!gate.owns(lease)) return;
		agent.session.append("suggested-replies/suggestions", {
			turn,
			suggestions: suggestions ?? []
		});
	} finally {
		gate.release(lease);
	}
}
/**
* Resolve promptly when cancellation or the gate timeout fires, even if an
* adapter fails to settle its iterator after aborting.
* @param ctx - plugin host context.
* @param request - fully logged auxiliary request.
* @param config - resolved output limits.
* @param signal - gate-owned cancellation signal.
* @returns ready candidates, or `null` after invalidation or generation failure.
*/
function settleGeneration(ctx, request, config, signal) {
	return new Promise((resolve) => {
		let settled = false;
		const finish = (value) => {
			if (settled) return;
			settled = true;
			signal.removeEventListener("abort", onAbort);
			resolve(value);
		};
		const onAbort = () => {
			finish(null);
		};
		if (signal.aborted) {
			finish(null);
			return;
		}
		signal.addEventListener("abort", onAbort, { once: true });
		generateSuggestedReplies(ctx, request, config, signal).then(finish, () => {
			finish(null);
		});
	});
}
//#endregion
export { Config, SETTINGS_NAMESPACE, apply, inject, name };
