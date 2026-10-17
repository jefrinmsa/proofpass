import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { z, ZodError } from 'zod';
import { address, proofSchema } from '@zk-auth/shared';
import { AuthError, createService, type Dependencies } from './service';
export async function buildServer(d: Dependencies, jwks: object) {
  const server = Fastify({ logger: false, bodyLimit: 16384 });
  await server.register(cors, {
    origin: true,
    methods: ['POST', 'GET'],
    allowedHeaders: ['Content-Type'],
  });
  await server.register(rateLimit, { max: 30, timeWindow: '1 minute' });
  const service = createService(d);
  server.addHook('onSend', async (_req, reply) => {
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Content-Type-Options', 'nosniff');
  });
  server.get('/health', async () => ({ status: 'ok', environment: 'test' }));
  server.get('/.well-known/jwks.json', async () => jwks);
  server.post('/v1/challenges', async (req) => {
    const b = z
      .object({ appId: z.string().min(1).max(64), wallet: address })
      .strict()
      .parse(req.body);
    return service.challenge(b.appId, req.headers.origin ?? '', b.wallet);
  });
  server.post('/v1/auth/verify', async (req) => {
    const b = z
      .object({
        challengeId: z.string().uuid(),
        signature: z
          .string()
          .regex(/^0x[0-9a-fA-F]+$/)
          .max(2048),
        proof: proofSchema,
      })
      .strict()
      .parse(req.body);
    return service.verify(
      b.challengeId,
      req.headers.origin ?? '',
      b.signature as `0x${string}`,
      b.proof,
    );
  });
  server.setErrorHandler((error, _req, reply) => {
    if (error instanceof AuthError)
      return reply.code(error.status).send({ error: { code: error.code } });
    if (error instanceof ZodError || error.statusCode === 400)
      return reply.code(400).send({ error: { code: 'INVALID_REQUEST' } });
    if (error.statusCode === 429) return reply.code(429).send({ error: { code: 'RATE_LIMITED' } });
    return reply.code(503).send({ error: { code: 'VERIFICATION_UNAVAILABLE' } });
  });
  return server;
}
