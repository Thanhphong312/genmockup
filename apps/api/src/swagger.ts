import type { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

export async function registerSwagger(app: FastifyInstance) {
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Gen Mockup API',
        description:
          'REST API ghép design vào mockup, quản lý watermark và upload kết quả lên Google Drive.',
        version: '0.1.0',
      },
      servers: [
        { url: 'https://mockup.primehorizon.studio', description: 'Production (nginx)' },
        {
          url: 'https://genmockup.primehorizon.studio',
          description: 'Cũ — Windows + Cloudflare Tunnel',
        },
        { url: 'http://localhost:3000', description: 'Local dev' },
      ],
      tags: [
        { name: 'Auth', description: 'Đăng nhập / phiên người dùng' },
        { name: 'Mockups', description: 'Quản lý ảnh mockup + vùng đặt design' },
        { name: 'Watermarks', description: 'Quản lý ảnh watermark' },
        { name: 'Generate', description: 'Sinh ảnh ghép design + mockup' },
        { name: 'Drive', description: 'Google Drive OAuth + upload' },
        { name: 'System', description: 'Health & misc' },
      ],
      components: {
        securitySchemes: {
          cookieAuth: {
            type: 'apiKey',
            in: 'cookie',
            name: 'genmockup_session',
            description:
              'JWT cookie set sau khi /api/auth/login. Browser tự gửi cookie cho mọi request.',
          },
        },
      },
      security: [{ cookieAuth: [] }],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/api/documentation',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      tryItOutEnabled: true,
    },
    staticCSP: true,
  });
}
