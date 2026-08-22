// Direct tool invocation, outside a conversation.
//
// Used where a tool is run as its own action rather than by the model — the
// assistants file-search and code-execution surfaces. Kept separate from the SSE
// control plane because there is no generation to attach to.

import { dataService, QueryKeys, Tools } from 'librechat-data-provider';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';
import type * as t from 'librechat-data-provider';

export const useToolCallMutation = <T extends t.ToolId>(
  toolId: T,
  options?: t.ToolCallMutationOptions<T>,
): UseMutationResult<t.ToolCallResponse, Error, t.ToolParams<T>> => {
  const queryClient = useQueryClient();
  return useMutation(
    (toolParams: t.ToolParams<T>) => {
      return dataService.callTool({
        toolId,
        toolParams,
      });
    },
    {
      onMutate: (variables) => options?.onMutate?.(variables),
      onError: (error, variables, context) => options?.onError?.(error, variables, context),
      onSuccess: (response, variables, context) => {
        queryClient.setQueryData<t.ToolCallResults>(
          [QueryKeys.toolCalls, variables.conversationId],
          (prev) => [
            ...(prev ?? []),
            {
              user: '',
              toolId: Tools.execute_code,
              partIndex: variables.partIndex,
              messageId: variables.messageId,
              blockIndex: variables.blockIndex,
              conversationId: variables.conversationId,
              result: response.result,
              attachments: response.attachments,
            },
          ],
        );
        return options?.onSuccess?.(response, variables, context);
      },
    },
  );
};
