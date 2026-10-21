// Puerta local estilo Supabase: /auth/v1 → servicio de Auth, /rest/v1 → PostgREST. Solo desarrollo/E2E.
import http from "node:http";
const PORT = Number(process.env.GATEWAY_PORT ?? 54321);
const routes = [
  { prefix: "/auth/v1", port: Number(process.env.AUTH_PORT ?? 9999) },
  { prefix: "/rest/v1", port: Number(process.env.PGRST_PORT ?? 3001) },
];
http
  .createServer((req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "*",
        "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
      });
      return res.end();
    }
    const route = routes.find((r) => req.url?.startsWith(r.prefix));
    if (!route) {
      res.writeHead(404);
      return res.end("not found");
    }
    const upstream = http.request(
      { host: "127.0.0.1", port: route.port, method: req.method, path: req.url.slice(route.prefix.length) || "/", headers: req.headers },
      (up) => {
        res.writeHead(up.statusCode ?? 502, { ...up.headers, "access-control-allow-origin": "*" });
        up.pipe(res);
      },
    );
    upstream.on("error", (e) => {
      res.writeHead(502);
      res.end(String(e));
    });
    req.pipe(upstream);
  })
  .listen(PORT, "127.0.0.1", () => console.log(`gateway en http://127.0.0.1:${PORT}`));
