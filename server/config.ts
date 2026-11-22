import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const CONFIG = {
  PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 4000,
  API_PREFIX: '/api/v1',
  JWT_SECRET: process.env.JWT_SECRET || 'procura-enterprise-jwt-secret-key-2026',
  JWT_EXPIRES_IN: '7d',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  DATA_DIR: path.resolve(process.cwd(), 'server', 'data'),
  UPLOADS_DIR: path.resolve(process.cwd(), 'server', 'uploads'),
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000'
};
