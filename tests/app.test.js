const request = require('supertest')
const app = require('../src/index')

describe('Node.js SAST Application', () => {
  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200)

      expect(response.body).toHaveProperty('status', 'healthy')
      expect(response.body).toHaveProperty('timestamp')
      expect(response.body).toHaveProperty('version')
      expect(response.body).toHaveProperty('environment')
    })
  })

  describe('GET /info', () => {
    it('should return application information', async () => {
      const response = await request(app)
        .get('/info')
        .expect(200)

      expect(response.body).toHaveProperty('name', 'Node.js SAST Application')
      expect(response.body).toHaveProperty('description')
      expect(response.body).toHaveProperty('version')
      expect(response.body).toHaveProperty('security')
      expect(response.body.security).toHaveProperty('sast')
      expect(response.body.security).toHaveProperty('sca')
      expect(response.body.security).toHaveProperty('container')
    })
  })

  describe('GET /api/status', () => {
    it('should return API status', async () => {
      const response = await request(app)
        .get('/api/status')
        .expect(200)

      expect(response.body).toHaveProperty('message')
      expect(response.body).toHaveProperty('security', 'Enabled')
      expect(response.body).toHaveProperty('features')
      expect(Array.isArray(response.body.features)).toBe(true)
    })
  })

  describe('404 Handler', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await request(app)
        .get('/unknown-route')
        .expect(404)

      expect(response.body).toHaveProperty('error')
      expect(response.body.error).toHaveProperty('message', 'Route not found')
    })
  })

  describe('Security Headers', () => {
    it('should include security headers', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200)

      // Check for common security headers
      expect(response.headers).toHaveProperty('x-content-type-options')
      expect(response.headers).toHaveProperty('x-frame-options')
      expect(response.headers).toHaveProperty('x-xss-protection')
    })
  })
})