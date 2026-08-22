// The composer's form context, produced by CustomFormContext's factory.
//
// Exists as its own module so `ChatFormValues` is bound once and every consumer
// gets the typed hook rather than re-instantiating the generic factory.

import type { ChatFormValues } from '~/common';
import { createFormContext } from './CustomFormContext';

const { CustomFormProvider, useCustomFormContext, useOptionalCustomFormContext } =
  createFormContext<ChatFormValues>();

export {
  CustomFormProvider as ChatFormProvider,
  useCustomFormContext as useChatFormContext,
  useOptionalCustomFormContext as useOptionalChatFormContext,
};
