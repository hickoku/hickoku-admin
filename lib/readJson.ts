// Read an API reply. Our API routes always answer in JSON, but the hosting in
// front of them can answer with an HTML error page (during a deploy, on a
// timeout). Turn that into a message people can act on instead of
// "Unexpected token '<' … is not valid JSON".
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- callers read their own fields
export async function readJson(res: Response): Promise<any> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    const busy = res.status === 502 || res.status === 503 || res.status === 504;
    return {
      success: false,
      error: busy
        ? `The server didn't answer in time (error ${res.status}). If a deploy is running, wait a minute, reload the page to see whether it went through, then try again.`
        : `The server sent an unexpected reply (error ${res.status}). Reload the page to see whether it went through, then try again.`,
    };
  }
}
