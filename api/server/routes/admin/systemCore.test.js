const express = require('express');
const request = require('supertest');

let deniedCapability;
const middlewareCalls = [];
const mockRequireJwtAuth = jest.fn((req, _res, next) => {
  req.user = { id: 'user-1', role: 'ADMIN', tenantId: 'tenant-a' };
  middlewareCalls.push('jwt');
  next();
});
const mockRequireCapability = jest.fn((capability) => (req, res, next) => {
  middlewareCalls.push(capability);
  if (deniedCapability === capability) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  next();
});
const mockHandlers = {
  getSnapshot: jest.fn((_req, res) => res.status(200).json({ handler: 'snapshot' })),
  getAvailability: jest.fn((_req, res) => res.status(200).json({ handler: 'availability' })),
};

jest.mock('@librechat/data-schemas', () => ({
  SystemCapabilities: { ACCESS_ADMIN: 'access:admin' },
}));

jest.mock('@librechat/api', () => ({
  createSystemCoreHandlers: jest.fn(() => mockHandlers),
}));

jest.mock('~/server/middleware/roles/capabilities', () => ({
  requireCapability: mockRequireCapability,
}));

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: mockRequireJwtAuth,
}));

describe('admin System Core routes', () => {
  function createApp() {
    delete require.cache[require.resolve('./systemCore')];
    const router = require('./systemCore');
    const app = express();
    app.use(express.json());
    app.use('/api/admin/system-core', router);
    return app;
  }

  beforeEach(() => {
    deniedCapability = undefined;
    middlewareCalls.length = 0;
    jest.clearAllMocks();
  });

  it('authenticates then checks admin access before the snapshot handler runs', async () => {
    const response = await request(createApp()).get('/api/admin/system-core/snapshot').expect(200);

    expect(response.body).toEqual({ handler: 'snapshot' });
    expect(middlewareCalls).toEqual(['jwt', 'access:admin']);
  });

  it('gates availability behind the same capability', async () => {
    const response = await request(createApp())
      .get('/api/admin/system-core/availability')
      .expect(200);

    expect(response.body).toEqual({ handler: 'availability' });
    expect(middlewareCalls).toEqual(['jwt', 'access:admin']);
  });

  it('answers 403 without ever invoking the handler', async () => {
    // The point of gating at the router: an unauthorized caller must not cause a
    // single upstream Prometheus query.
    deniedCapability = 'access:admin';

    await request(createApp()).get('/api/admin/system-core/snapshot').expect(403);

    expect(mockHandlers.getSnapshot).not.toHaveBeenCalled();
  });

  it('gates availability the same way', async () => {
    deniedCapability = 'access:admin';

    await request(createApp()).get('/api/admin/system-core/availability').expect(403);

    expect(mockHandlers.getAvailability).not.toHaveBeenCalled();
  });

  it('exposes read routes only', async () => {
    // No write path exists to be authorized, so none should be routable.
    const app = createApp();
    const statuses = await Promise.all([
      request(app).post('/api/admin/system-core/snapshot'),
      request(app).put('/api/admin/system-core/snapshot'),
      request(app).delete('/api/admin/system-core/snapshot'),
      request(app).get('/api/admin/system-core/anything-else'),
    ]).then((responses) => responses.map((response) => response.status));

    expect(statuses).toEqual([404, 404, 404, 404]);
  });
});
