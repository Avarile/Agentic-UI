// Legacy `/d/*` routes, kept as redirects only.
//
// The dashboard was folded into the main chat shell; these entries exist because
// old links and bookmarks still point at `/d/...`. Prompt deep links keep their
// id (`/d/prompts/:id` -> `/prompts/:id`) so a shared link still resolves;
// everything else lands on a new chat.

import { Navigate, useParams } from 'react-router-dom';
import DashboardRoute from './Layouts/Dashboard';

function PromptsRedirect() {
  const { '*': splat } = useParams();
  /** Prompts are created from a dialog, so there is no "new" page to land on */
  const target = splat && splat !== 'new' ? `/prompts/${splat}` : '/c/new';
  return <Navigate to={target} replace={true} />;
}

const dashboardRoutes = {
  path: 'd/*',
  element: <DashboardRoute />,
  children: [
    {
      path: 'prompts/*',
      element: <PromptsRedirect />,
    },
    {
      path: '*',
      element: <Navigate to="/c/new" replace={true} />,
    },
  ],
};

export default dashboardRoutes;
