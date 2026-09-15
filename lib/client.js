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
		* Settings section for the suggested-replies master switch and informational
		* deployment-config overview.
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
		const rowStyle = {
			display: "flex",
			alignItems: "center",
			justifyContent: "space-between",
			gap: 24,
			padding: "14px 16px",
			border: "1px solid rgba(128, 128, 128, 0.22)",
			borderRadius: 12
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
		const infoRowStyle = {
			display: "flex",
			flexDirection: "column",
			gap: 2,
			padding: "12px 16px",
			borderBottom: "1px solid rgba(128, 128, 128, 0.14)"
		};
		const infoLabelStyle = {
			fontSize: 14,
			lineHeight: 1.4
		};
		const infoDescStyle = {
			fontSize: 12,
			lineHeight: 1.55,
			opacity: .62
		};
		/** Accessible switch with host-theme-neutral styling. */
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
		/** One read-only informational row: a label plus a muted description. */
		function InfoRow({ labelKey, descKey, t }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: infoRowStyle,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: infoLabelStyle,
					children: t(labelKey)
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: infoDescStyle,
					children: t(descKey)
				})]
			});
		}
		/** A titled group of read-only informational rows. */
		function ConfigGroup({ titleKey, items, t }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: groupStyle,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
					style: groupHeaderStyle,
					children: t(titleKey)
				}), items.map(([labelKey, descKey]) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(InfoRow, {
					labelKey,
					descKey,
					t
				}, labelKey))]
			});
		}
		/** Render, persist the master enable switch, and show deployment-config overview. */
		function SuggestedRepliesSection({ rpc, t }) {
			const [enabled, setEnabled] = (0, react.useState)();
			const [writing, setWriting] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)();
			(0, react.useEffect)(() => {
				let mounted = true;
				(async () => {
					try {
						const result = await rpc.call("/suggested-replies", "settings.get", {});
						if (!mounted) return;
						if (result.ok) setEnabled(result.value.enabled);
						else {
							setEnabled(true);
							setError(result.error.message);
						}
					} catch (cause) {
						if (!mounted) return;
						setEnabled(true);
						setError(cause instanceof Error ? cause.message : String(cause));
					}
				})();
				return () => {
					mounted = false;
				};
			}, [rpc]);
			const toggle = async () => {
				if (enabled === void 0 || writing) return;
				setWriting(true);
				setError(void 0);
				try {
					const result = await rpc.call("/suggested-replies", "settings.set", { enabled: !enabled });
					if (result.ok) setEnabled(result.value.enabled);
					else setError(result.error.message);
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : String(cause));
				} finally {
					setWriting(false);
				}
			};
			if (enabled === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("section", {
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
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: rowStyle,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								fontSize: 15,
								lineHeight: 1.4
							},
							children: t("settings.enabled.label")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								marginTop: 2,
								fontSize: 13,
								lineHeight: 1.5,
								opacity: .62
							},
							children: t("settings.enabled.description")
						})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Toggle, {
							on: enabled,
							label: t("settings.enabled.label"),
							disabled: writing,
							onToggle: () => void toggle()
						})]
					}),
					!enabled && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: noteStyle,
						children: t("settings.disabled.note")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ConfigGroup, {
						titleKey: "settings.generation.title",
						t,
						items: [["settings.reasoningEffort.label", "settings.reasoningEffort.description"], ["settings.suggestionCount.label", "settings.suggestionCount.description"]]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ConfigGroup, {
						titleKey: "settings.sanitize.title",
						t,
						items: [
							["settings.redactSecrets.label", "settings.redactSecrets.description"],
							["settings.stripControls.label", "settings.stripControls.description"],
							["settings.singleLine.label", "settings.singleLine.description"]
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ConfigGroup, {
						titleKey: "settings.filter.title",
						t,
						items: [
							["settings.filterMetaText.label", "settings.filterMetaText.description"],
							["settings.filterEvaluative.label", "settings.filterEvaluative.description"],
							["settings.filterAssistantVoice.label", "settings.filterAssistantVoice.description"],
							["settings.filterTooLong.label", "settings.filterTooLong.description"]
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ConfigGroup, {
						titleKey: "settings.manual.title",
						t,
						items: [["settings.manualShortcut.label", "settings.manualShortcut.description"], ["settings.manualReplacesDraft.label", "settings.manualReplacesDraft.description"]]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: noteStyle,
						children: t("settings.config.note")
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
		let styleUsers = 0;
		const CSS_TEXT = `
.dsh-suggested-replies-dock {
  box-sizing: border-box;
  flex: none;
  width: calc(100% - var(--dsh-composer-side-clearance) - var(--dsh-composer-side-clearance) - 4 * var(--dsh-composer-dock-inset));
  max-width: calc(var(--dsh-composer-card-max-width) - 4 * var(--dsh-composer-dock-inset));
  margin: 0 auto;
}
.dsh-suggested-replies-row {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 4px 0;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}
.dsh-suggested-replies-row::-webkit-scrollbar {
  display: none;
}
.dsh-suggested-replies-loading {
  color: var(--dsw-alias-label-tertiary, #68707d);
  font-size: 12px;
  line-height: 20px;
}
.dsh-suggested-replies-label {
  flex: none;
  color: var(--dsw-alias-label-tertiary, #68707d);
  font-size: 12px;
  line-height: 20px;
}
.dsh-suggested-replies-bubble {
  box-sizing: border-box;
  flex: none;
  max-width: min(100%, 320px);
  overflow: hidden;
  padding: 6px 10px;
  border: 1px solid var(--dsw-alias-border-l1, #d8dce2);
  border-radius: 999px;
  background: var(--dsw-specific-tip, rgba(127, 136, 153, 0.12));
  color: var(--dsw-alias-label-primary, #23262d);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  line-height: 18px;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
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
		/** Render loading text or ready bubbles directly above the composer card. */
		function SuggestionBubbles({ rpc, sessionId, useInput, inputActions, t }) {
			const [observed, setObserved] = (0, react.useState)();
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
			if (state === void 0 || state.phase === "cleared") return null;
			if (state.phase === "generating") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: ROOT_STYLE,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dsh-suggested-replies-dock",
					"data-suggested-replies-dock": "",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dsh-suggested-replies-row dsh-suggested-replies-loading",
						role: "status",
						children: t("loading")
					})
				})
			});
			if (state.suggestions.length === 0) return null;
			const disabled = phase !== "plain";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: ROOT_STYLE,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dsh-suggested-replies-dock",
					"data-suggested-replies-dock": "",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-suggested-replies-row",
						"aria-label": t("title"),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsh-suggested-replies-label",
								children: t("title")
							}),
							state.suggestions.map((text, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "dsh-suggested-replies-bubble",
								disabled,
								title: t("hint"),
								onClick: () => inputActions.setDraft(text),
								children: text
							}, `${state.turn}-${index}`)),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "dsh-suggested-replies-regenerate",
								disabled,
								title: t("regenerate"),
								"aria-label": t("regenerate"),
								onClick: () => void rpc.call("/suggested-replies", "suggestions.generate", { sessionId }),
								children: "✨"
							})
						]
					})
				})
			});
		}
		//#endregion
		//#region src/client/locales.ts
		/** Locale namespace registered by the client plugin. */
		const NS = "suggested-replies";
		/** English copy. */
		const en = {
			title: "Suggested next messages",
			hint: "Click to fill the message box",
			loading: "Preparing next-message suggestions...",
			regenerate: "Regenerate suggestions",
			dismiss: "Dismiss suggestions",
			"settings.nav": "Suggested replies",
			"settings.title": "Suggested replies",
			"settings.description": "After an AI reply, prepare a few likely next messages above the input box. Suggestions use the current conversation model by default.",
			"settings.enabled.label": "Enable suggested replies",
			"settings.enabled.description": "Generate candidate next messages after an AI reply. Clicking a candidate only fills the draft; it never sends automatically.",
			"settings.disabled.note": "Disabled. Completed turns do not make auxiliary suggestion calls until you enable it again.",
			"settings.generation.title": "Generation",
			"settings.reasoningEffort.label": "Reasoning effort",
			"settings.reasoningEffort.description": "Set to 'off' to disable thinking for faster suggestions.",
			"settings.reasoningEffort.off": "Off (no thinking)",
			"settings.reasoningEffort.auto": "Auto (model default)",
			"settings.suggestionCount.label": "Number of suggestions",
			"settings.suggestionCount.description": "How many candidate messages to generate per turn.",
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
			"settings.filterEvaluative.description": "Hide phrases like 'thanks', 'looks good', '不错'.",
			"settings.filterAssistantVoice.label": "Filter assistant voice",
			"settings.filterAssistantVoice.description": "Hide phrases like 'Let me…', '我来…'.",
			"settings.filterTooLong.label": "Filter overly long suggestions",
			"settings.filterTooLong.description": "Hide suggestions exceeding 12 words or 100 bytes.",
			"settings.manual.title": "Manual generation",
			"settings.manualShortcut.label": "Keyboard shortcut",
			"settings.manualShortcut.description": "Shortcut to manually trigger suggestion generation. Set to 'disabled' to turn off.",
			"settings.manualReplacesDraft.label": "Write to draft",
			"settings.manualReplacesDraft.description": "Manual trigger writes the first suggestion directly to the draft.",
			"settings.regenerate": "Regenerate",
			"settings.regenerate.hint": "Click to regenerate suggestions",
			"settings.config.note": "These options are configured at deployment in cordis.patch.yml and cannot be changed here."
		};
		/** Simplified Chinese copy. */
		const zh = {
			title: "下一步建议",
			hint: "点击填入输入框",
			loading: "正在生成下一步建议...",
			regenerate: "重新生成建议",
			dismiss: "关闭建议",
			"settings.nav": "下一步建议",
			"settings.title": "下一步建议",
			"settings.description": "AI 回复结束后，在输入框上方准备几条可能的下一步消息。默认沿用当前对话使用的模型。",
			"settings.enabled.label": "启用下一步建议",
			"settings.enabled.description": "点击建议只会把文字填入输入框，由你确认后发送，不会自动发出消息。",
			"settings.disabled.note": "已关闭。AI 回复结束后不会再生成下一步建议。",
			"settings.generation.title": "生成设置",
			"settings.reasoningEffort.label": "思考强度",
			"settings.reasoningEffort.description": "设为'关闭'可禁用思考以加快建议生成。",
			"settings.reasoningEffort.off": "关闭（不思考）",
			"settings.reasoningEffort.auto": "自动（模型默认）",
			"settings.suggestionCount.label": "建议数量",
			"settings.suggestionCount.description": "每次生成多少条候选消息。",
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
			"settings.regenerate.hint": "点击重新生成建议",
			"settings.config.note": "这些选项在 cordis.patch.yml 中于部署时配置，无法在此修改。"
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