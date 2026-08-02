const {
  createHash,
  timingSafeEqual,
} = require('node:crypto');

function tokenDigest(value) {
  return createHash('sha256')
    .update(String(value || ''), 'utf8')
    .digest();
}

function parseApiCredentials(rawValue) {
  if (!String(rawValue || '').trim()) {
    return [];
  }

  let parsed;

  try {
    parsed = JSON.parse(rawValue);
  } catch {
    throw new Error(
      'SLICKK_API_KEYS_JSON must contain valid JSON.'
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error(
      'SLICKK_API_KEYS_JSON must be a JSON array.'
    );
  }

  return parsed.map((credential) => {
    const token = String(credential?.token || '');
    const role = String(credential?.role || '');
    const subjectId = String(
      credential?.subjectId || ''
    );

    if (
      token.length < 24 ||
      !['student', 'guardian', 'teacher', 'school-admin'].includes(
        role
      ) ||
      !subjectId
    ) {
      throw new Error(
        'Each API credential needs a 24+ character token, supported role, and subjectId.'
      );
    }

    return {
      digest: tokenDigest(token),
      role,
      subjectId: subjectId.slice(0, 180),
    };
  });
}

function credentialForToken(credentials, token) {
  const supplied = tokenDigest(token);

  return (
    credentials.find(
      (credential) =>
        credential.digest.length === supplied.length &&
        timingSafeEqual(credential.digest, supplied)
    ) || null
  );
}

function securityHeaders(
  _request,
  response,
  next
) {
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; frame-ancestors 'none'"
  );
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader(
    'Referrer-Policy',
    'no-referrer'
  );
  response.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()'
  );
  response.setHeader(
    'Cache-Control',
    'no-store, private'
  );
  next();
}

function authenticateApi(credentials) {
  return (request, response, next) => {
    if (
      credentials.length === 0 ||
      !request.path.startsWith('/api/')
    ) {
      request.principal = {
        role: 'local',
        subjectId: 'local-student',
      };
      next();
      return;
    }

    const authorization = String(
      request.header('Authorization') || ''
    );
    const token = authorization.startsWith('Bearer ')
      ? authorization.slice(7).trim()
      : '';
    const credential = credentialForToken(
      credentials,
      token
    );

    if (!credential) {
      response.status(401).json({
        error: 'A valid Slickk API credential is required.',
        code: 'AUTHENTICATION_REQUIRED',
        requestId: request.requestId,
      });
      return;
    }

    request.principal = {
      role: credential.role,
      subjectId: credential.subjectId,
    };
    next();
  };
}

function createRateLimiter({
  maximum = 120,
  windowMs = 60_000,
  now = Date.now,
} = {}) {
  const clients = new Map();

  return (request, response, next) => {
    const key =
      request.principal?.subjectId ||
      request.ip ||
      'unknown';
    const currentTime = now();
    const previous = clients.get(key);
    const entry =
      !previous ||
      currentTime - previous.startedAt >= windowMs
        ? {
            startedAt: currentTime,
            count: 0,
          }
        : previous;

    entry.count += 1;
    clients.set(key, entry);

    response.setHeader(
      'RateLimit-Limit',
      String(maximum)
    );
    response.setHeader(
      'RateLimit-Remaining',
      String(Math.max(0, maximum - entry.count))
    );

    if (entry.count > maximum) {
      response.setHeader(
        'Retry-After',
        String(
          Math.max(
            1,
            Math.ceil(
              (windowMs -
                (currentTime - entry.startedAt)) /
                1000
            )
          )
        )
      );
      response.status(429).json({
        error: 'Too many requests. Please wait and try again.',
        code: 'RATE_LIMITED',
        requestId: request.requestId,
      });
      return;
    }

    next();
  };
}

function canAccessStudent(principal, studentId) {
  if (!principal || principal.role === 'local') {
    return true;
  }

  if (principal.role === 'student') {
    return principal.subjectId === studentId;
  }

  return false;
}

function requireStudentAccess(
  request,
  response,
  studentId
) {
  if (
    canAccessStudent(request.principal, studentId)
  ) {
    return true;
  }

  response.status(403).json({
    error:
      'This credential cannot access that student record.',
    code: 'STUDENT_ACCESS_DENIED',
    requestId: request.requestId,
  });
  return false;
}

module.exports = {
  authenticateApi,
  canAccessStudent,
  createRateLimiter,
  credentialForToken,
  parseApiCredentials,
  requireStudentAccess,
  securityHeaders,
  tokenDigest,
};
