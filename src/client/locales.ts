/**
 * Locale dictionaries for the suggested-replies Web surface.
 *
 * @module @anionex/dsh-suggested-replies/client/locales
 */

/** Keys used by the input dock and settings section. */
export type SuggestedRepliesKey =
  | 'title'
  | 'hint'
  | 'loading'
  | 'regenerate'
  | 'dismiss'
  | 'settings.nav'
  | 'settings.title'
  | 'settings.description'
  | 'settings.enabled.label'
  | 'settings.enabled.description'
  | 'settings.disabled.note'
  | 'settings.generation.title'
  | 'settings.reasoningEffort.label'
  | 'settings.reasoningEffort.description'
  | 'settings.reasoningEffort.off'
  | 'settings.reasoningEffort.auto'
  | 'settings.suggestionCount.label'
  | 'settings.suggestionCount.description'
  | 'settings.sanitize.title'
  | 'settings.redactSecrets.label'
  | 'settings.redactSecrets.description'
  | 'settings.stripControls.label'
  | 'settings.stripControls.description'
  | 'settings.singleLine.label'
  | 'settings.singleLine.description'
  | 'settings.filter.title'
  | 'settings.filterMetaText.label'
  | 'settings.filterMetaText.description'
  | 'settings.filterEvaluative.label'
  | 'settings.filterEvaluative.description'
  | 'settings.filterAssistantVoice.label'
  | 'settings.filterAssistantVoice.description'
  | 'settings.filterTooLong.label'
  | 'settings.filterTooLong.description'
  | 'settings.manual.title'
  | 'settings.manualShortcut.label'
  | 'settings.manualShortcut.description'
  | 'settings.manualReplacesDraft.label'
  | 'settings.manualReplacesDraft.description'
  | 'settings.regenerate'
  | 'settings.regenerate.hint'
  | 'settings.config.note'

/** Locale namespace registered by the client plugin. */
export const NS = 'suggested-replies'

/** English copy. */
export const en: Record<SuggestedRepliesKey, string> = {
  title: 'Suggested next messages',
  hint: 'Click to fill the message box',
  loading: 'Preparing next-message suggestions...',
  regenerate: 'Regenerate suggestions',
  dismiss: 'Dismiss suggestions',
  'settings.nav': 'Suggested replies',
  'settings.title': 'Suggested replies',
  'settings.description': 'After an AI reply, prepare a few likely next messages above the input box. Suggestions use the current conversation model by default.',
  'settings.enabled.label': 'Enable suggested replies',
  'settings.enabled.description': 'Generate candidate next messages after an AI reply. Clicking a candidate only fills the draft; it never sends automatically.',
  'settings.disabled.note': 'Disabled. Completed turns do not make auxiliary suggestion calls until you enable it again.',
  'settings.generation.title': 'Generation',
  'settings.reasoningEffort.label': 'Reasoning effort',
  'settings.reasoningEffort.description': "Set to 'off' to disable thinking for faster suggestions.",
  'settings.reasoningEffort.off': 'Off (no thinking)',
  'settings.reasoningEffort.auto': 'Auto (model default)',
  'settings.suggestionCount.label': 'Number of suggestions',
  'settings.suggestionCount.description': 'How many candidate messages to generate per turn.',
  'settings.sanitize.title': 'Sanitization',
  'settings.redactSecrets.label': 'Redact secrets',
  'settings.redactSecrets.description': 'Mask API keys and tokens in the transcript before sending to the model.',
  'settings.stripControls.label': 'Strip control characters',
  'settings.stripControls.description': 'Remove escape sequences, control characters, and bidi override marks.',
  'settings.singleLine.label': 'Force single line',
  'settings.singleLine.description': 'Ensure each suggestion is a single line with no embedded newlines.',
  'settings.filter.title': 'Semantic filtering',
  'settings.filterMetaText.label': 'Filter meta-text',
  'settings.filterMetaText.description': "Hide meta-text like 'no suggestion' or 'stay silent'.",
  'settings.filterEvaluative.label': 'Filter evaluative phrases',
  'settings.filterEvaluative.description': "Hide phrases like 'thanks', 'looks good', '不错'.",
  'settings.filterAssistantVoice.label': 'Filter assistant voice',
  'settings.filterAssistantVoice.description': "Hide phrases like 'Let me…', '我来…'.",
  'settings.filterTooLong.label': 'Filter overly long suggestions',
  'settings.filterTooLong.description': 'Hide suggestions exceeding 12 words or 100 bytes.',
  'settings.manual.title': 'Manual generation',
  'settings.manualShortcut.label': 'Keyboard shortcut',
  'settings.manualShortcut.description': "Shortcut to manually trigger suggestion generation. Set to 'disabled' to turn off.",
  'settings.manualReplacesDraft.label': 'Write to draft',
  'settings.manualReplacesDraft.description': 'Manual trigger writes the first suggestion directly to the draft.',
  'settings.regenerate': 'Regenerate',
  'settings.regenerate.hint': 'Click to regenerate suggestions',
  'settings.config.note': 'These options are configured at deployment in cordis.patch.yml and cannot be changed here.',
}

/** Simplified Chinese copy. */
export const zh: Record<SuggestedRepliesKey, string> = {
  title: '下一步建议',
  hint: '点击填入输入框',
  loading: '正在生成下一步建议...',
  regenerate: '重新生成建议',
  dismiss: '关闭建议',
  'settings.nav': '下一步建议',
  'settings.title': '下一步建议',
  'settings.description': 'AI 回复结束后，在输入框上方准备几条可能的下一步消息。默认沿用当前对话使用的模型。',
  'settings.enabled.label': '启用下一步建议',
  'settings.enabled.description': '点击建议只会把文字填入输入框，由你确认后发送，不会自动发出消息。',
  'settings.disabled.note': '已关闭。AI 回复结束后不会再生成下一步建议。',
  'settings.generation.title': '生成设置',
  'settings.reasoningEffort.label': '思考强度',
  'settings.reasoningEffort.description': "设为'关闭'可禁用思考以加快建议生成。",
  'settings.reasoningEffort.off': '关闭（不思考）',
  'settings.reasoningEffort.auto': '自动（模型默认）',
  'settings.suggestionCount.label': '建议数量',
  'settings.suggestionCount.description': '每次生成多少条候选消息。',
  'settings.sanitize.title': '净化设置',
  'settings.redactSecrets.label': '掩蔽密钥',
  'settings.redactSecrets.description': '在发送给模型前掩蔽转录中的 API 密钥和令牌。',
  'settings.stripControls.label': '剥离控制字符',
  'settings.stripControls.description': '移除转义序列、控制字符和双向覆盖符。',
  'settings.singleLine.label': '强制单行',
  'settings.singleLine.description': '确保每条建议为单行，无嵌入换行。',
  'settings.filter.title': '语义过滤',
  'settings.filterMetaText.label': '过滤元文本',
  'settings.filterMetaText.description': "隐藏'无建议'等元文本。",
  'settings.filterEvaluative.label': '过滤评价套话',
  'settings.filterEvaluative.description': "隐藏'谢谢'、'不错'等评价套话。",
  'settings.filterAssistantVoice.label': '过滤助手口吻',
  'settings.filterAssistantVoice.description': "隐藏'我来…'等助手口吻。",
  'settings.filterTooLong.label': '过滤过长建议',
  'settings.filterTooLong.description': '隐藏超过12词或100字节的建议。',
  'settings.manual.title': '手动生成',
  'settings.manualShortcut.label': '快捷键',
  'settings.manualShortcut.description': "手动触发建议生成的快捷键。设为'disabled'可关闭。",
  'settings.manualReplacesDraft.label': '写入草稿',
  'settings.manualReplacesDraft.description': '手动触发时将第一条建议直接写入草稿。',
  'settings.regenerate': '重新生成',
  'settings.regenerate.hint': '点击重新生成建议',
  'settings.config.note': '这些选项在 cordis.patch.yml 中于部署时配置，无法在此修改。',
}
