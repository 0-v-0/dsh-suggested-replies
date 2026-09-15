window.__ModuleLoader__.load({
	id: "@anionex/dsh-suggested-replies",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/SuggestedRepliesSection.tsx
		/**
		* Settings section for the suggested-replies master switch and editable config.
		*
		* @module @anionex/dsh-suggested-replies/client/SuggestedRepliesSection
		*/
		const sectionStyle = {
			display: "flex",
			flexDirection: "column",
			gap: 14,
			paddingBottom: 24
		};
		const introStyle = {
			padding: "14px 16px",
			borderRadius: 12,
			background: "var(--dsw-alias-bg-layer-2, rgba(128, 128, 128, 0.08))"
		};
		const titleStyle = {
			margin: 0,
			fontSize: 15,
			lineHeight: 1.4
		};
		const descriptionStyle = {
			margin: "4px 0 0",
			fontSize: 12,
			lineHeight: 1.55,
			opacity: .65
		};
		const noteStyle = {
			marginTop: 14,
			padding: "10px 12px",
			borderRadius: 8,
			background: "rgba(128, 128, 128, 0.12)",
			fontSize: 13,
			lineHeight: 1.6
		};
		const errorStyle = {
			marginBottom: 8,
			padding: "10px 12px",
			borderRadius: 8,
			background: "rgba(192, 64, 64, 0.12)",
			fontSize: 13
		};
		const groupStyle = {
			display: "flex",
			flexDirection: "column",
			gap: 0,
			border: "1px solid rgba(128, 128, 128, 0.22)",
			borderRadius: 12,
			overflow: "hidden"
		};
		const groupHeaderStyle = {
			margin: 0,
			padding: "10px 16px",
			fontSize: 13,
			fontWeight: 600,
			letterSpacing: "0.02em",
			background: "rgba(128, 128, 128, 0.10)",
			borderBottom: "1px solid rgba(128, 128, 128, 0.22)"
		};
		const toggleRowStyle = {
			display: "flex",
			alignItems: "center",
			justifyContent: "space-between",
			gap: 16,
			padding: "12px 16px",
			borderBottom: "1px solid rgba(128, 128, 128, 0.14)"
		};
		const toggleLabelStyle = {
			fontSize: 14,
			lineHeight: 1.4
		};
		const toggleDescStyle = {
			fontSize: 12,
			lineHeight: 1.55,
			opacity: .62,
			marginTop: 2
		};
		const selectStyle = {
			flex: "0 0 auto",
			padding: "6px 10px",
			fontSize: 13,
			border: "1px solid rgba(128, 128, 128, 0.3)",
			borderRadius: 8,
			background: "var(--dsw-alias-bg-layer-1, transparent)",
			color: "inherit"
		};
		function Toggle({ on, label, disabled, onToggle }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				role: "switch",
				"aria-checked": on,
				"aria-label": label,
				disabled,
				onClick: onToggle,
				style: {
					position: "relative",
					flex: "0 0 auto",
					width: 44,
					height: 26,
					padding: 0,
					border: 0,
					borderRadius: 13,
					background: on ? "#2f6fed" : "rgba(128, 128, 128, 0.35)",
					cursor: disabled ? "not-allowed" : "pointer",
					opacity: disabled ? .5 : 1
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					"aria-hidden": "true",
					style: {
						position: "absolute",
						top: 3,
						left: on ? 21 : 3,
						width: 20,
						height: 20,
						borderRadius: "50%",
						background: "#fff",
						transition: "left 160ms ease"
					}
				})
			});
		}
		function ToggleRow({ label, desc, value, disabled, onChange }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: toggleRowStyle,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: toggleLabelStyle,
					children: label
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: toggleDescStyle,
					children: desc
				})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Toggle, {
					on: value,
					label,
					disabled,
					onToggle: onChange
				})]
			});
		}
		function ConfigGroup({ title, children }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: groupStyle,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
					style: groupHeaderStyle,
					children: title
				}), children]
			});
		}
		function SuggestedRepliesSection({ rpc, t }) {
			const [config, setConfig] = (0, react.useState)();
			const [writing, setWriting] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)();
			(0, react.useEffect)(() => {
				let mounted = true;
				(async () => {
					try {
						const result = await rpc.call("/suggested-replies", "config.get", {});
						if (!mounted) return;
						if (result.ok) setConfig(result.value);
						else setError(result.error.message);
					} catch (cause) {
						if (!mounted) return;
						setError(cause instanceof Error ? cause.message : String(cause));
					}
				})();
				return () => {
					mounted = false;
				};
			}, [rpc]);
			const patch = (0, react.useCallback)(async (p) => {
				setWriting(true);
				setError(void 0);
				try {
					const result = await rpc.call("/suggested-replies", "config.set", p);
					if (result.ok) setConfig(result.value);
					else setError(result.error.message);
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : String(cause));
				} finally {
					setWriting(false);
				}
			}, [rpc]);
			if (config === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("section", {
				style: sectionStyle,
				children: t("loading")
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				style: sectionStyle,
				children: [
					error !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: errorStyle,
						role: "alert",
						children: error
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
						style: introStyle,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
							style: titleStyle,
							children: t("settings.title")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							style: descriptionStyle,
							children: t("settings.description")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(ConfigGroup, {
						title: t("settings.generation.title"),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: toggleRowStyle,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									style: toggleLabelStyle,
									children: t("settings.suggestionCount.label")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									style: toggleDescStyle,
									children: t("settings.suggestionCount.description")
								})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "number",
									min: 0,
									max: 6,
									step: 1,
									style: {
										...selectStyle,
										width: 60,
										textAlign: "center"
									},
									disabled: writing,
									value: config.suggestionCount,
									onChange: (e) => {
										const n = Math.max(0, Math.min(6, Math.floor(Number(e.target.value) || 0)));
										patch({ suggestionCount: n });
									}
								})]
							}),
							config.suggestionCount === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: noteStyle,
								children: t("settings.suggestionCount.disabled")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: toggleRowStyle,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									style: toggleLabelStyle,
									children: t("settings.reasoningEffort.label")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									style: toggleDescStyle,
									children: t("settings.reasoningEffort.description")
								})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
									style: selectStyle,
									disabled: writing,
									value: config.reasoningEffort,
									onChange: (e) => void patch({ reasoningEffort: e.target.value }),
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "off",
										children: t("settings.reasoningEffort.off")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "auto",
										children: t("settings.reasoningEffort.auto")
									})]
								})]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(ConfigGroup, {
						title: t("settings.sanitize.title"),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToggleRow, {
								label: t("settings.redactSecrets.label"),
								desc: t("settings.redactSecrets.description"),
								value: config.redactSecrets,
								disabled: writing,
								onChange: () => void patch({ redactSecrets: !config.redactSecrets })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToggleRow, {
								label: t("settings.stripControls.label"),
								desc: t("settings.stripControls.description"),
								value: config.stripControls,
								disabled: writing,
								onChange: () => void patch({ stripControls: !config.stripControls })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToggleRow, {
								label: t("settings.singleLine.label"),
								desc: t("settings.singleLine.description"),
								value: config.singleLine,
								disabled: writing,
								onChange: () => void patch({ singleLine: !config.singleLine })
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(ConfigGroup, {
						title: t("settings.filter.title"),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToggleRow, {
								label: t("settings.filterMetaText.label"),
								desc: t("settings.filterMetaText.description"),
								value: config.filterMetaText,
								disabled: writing,
								onChange: () => void patch({ filterMetaText: !config.filterMetaText })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToggleRow, {
								label: t("settings.filterEvaluative.label"),
								desc: t("settings.filterEvaluative.description"),
								value: config.filterEvaluative,
								disabled: writing,
								onChange: () => void patch({ filterEvaluative: !config.filterEvaluative })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToggleRow, {
								label: t("settings.filterAssistantVoice.label"),
								desc: t("settings.filterAssistantVoice.description"),
								value: config.filterAssistantVoice,
								disabled: writing,
								onChange: () => void patch({ filterAssistantVoice: !config.filterAssistantVoice })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToggleRow, {
								label: t("settings.filterTooLong.label"),
								desc: t("settings.filterTooLong.description"),
								value: config.filterTooLong,
								disabled: writing,
								onChange: () => void patch({ filterTooLong: !config.filterTooLong })
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ConfigGroup, {
						title: t("settings.manual.title"),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToggleRow, {
							label: t("settings.manualReplacesDraft.label"),
							desc: t("settings.manualReplacesDraft.description"),
							value: config.manualReplacesDraft,
							disabled: writing,
							onChange: () => void patch({ manualReplacesDraft: !config.manualReplacesDraft })
						})
					})
				]
			});
		}
		//#endregion
		//#region src/client/SuggestionBubbles.tsx
		/**
		* Input-dock bubbles that copy a suggested reply into the message draft.
		*
		* @module @anionex/dsh-suggested-replies/client/SuggestionBubbles
		*/
		const STYLE_TAG_ID = "dsh-suggested-replies-style";
		const COLLAPSE_KEY = "dsh-suggested-replies-collapsed";
		let styleUsers = 0;
		const CSS_TEXT = `
.dsh-suggested-replies-dock {
  box-sizing: border-box;
  flex: none;
  width: calc(100% - var(--dsh-composer-side-clearance) - var(--dsh-composer-side-clearance) - 4 * var(--dsh-composer-dock-inset));
  max-width: calc(var(--dsh-composer-card-max-width) - 4 * var(--dsh-composer-dock-inset));
  margin: 0 auto;
}
.dsh-suggested-replies-header {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
}
.dsh-suggested-replies-header-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary, #68707d);
  cursor: pointer;
  font-size: 12px;
  line-height: 20px;
}
.dsh-suggested-replies-header-btn:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(128, 128, 128, 0.10));
}
.dsh-suggested-replies-chevron {
  display: inline-block;
  font-size: 10px;
  transition: transform 160ms ease;
}
.dsh-suggested-replies-chevron-collapsed {
  transform: rotate(-90deg);
}
.dsh-suggested-replies-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 4px 0;
  overflow: hidden;
}
.dsh-suggested-replies-bubble {
  box-sizing: border-box;
  overflow: hidden;
  padding: 7px 12px;
  border: 1px solid var(--dsw-alias-border-l1, #d8dce2);
  border-radius: 10px;
  background: var(--dsw-specific-tip, rgba(127, 136, 153, 0.12));
  color: var(--dsw-alias-label-primary, #23262d);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  line-height: 20px;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: border-color 120ms ease, background 120ms ease;
}
.dsh-suggested-replies-bubble:hover:not(:disabled) {
  border-color: var(--dsw-alias-state-business-primary, #2f6fed);
  background: var(--dsw-alias-interactive-bg-hover, rgba(47, 111, 237, 0.12));
}
.dsh-suggested-replies-bubble:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #2f6fed);
  outline-offset: 2px;
}
.dsh-suggested-replies-bubble:disabled { cursor: default; opacity: .52; }
.dsh-suggested-replies-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}
.dsh-suggested-replies-regenerate {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--dsw-alias-border-l1, #d8dce2);
  border-radius: 999px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary, #68707d);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
}
.dsh-suggested-replies-regenerate:hover:not(:disabled) {
  border-color: var(--dsw-alias-state-business-primary, #2f6fed);
  color: var(--dsw-alias-state-business-primary, #2f6fed);
}
.dsh-suggested-replies-regenerate:disabled { cursor: default; opacity: .52; }
`;
		const ROOT_STYLE = { display: "contents" };
		function loadCollapsed() {
			try {
				return localStorage.getItem(COLLAPSE_KEY) === "1";
			} catch {
				return false;
			}
		}
		function saveCollapsed(v) {
			try {
				localStorage.setItem(COLLAPSE_KEY, v ? "1" : "0");
			} catch {}
		}
		/** Render loading text or ready bubbles directly above the composer card. */
		function SuggestionBubbles({ rpc, sessionId, useInput, inputActions, t }) {
			const [observed, setObserved] = (0, react.useState)();
			const [collapsed, setCollapsed] = (0, react.useState)(loadCollapsed);
			const phase = useInput((state) => state.phase);
			const state = observed !== void 0 && observed.sessionId === sessionId ? observed.value : void 0;
			(0, react.useEffect)(() => {
				const controller = new AbortController();
				const { signal } = controller;
				const publish = (value) => {
					if (!signal.aborted) setObserved({
						sessionId,
						value
					});
				};
				const clear = () => {
					if (signal.aborted) return;
					setObserved((current) => current?.sessionId === sessionId ? void 0 : current);
				};
				(async () => {
					try {
						const initial = await rpc.call("/suggested-replies", "state.get", { sessionId }, signal);
						if (signal.aborted) return;
						if (!initial.ok) {
							clear();
							return;
						}
						let current = initial.value;
						publish(current);
						while (!signal.aborted) {
							const watched = await rpc.call("/suggested-replies", "state.watch", {
								sessionId,
								lifecycle: current.lifecycle,
								revision: current.revision
							}, signal);
							if (signal.aborted) return;
							if (!watched.ok) {
								clear();
								return;
							}
							current = watched.value;
							publish(current);
						}
					} catch {
						clear();
					}
				})();
				return () => controller.abort();
			}, [rpc, sessionId]);
			(0, react.useEffect)(() => {
				styleUsers += 1;
				if (document.getElementById(STYLE_TAG_ID) === null) {
					const tag = document.createElement("style");
					tag.id = STYLE_TAG_ID;
					tag.textContent = CSS_TEXT;
					document.head.appendChild(tag);
				}
				return () => {
					styleUsers -= 1;
					if (styleUsers !== 0) return;
					document.getElementById(STYLE_TAG_ID)?.remove();
				};
			}, []);
			(0, react.useEffect)(() => {
				rpc.call("/suggested-replies", "dock.setCollapsed", {
					sessionId,
					collapsed
				});
			}, [
				rpc,
				sessionId,
				collapsed
			]);
			const hasVisibleSuggestions = state !== void 0 && state.phase !== "cleared" && state.phase !== "generating" && state.suggestions.length > 0;
			(0, react.useEffect)(() => {
				if (!hasVisibleSuggestions) return;
				const onKeyDown = (event) => {
					if (event.key !== "Escape") return;
					rpc.call("/suggested-replies", "suggestions.dismiss", { sessionId });
				};
				document.addEventListener("keydown", onKeyDown);
				return () => document.removeEventListener("keydown", onKeyDown);
			}, [
				rpc,
				sessionId,
				hasVisibleSuggestions
			]);
			(0, react.useEffect)(() => {
				const onKeyDown = (event) => {
					if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || event.code !== "Space") return;
					if (event.isComposing) return;
					event.preventDefault();
					rpc.call("/suggested-replies", "suggestions.generate", { sessionId });
				};
				document.addEventListener("keydown", onKeyDown);
				return () => document.removeEventListener("keydown", onKeyDown);
			}, [rpc, sessionId]);
			const lazyState = state;
			(0, react.useEffect)(() => {
				if (lazyState === void 0) return;
				if (collapsed) return;
				if (lazyState.phase === "generating") return;
				if (lazyState.suggestions.length > 0) return;
				rpc.call("/suggested-replies", "suggestions.generate", { sessionId });
			}, [
				rpc,
				sessionId,
				collapsed,
				lazyState
			]);
			if (state === void 0 || state.phase === "generating") return null;
			const disabled = phase !== "plain";
			const showBubbles = state.suggestions.length > 0;
			const toggleCollapsed = () => {
				const next = !collapsed;
				setCollapsed(next);
				saveCollapsed(next);
				rpc.call("/suggested-replies", "dock.setCollapsed", {
					sessionId,
					collapsed: next
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: ROOT_STYLE,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsh-suggested-replies-dock",
					"data-suggested-replies-dock": "",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-suggested-replies-header",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: "dsh-suggested-replies-header-btn",
							onClick: toggleCollapsed,
							"aria-expanded": !collapsed,
							"aria-label": t("title"),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: `dsh-suggested-replies-chevron${collapsed ? " dsh-suggested-replies-chevron-collapsed" : ""}`,
								children: "▼"
							}), t("title")]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dsh-suggested-replies-actions",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "dsh-suggested-replies-regenerate",
								disabled,
								title: t("regenerate"),
								"aria-label": t("regenerate"),
								onClick: () => void rpc.call("/suggested-replies", "suggestions.generate", { sessionId }),
								children: "✨"
							})
						})]
					}), !collapsed && showBubbles && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dsh-suggested-replies-list",
						children: state.suggestions.map((text, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "dsh-suggested-replies-bubble",
							disabled,
							title: t("hint"),
							onClick: () => inputActions.setDraft(text),
							children: text
						}, `${state.turn}-${index}`))
					})]
				})
			});
		}
		//#endregion
		//#region src/client/locales.ts
		/** Locale namespace registered by the client plugin. */
		const NS = "suggested-replies";
		/** English copy. */
		const en = {
			title: "Reply suggestions",
			hint: "Click to fill the message box",
			loading: "Preparing reply suggestions...",
			regenerate: "Regenerate suggestions",
			dismiss: "Dismiss suggestions",
			"settings.nav": "Reply suggestions",
			"settings.title": "Reply suggestions",
			"settings.description": "After an AI reply, prepare a few likely next messages above the input box. Suggestions use the current conversation model by default.",
			"settings.generation.title": "Generation",
			"settings.reasoningEffort.label": "Reasoning effort",
			"settings.reasoningEffort.description": "Set to 'off' to disable thinking for faster suggestions.",
			"settings.reasoningEffort.off": "Off (no thinking)",
			"settings.reasoningEffort.auto": "Auto (model default)",
			"settings.suggestionCount.label": "Number of suggestions",
			"settings.suggestionCount.description": "How many candidate messages to generate per turn. Set to 0 to disable.",
			"settings.suggestionCount.disabled": "Disabled (set to 0)",
			"settings.sanitize.title": "Sanitization",
			"settings.redactSecrets.label": "Redact secrets",
			"settings.redactSecrets.description": "Mask API keys and tokens in the transcript before sending to the model.",
			"settings.stripControls.label": "Strip control characters",
			"settings.stripControls.description": "Remove escape sequences, control characters, and bidi override marks.",
			"settings.singleLine.label": "Force single line",
			"settings.singleLine.description": "Ensure each suggestion is a single line with no embedded newlines.",
			"settings.filter.title": "Semantic filtering",
			"settings.filterMetaText.label": "Filter meta-text",
			"settings.filterMetaText.description": "Hide meta-text like 'no suggestion' or 'stay silent'.",
			"settings.filterEvaluative.label": "Filter evaluative phrases",
			"settings.filterEvaluative.description": "Hide phrases like 'thanks', 'looks good'.",
			"settings.filterAssistantVoice.label": "Filter assistant voice",
			"settings.filterAssistantVoice.description": "Hide phrases like 'Let me…'.",
			"settings.filterTooLong.label": "Filter overly long suggestions",
			"settings.filterTooLong.description": "Hide suggestions exceeding 12 words or 100 bytes.",
			"settings.manual.title": "Manual generation",
			"settings.manualShortcut.label": "Keyboard shortcut",
			"settings.manualShortcut.description": "Shortcut to manually trigger suggestion generation. Set to 'disabled' to turn off.",
			"settings.manualReplacesDraft.label": "Write to draft",
			"settings.manualReplacesDraft.description": "Manual trigger writes the first suggestion directly to the draft.",
			"settings.regenerate": "Regenerate",
			"settings.regenerate.hint": "Click to regenerate suggestions"
		};
		/** Simplified Chinese copy. */
		const zh = {
			title: "回复建议",
			hint: "点击填入输入框",
			loading: "正在生成回复建议...",
			regenerate: "重新生成建议",
			dismiss: "关闭建议",
			"settings.nav": "回复建议",
			"settings.title": "回复建议",
			"settings.description": "AI 回复结束后，在输入框上方准备几条可能的回复建议。默认沿用当前对话使用的模型。",
			"settings.generation.title": "生成设置",
			"settings.reasoningEffort.label": "思考强度",
			"settings.reasoningEffort.description": "设为'关闭'可禁用思考以加快建议生成。",
			"settings.reasoningEffort.off": "关闭（不思考）",
			"settings.reasoningEffort.auto": "自动（模型默认）",
			"settings.suggestionCount.label": "建议数量",
			"settings.suggestionCount.description": "每次生成多少条候选消息，设为 0 则关闭。",
			"settings.suggestionCount.disabled": "已关闭（数量为 0）",
			"settings.sanitize.title": "净化设置",
			"settings.redactSecrets.label": "掩蔽密钥",
			"settings.redactSecrets.description": "在发送给模型前掩蔽转录中的 API 密钥和令牌。",
			"settings.stripControls.label": "剥离控制字符",
			"settings.stripControls.description": "移除转义序列、控制字符和双向覆盖符。",
			"settings.singleLine.label": "强制单行",
			"settings.singleLine.description": "确保每条建议为单行，无嵌入换行。",
			"settings.filter.title": "语义过滤",
			"settings.filterMetaText.label": "过滤元文本",
			"settings.filterMetaText.description": "隐藏'无建议'等元文本。",
			"settings.filterEvaluative.label": "过滤评价套话",
			"settings.filterEvaluative.description": "隐藏'谢谢'、'不错'等评价套话。",
			"settings.filterAssistantVoice.label": "过滤助手口吻",
			"settings.filterAssistantVoice.description": "隐藏'我来…'等助手口吻。",
			"settings.filterTooLong.label": "过滤过长建议",
			"settings.filterTooLong.description": "隐藏超过12词或100字节的建议。",
			"settings.manual.title": "手动生成",
			"settings.manualShortcut.label": "快捷键",
			"settings.manualShortcut.description": "手动触发建议生成的快捷键。设为'disabled'可关闭。",
			"settings.manualReplacesDraft.label": "写入草稿",
			"settings.manualReplacesDraft.description": "手动触发时将第一条建议直接写入草稿。",
			"settings.regenerate": "重新生成",
			"settings.regenerate.hint": "点击重新生成建议"
		};
		//#endregion
		//#region src/client/index.ts
		/** Required client services: slots, locale registration, and settings RPC transport. */
		const inject = [
			"slots",
			"locale",
			"connection"
		];
		/**
		* Register the input-dock candidate row and the settings master switch.
		* @param ctx - browser client root context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "dsh-suggested-replies: dictionaries");
			const connection = ctx.connection;
			const bubblesInjected = () => ({ rpc: connection.rpc });
			ctx.slots.inject("conversation.input.dock", () => ctx.slots.register({
				name: "conversation.input.dock",
				id: "suggested-replies",
				order: 15,
				locale: NS,
				inject: bubblesInjected
			}, SuggestionBubbles));
			const settingsInjected = () => ({ rpc: connection.rpc });
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "suggested-replies",
				order: 70,
				label: () => ctx.locale.bind(NS)("settings.nav"),
				locale: NS,
				inject: settingsInjected
			}, SuggestedRepliesSection));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map