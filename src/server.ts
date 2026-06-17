import { createServer, IncomingMessage, ServerResponse } from 'http';
import { parse } from 'url';
import next from 'next';

const dev = process.env.COZE_PROJECT_ENV !== 'PROD';
const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = parseInt(process.env.PORT || process.env.DEPLOY_RUN_PORT || '5000', 10);

// PostgREST proxy URL (set when using local database mode)
const postgrestUrl = process.env.POSTGREST_URL;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

/**
 * Proxy /rest/v1/* requests to PostgREST.
 * Strips the /rest/v1 prefix and forwards to PostgREST, which serves at root path.
 */
async function proxyToPostgrest(req: IncomingMessage, res: ServerResponse, pathname: string, search: string): Promise<void> {
  // Strip /rest/v1 prefix
  const proxyPath = pathname.replace(/^\/rest\/v1/, '') || '/';
  const target = `${postgrestUrl}${proxyPath}${search || ''}`;

  // Read request body for non-GET methods
  let body: Buffer | undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.from(chunk as Buffer));
    }
    body = Buffer.concat(chunks);
  }

  // Forward relevant headers (exclude host, connection which are connection-specific)
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (value && !['host', 'connection', 'content-length'].includes(key.toLowerCase())) {
      headers[key] = Array.isArray(value) ? value.join(', ') : value;
    }
  }

  try {
    const proxyRes = await fetch(target, {
      method: req.method || 'GET',
      headers,
      body: body as BodyInit | undefined,
    });

    res.statusCode = proxyRes.status;

    // Copy response headers (skip transfer-encoding, it's managed by Node)
    proxyRes.headers.forEach((value, key) => {
      if (!['transfer-encoding', 'content-encoding', 'content-length'].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });

    const resBody = await proxyRes.arrayBuffer();
    res.end(Buffer.from(resBody));
  } catch (err) {
    console.error('[PostgREST Proxy] Error:', err);
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Database proxy error', message: String(err) }));
  }
}

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      const pathname = parsedUrl.pathname || '';

      // Proxy /rest/v1/* to PostgREST (local database mode)
      if (postgrestUrl && pathname.startsWith('/rest/v1')) {
        await proxyToPostgrest(req, res, pathname, parsedUrl.search || '');
        return;
      }

      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('Internal server error');
    }
  });

  server.once('error', err => {
    console.error(err);
    process.exit(1);
  });

  server.listen(port, () => {
    console.log(
      `> Server listening at http://${hostname}:${port} as ${dev ? 'development' : process.env.COZE_PROJECT_ENV}`,
    );
    if (postgrestUrl) {
      console.log(`> PostgREST proxy: /rest/v1/* -> ${postgrestUrl}`);
    }
  });
});
