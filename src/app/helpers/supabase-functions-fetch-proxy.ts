/**
 * Rewrites Supabase Edge Function URLs to a same-origin path (e.g. /__sb-fn/...)
 * so `ng serve` can proxy them. Helps when the browser reports FunctionsFetchError
 * / "Failed to fetch" for direct calls to *.supabase.co (extensions, VPN, strict clients).
 */
export function createSupabaseFunctionsFetchProxy(
  supabaseUrl: string,
  proxyPathPrefix: string
): typeof fetch {
  const base = supabaseUrl.replace(/\/$/, '');
  const functionsPrefix = `${base}/functions/v1`;
  const prefix = proxyPathPrefix.replace(/\/$/, '');
  const bound = globalThis.fetch.bind(globalThis);

  const hrefOf = (input: RequestInfo | URL): string => {
    if (typeof input === 'string') return input;
    if (input instanceof URL) return input.href;
    return input.url;
  };

  return (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (typeof window === 'undefined') {
      return bound(input as RequestInfo, init);
    }
    const href = hrefOf(input);
    if (!href.startsWith(functionsPrefix)) {
      return bound(input as RequestInfo, init);
    }
    const suffix = href.slice(base.length);
    const proxied = `${window.location.origin}${prefix}${suffix}`;
    if (input instanceof Request && init === undefined) {
      return bound(new Request(proxied, input));
    }
    return bound(proxied, init);
  };
}
