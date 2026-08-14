/**
 * Locale dictionaries for the suggested-replies Web surface.
 *
 * @module @dsh-external/dsh-suggested-replies/client/locales
 */

/** Keys used by the input dock and settings section. */
export type SuggestedRepliesKey =
  | 'title'
  | 'hint'
  | 'loading'
  | 'settings.nav'
  | 'settings.title'
  | 'settings.description'
  | 'settings.enabled.label'
  | 'settings.enabled.description'
  | 'settings.disabled.note'

/** Locale namespace registered by the client plugin. */
export const NS = 'suggested-replies'

/** English copy. */
export const en: Record<SuggestedRepliesKey, string> = {
  title: 'Suggested next messages',
  hint: 'Click to fill the message box',
  loading: 'Preparing next-message suggestions...',
  'settings.nav': 'Suggested replies',
  'settings.title': 'Suggested replies',
  'settings.description': 'After an AI reply, prepare a few likely next messages above the input box. Suggestions use the current conversation model by default.',
  'settings.enabled.label': 'Enable suggested replies',
  'settings.enabled.description': 'Generate candidate next messages after an AI reply. Clicking a candidate only fills the draft; it never sends automatically.',
  'settings.disabled.note': 'Disabled. Completed turns do not make auxiliary suggestion calls until you enable it again.',
}

/** Simplified Chinese copy. */
export const zh: Record<SuggestedRepliesKey, string> = {
  title: '下一步建议',
  hint: '点击填入输入框',
  loading: '正在生成下一步建议...',
  'settings.nav': '下一步建议',
  'settings.title': '下一步建议',
  'settings.description': 'AI 回复结束后，在输入框上方准备几条可能的下一步消息。默认沿用当前对话使用的模型。',
  'settings.enabled.label': '启用下一步建议',
  'settings.enabled.description': '点击建议只会把文字填入输入框，由你确认后发送，不会自动发出消息。',
  'settings.disabled.note': '已关闭。AI 回复结束后不会再生成下一步建议。',
}
