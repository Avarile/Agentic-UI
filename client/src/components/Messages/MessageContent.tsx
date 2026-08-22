// A content-parts message row for the standard (non-assistants) endpoints.
//
// One of MultiMessage's three renderers. It lives under `components/Messages/`
// rather than `components/Chat/Messages/` because this directory holds the
// chat-agnostic rendering primitives — the same components are used by the share
// view, search results and the artifacts panel, none of which have a live chat
// around them.

import React from 'react';
import type { TMessageProps } from '~/common';
import { useMessageProcess, useMemoizedChatContext } from '~/hooks';
import { areMessageRowPropsEqual } from '~/utils';
import ContentRender from './ContentRender';

const MessageContainer = React.memo(function MessageContainer({
  handleScroll,
  children,
}: {
  handleScroll: (event?: unknown) => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="w-full border-0 bg-transparent text-text-primary"
      onWheel={handleScroll}
      onTouchMove={handleScroll}
    >
      {children}
    </div>
  );
});

function MessageContent(props: TMessageProps) {
  const { handleScroll, isSubmitting } = useMessageProcess({
    message: props.message,
  });
  const { message } = props;
  const { chatContext, effectiveIsSubmitting } = useMemoizedChatContext(message, isSubmitting);

  if (!message || typeof message !== 'object') {
    return null;
  }

  return (
    <MessageContainer handleScroll={handleScroll}>
      <div className="m-auto justify-center px-4 py-3 md:px-6">
        <ContentRender {...props} isSubmitting={effectiveIsSubmitting} chatContext={chatContext} />
      </div>
    </MessageContainer>
  );
}

export default React.memo(MessageContent, areMessageRowPropsEqual);
