import type { Instrumentation } from "next";

/**
 * Every server error, as one structured line in the host's logs (Vercel → Logs), with the
 * route and the digest the error page shows — so "something went wrong" can be found.
 * Only the path is logged: no query string, headers, cookies or form contents.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const e = err as { message?: string; digest?: string; code?: string; name?: string };
  console.error(JSON.stringify({
    level: "error",
    event: "request_error",
    path: request.path.split("?")[0],
    method: request.method,
    route: context.routePath,
    routeType: context.routeType,
    digest: e?.digest,
    name: e?.name,
    code: e?.code,
    message: e?.message?.slice(0, 500),
  }));
};
