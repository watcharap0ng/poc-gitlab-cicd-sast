const express = require('express')
const helmet = require('helmet')
const cors = require('cors')
const compression = require('compression')
const morgan = require('morgan')
require('dotenv').config()

const app = express()
const PORT = process.env.PORT || 3000

// Security middleware
app.use(helmet())
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}))

// General middleware
app.use(compression())
app.use(morgan('combined'))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  })
})

// Application info endpoint
app.get('/info', (req, res) => {
  res.status(200).json({
    name: 'Node.js SAST Application',
    description: 'Node.js application with comprehensive security scanning',
    version: process.env.npm_package_version || '1.0.0',
    security: {
      sast: ['Gitleaks', 'Semgrep', 'Trivy'],
      sca: ['Dependency-Track', 'npm audit'],
      container: ['Trivy Docker']
    }
  })
})

// API routes
app.get('/api/status', (req, res) => {
  res.status(200).json({
    message: 'Application is running successfully',
    security: 'Enabled',
    features: ['SAST Scanning', 'Dependency Analysis', 'Container Security']
  })
})

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err)
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal Server Error',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  })
})

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: {
      message: 'Route not found'
    }
  })
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully')
  server.close(() => {
    console.log('Process terminated')
  })
})

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully')
  server.close(() => {
    console.log('Process terminated')
  })
})

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`)
  console.log(`📊 Health check: http://localhost:${PORT}/health`)
  console.log(`🔍 Application info: http://localhost:${PORT}/info`)
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`)
})

module.exports = app