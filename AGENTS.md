# dsh-suggested-replies

`dsh-suggested-replies` is an independent DSH Web bundle. It predicts a few likely next user messages after a completed AI turn and renders them in `conversation.input.dock`, which DSH places immediately above the message input.

## Product requirements

- A candidate click calls only `inputActions.setDraft(text)`. Never call `inputActions.submit()`.
- Keep the dock registration at `conversation.input.dock` with order `15`; `conversation.composer.dock` is below the input card and is incorrect for this feature.
- Candidate results are non-surface session events. They must not enter model-visible history.
- New user input, a disabled setting, a timeout, or plugin disposal must invalidate the active generation so a stale result cannot reappear.
- Keep all deployment-varying limits in `Config`; do not introduce hidden hardcoded tunables.

## Development

```sh
export DSH_SOURCE=/path/to/deepseek-harness
pnpm install --no-frozen-lockfile
pnpm run links
pnpm run typecheck
pnpm run test
pnpm run build
```

`lib/` is committed so a GitHub-installed bundle does not require a source build. Before publishing, use a clean temporary `DSH_HOME` with `dsh plugin --profile web add <repository>` and `dsh --profile web --dump-config`.
