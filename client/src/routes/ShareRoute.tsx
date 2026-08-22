// Public read-only view of a shared conversation, reached at `/share/:shareId`.
//
// Deliberately mounted outside `AuthLayout` (see routes/index.tsx): no session, no
// AuthContextProvider, no token refresh. That is what lets a link work for a
// logged-out visitor, and it is also the constraint the message components have to
// respect — anything rendered from here must tolerate the absence of chat form and
// auth context, which is why Providers/CustomFormContext exposes a non-throwing
// `useOptionalCustomFormContext`.

import ShareView from '~/components/Share/ShareView';

export default function ShareRoute() {
  return <ShareView />;
}
