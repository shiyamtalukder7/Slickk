const configuredServerUrl =
  process.env.EXPO_PUBLIC_SLICKK_SERVER_URL?.trim().replace(/\/+$/, '') ?? '';

function requireServerUrl() {
  if (!configuredServerUrl) {
    throw new Error(
      'EXPO_PUBLIC_SLICKK_SERVER_URL is missing. Add it to .env.local and reload the app.'
    );
  }

  if (!/^https?:\/\//i.test(configuredServerUrl)) {
    throw new Error(
      'EXPO_PUBLIC_SLICKK_SERVER_URL must begin with http:// or https://.'
    );
  }

  return configuredServerUrl;
}

export function getSlickkApiUrl(path: `/${string}`) {
  return `${requireServerUrl()}${path}`;
}