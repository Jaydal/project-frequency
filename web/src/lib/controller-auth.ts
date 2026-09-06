import { hasMatchingApiKey } from './auth/authorization';

export function checkControllerKey(request: Request): boolean {
  const apiKey = process.env.CONTROLLER_API_KEY;
  return hasMatchingApiKey(request.headers.get('x-api-key'), apiKey);
}
