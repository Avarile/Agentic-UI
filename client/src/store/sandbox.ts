// One flag per tool call: is the code sandbox still cold-booting?
//
// Set from the `on_sandbox_starting` SSE event and cleared when the run step
// completes. It exists purely so a tool call can swap its in-progress label to
// "starting sandbox" — without it, a cold start looks like a hung execution.

import { atomFamily } from 'recoil';

/**
 * True while the backend reported the stateful code sandbox is cold-booting
 * for this tool call (`on_sandbox_starting` SSE event). Keyed by
 * `tool_call_id`; `ExecuteCode`/`BashCall` swap their in-progress label to a
 * "starting sandbox" message while set. Cleared when the tool call's run
 * step completes.
 */
export const sandboxStartingByToolCallId = atomFamily<boolean, string>({
  key: 'sandboxStartingByToolCallId',
  default: false,
});
