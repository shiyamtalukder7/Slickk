function tenantResource({
  tenantId,
  resourceType,
  resourceId,
  ownerId,
  purpose,
}) {
  if (
    !tenantId ||
    !resourceType ||
    !resourceId ||
    !ownerId ||
    !purpose
  ) {
    const error = new Error(
      'Tenant resources require school, owner, type, ID, and purpose.'
    );
    error.code = 'TENANT_METADATA_REQUIRED';
    throw error;
  }

  return {
    tenantId: String(tenantId),
    resourceType: String(resourceType),
    resourceId: String(resourceId),
    ownerId: String(ownerId),
    purpose: String(purpose),
  };
}

function authorizeTenantAccess({
  principal,
  resource,
  action,
}) {
  if (
    !principal ||
    principal.tenantId !== resource.tenantId
  ) {
    return {
      allowed: false,
      reason: 'cross-tenant-access-denied',
    };
  }

  const roleActions = {
    student: new Set(['read-own', 'submit-own']),
    guardian: new Set(['read-linked']),
    teacher: new Set([
      'read-class',
      'create-assignment',
      'mark-assessment',
    ]),
    'school-admin': new Set([
      'read-school',
      'manage-roster',
      'manage-resources',
    ]),
  };
  const allowed = roleActions[principal.role]?.has(
    action
  );

  return {
    allowed: Boolean(allowed),
    reason: allowed ? 'role-permitted' : 'role-denied',
  };
}

module.exports = {
  authorizeTenantAccess,
  tenantResource,
};
