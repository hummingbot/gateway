import { HttpError, httpErrors } from '../../src/services/error-handler';

describe('Error Handler', () => {
  it('carries the status code and message', () => {
    const error = new HttpError(400, 'Invalid input');
    expect(error).toBeInstanceOf(Error);
    expect(error.statusCode).toBe(400);
    expect(error.message).toBe('Invalid input');
    expect(error.name).toBe('HttpError');
  });

  it.each([
    [400, 'Bad Request'],
    [401, 'Unauthorized'],
    [403, 'Forbidden'],
    [404, 'Not Found'],
    [409, 'Conflict'],
    [429, 'Too Many Requests'],
    [500, 'Internal Server Error'],
    [502, 'Bad Gateway'],
    [503, 'Service Unavailable'],
    [418, 'Error'],
  ])('names status %i "%s"', (statusCode, name) => {
    expect(new HttpError(statusCode, 'test').error).toBe(name);
  });

  it.each([
    ['badRequest', 400],
    ['notFound', 404],
    ['internalServerError', 500],
    ['serviceUnavailable', 503],
    ['forbidden', 403],
  ] as const)('httpErrors.%s answers %i', (helper, statusCode) => {
    expect(httpErrors[helper]('message')).toMatchObject({ statusCode, message: 'message' });
  });

  it('httpErrors.createError answers any status', () => {
    expect(httpErrors.createError(429, 'Rate limited')).toMatchObject({
      statusCode: 429,
      message: 'Rate limited',
      error: 'Too Many Requests',
    });
  });
});
