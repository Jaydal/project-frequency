export function checkControllerKey(request: Request): boolean {
  const apiKey = process.env.CONTROLLER_API_KEY;
  if (!apiKey) return false;
  return request.headers.get('x-api-key') === apiKey;
}
