/**
 * CRUD for chat projects (conversation grouping) and conversation assignment.
 *
 * Design: a thin binding — all handlers come from `createProjectHandlers` in `packages/api`
 * with the model functions injected, keeping the logic in TypeScript per the workspace
 * boundary. `requireJwtAuth` is applied router-wide.
 */
const express = require('express');
const { createProjectHandlers } = require('@librechat/api');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const db = require('~/models');

const router = express.Router();
const handlers = createProjectHandlers({
  listChatProjects: db.listChatProjects,
  createChatProject: db.createChatProject,
  getChatProject: db.getChatProject,
  updateChatProject: db.updateChatProject,
  deleteChatProject: db.deleteChatProject,
  assignConversationToProject: db.assignConversationToProject,
});

router.use(requireJwtAuth);

router.get('/', handlers.listProjects);
router.post('/', handlers.createProject);
router.put('/conversations/:conversationId', handlers.assignConversationToProject);
router.get('/:projectId', handlers.getProject);
router.patch('/:projectId', handlers.updateProject);
router.delete('/:projectId', handlers.deleteProject);

module.exports = router;
