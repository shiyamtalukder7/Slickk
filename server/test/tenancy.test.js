const assert = require('node:assert/strict');
const test = require('node:test');

const {
  authorizeTenantAccess,
  tenantResource,
} = require('../src/schools/tenancy');

test('school resources cannot cross tenant boundaries', () => {
  const resource = tenantResource({
    tenantId: 'school-a',
    resourceType: 'assessment',
    resourceId: 'assessment-1',
    ownerId: 'teacher-1',
    purpose: 'class-practice',
  });
  const decision = authorizeTenantAccess({
    principal: {
      tenantId: 'school-b',
      role: 'school-admin',
    },
    resource,
    action: 'read-school',
  });

  assert.equal(decision.allowed, false);
  assert.equal(
    decision.reason,
    'cross-tenant-access-denied'
  );
});

test('same-tenant access still requires the correct role action', () => {
  const resource = tenantResource({
    tenantId: 'school-a',
    resourceType: 'roster',
    resourceId: 'class-6',
    ownerId: 'admin-1',
    purpose: 'school-operation',
  });

  assert.equal(
    authorizeTenantAccess({
      principal: {
        tenantId: 'school-a',
        role: 'student',
      },
      resource,
      action: 'manage-roster',
    }).allowed,
    false
  );
});
