import {
  HttpError,
  httpErrors,
  badRequest,
  notFound,
  internalServerError,
  serviceUnavailable,
  forbidden,
} from '../../src/services/error-handler';

describe('Error Handler', () => {
  describe('HttpError class', () => {
    it('should create error with correct statusCode and message', () => {
      const error = new HttpError(400, 'Invalid input');
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Invalid input');
      expect(error.name).toBe('HttpError');
    });

    it('should be instance of Error', () => {
      const error = new HttpError(500, 'Server error');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(HttpError);
    });

    it('should set correct error name for 400 Bad Request', () => {
      const error = new HttpError(400, 'test');
      expect(error.error).toBe('Bad Request');
    });

    it('should set correct error name for 401 Unauthorized', () => {
      const error = new HttpError(401, 'test');
      expect(error.error).toBe('Unauthorized');
    });

    it('should set correct error name for 403 Forbidden', () => {
      const error = new HttpError(403, 'test');
      expect(error.error).toBe('Forbidden');
    });

    it('should set correct error name for 404 Not Found', () => {
      const error = new HttpError(404, 'test');
      expect(error.error).toBe('Not Found');
    });

    it('should set correct error name for 409 Conflict', () => {
      const error = new HttpError(409, 'test');
      expect(error.error).toBe('Conflict');
    });

    it('should set correct error name for 429 Too Many Requests', () => {
      const error = new HttpError(429, 'test');
      expect(error.error).toBe('Too Many Requests');
    });

    it('should set correct error name for 500 Internal Server Error', () => {
      const error = new HttpError(500, 'test');
      expect(error.error).toBe('Internal Server Error');
    });

    it('should set correct error name for 502 Bad Gateway', () => {
      const error = new HttpError(502, 'test');
      expect(error.error).toBe('Bad Gateway');
    });

    it('should set correct error name for 503 Service Unavailable', () => {
      const error = new HttpError(503, 'test');
      expect(error.error).toBe('Service Unavailable');
    });

    it('should set generic error name for unknown status codes', () => {
      const error = new HttpError(418, 'test');
      expect(error.error).toBe('Error');
    });
  });

  describe('Helper functions', () => {
    it('badRequest should create 400 error', () => {
      const error = badRequest('Invalid parameter');
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Invalid parameter');
      expect(error.error).toBe('Bad Request');
    });

    it('notFound should create 404 error', () => {
      const error = notFound('Resource not found');
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('Resource not found');
      expect(error.error).toBe('Not Found');
    });

    it('internalServerError should create 500 error', () => {
      const error = internalServerError('Something went wrong');
      expect(error.statusCode).toBe(500);
      expect(error.message).toBe('Something went wrong');
      expect(error.error).toBe('Internal Server Error');
    });

    it('serviceUnavailable should create 503 error', () => {
      const error = serviceUnavailable('Service is down');
      expect(error.statusCode).toBe(503);
      expect(error.message).toBe('Service is down');
      expect(error.error).toBe('Service Unavailable');
    });

    it('forbidden should create 403 error', () => {
      const error = forbidden('Access denied');
      expect(error.statusCode).toBe(403);
      expect(error.message).toBe('Access denied');
      expect(error.error).toBe('Forbidden');
    });
  });

  describe('httpErrors object', () => {
    it('should have badRequest method', () => {
      const error = httpErrors.badRequest('test');
      expect(error.statusCode).toBe(400);
    });

    it('should have notFound method', () => {
      const error = httpErrors.notFound('test');
      expect(error.statusCode).toBe(404);
    });

    it('should have internalServerError method', () => {
      const error = httpErrors.internalServerError('test');
      expect(error.statusCode).toBe(500);
    });

    it('should have serviceUnavailable method', () => {
      const error = httpErrors.serviceUnavailable('test');
      expect(error.statusCode).toBe(503);
    });

    it('should have forbidden method', () => {
      const error = httpErrors.forbidden('test');
      expect(error.statusCode).toBe(403);
    });

    it('should have createError method for custom status codes', () => {
      const error = httpErrors.createError(429, 'Rate limited');
      expect(error.statusCode).toBe(429);
      expect(error.message).toBe('Rate limited');
      expect(error.error).toBe('Too Many Requests');
    });

    it('createError should work with any status code', () => {
      const error = httpErrors.createError(502, 'Bad gateway');
      expect(error.statusCode).toBe(502);
      expect(error.error).toBe('Bad Gateway');
    });
  });

  describe('Error throwing and catching', () => {
    it('should be throwable and catchable', () => {
      expect(() => {
        throw httpErrors.badRequest('Test error');
      }).toThrow(HttpError);
    });

    it('should preserve statusCode when caught', () => {
      try {
        throw httpErrors.notFound('Not found');
      } catch (error) {
        expect((error as HttpError).statusCode).toBe(404);
        expect((error as HttpError).message).toBe('Not found');
      }
    });

    it('should work with async/await pattern', async () => {
      const asyncFunction = async () => {
        throw httpErrors.internalServerError('Async error');
      };

      await expect(asyncFunction()).rejects.toMatchObject({
        statusCode: 500,
        message: 'Async error',
      });
    });
  });
});
