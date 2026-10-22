export const PLATFORMS = ['web', 'android', 'ios'];

// Which client is calling: the web app sends nothing, the mobile app will send these headers
export function clientInfo(req, res, next) {
  const platform = String(req.get('x-client-platform') ?? '').toLowerCase();
  req.client = {
    platform: PLATFORMS.includes(platform) ? platform : 'web',
    appVersion: String(req.get('x-app-version') ?? '').slice(0, 20) || undefined
  };
  next();
}
