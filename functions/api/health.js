export async function onRequest(context) {
  const { env } = context;
  const body = {
    ok: true,
    hasWork24AuthKey: !!env.WORK24_AUTH_KEY,
    hasWork24CommonKey: !!env.WORK24_COMMON_KEY,
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
