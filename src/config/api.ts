const configuredServerUrl =
  process.env.EXPO_PUBLIC_SLICKK_SERVER_URL
    ?.trim()
    .replace(/\/+$/, '') ?? '';

const configuredBrainServerUrl =
  process.env.EXPO_PUBLIC_SLICKK_BRAIN_URL
    ?.trim()
    .replace(/\/+$/, '') ?? '';

function validateHttpUrl(
  value: string,
  variableName: string
) {
  if (!/^https?:\/\//i.test(value)) {
    throw new Error(
      `${variableName} must begin with http:// or https://.`
    );
  }

  return value;
}

function requireServerUrl() {
  if (!configuredServerUrl) {
    throw new Error(
      'EXPO_PUBLIC_SLICKK_SERVER_URL is missing. Add it to .env.local and reload the app.'
    );
  }

  return validateHttpUrl(
    configuredServerUrl,
    'EXPO_PUBLIC_SLICKK_SERVER_URL'
  );
}

function requireBrainServerUrl() {
  if (configuredBrainServerUrl) {
    return validateHttpUrl(
      configuredBrainServerUrl,
      'EXPO_PUBLIC_SLICKK_BRAIN_URL'
    );
  }

  /*
   * During USB development, both services use the same host:
   *
   * Main Slickk server: 11435
   * Verified Tutor Brain: 11436
   *
   * Deriving the host keeps existing installations compatible while
   * allowing EXPO_PUBLIC_SLICKK_BRAIN_URL to override it later.
   */
  const mainServerUrl = new URL(
    requireServerUrl()
  );

  mainServerUrl.port = '11436';

  return mainServerUrl
    .toString()
    .replace(/\/+$/, '');
}

export function getSlickkApiUrl(
  path: `/${string}`
) {
  return `${requireServerUrl()}${path}`;
}

export function getSlickkBrainApiUrl(
  path: `/${string}`
) {
  return `${requireBrainServerUrl()}${path}`;
}
