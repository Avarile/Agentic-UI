/**
 * Coarse role check: requires `req.user.role === SystemRoles.ADMIN`.
 *
 * Design: this is the legacy, role-based gate. New authorization should prefer the
 * capability system (`roles/capabilities.js`), which is grant-based and finer-grained. This
 * remains for routes whose semantics are genuinely "system administrator only".
 *
 * Connections: used by admin routers under `server/routes/admin/`
 */
const { SystemRoles } = require('librechat-data-provider');

function checkAdmin(req, res, next) {
  try {
    if (req.user.role !== SystemRoles.ADMIN) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  } catch (error) {
    res.status(500).json({ message: 'Internal Server Error' });
  }
}

module.exports = checkAdmin;
