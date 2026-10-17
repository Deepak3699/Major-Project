"""Escalating anti-bot HTTP layer (SRS §3.4 / §9.4).

Single async entrypoints `fetch_text()` / `fetch_json()`. Every request escalates
through increasingly-strengthened engines and DEGRADES GRACEFULLY — a missing
optional dependency or credential never crashes the run, it just falls to the
next tier (this fixes the old per-scraper behaviour where a missing Playwright
browser raised ScraperError and lost the whole source).

Tiers (strongest last; each skipped if its dep/key is absent):
  0. httpx          - plain async GET with realistic browser headers.
  1. curl_cffi      - browser TLS/JA3 impersonation (open-source anti-fingerprint).
  2. playwright     - real headless Chromium + stealth init script, honouring the
                      configured proxy; best-effort CAPTCHA solve if a solver
                      provider + key are configured.

Evasion config is entirely env-driven so the *plumbing* ships here but the paid
/optional parts only activate when the operator adds credentials:
  ROTATING_PROXIES / PROXY_URL   comma list / single auth proxy
                                 (e.g. Bright Data, Oxylabs, Smartproxy endpoint
                                 `http://user:pass@gate:port`). Round-robined.
  HTTP_IMPERSONATE               curl_cffi impersonation target (default chrome)
  CAPTCHA_PROVIDER               one of: 2captcha, anticaptcha  (else disabled)
  CAPTCHA_API_KEY                key for the chosen solver (else disabled)
  HEADLESS                       "0" to run Playwright headed (debugging)

This module deliberately keeps no per-site logic: callers get a rendered document
and parse it. That keeps the evasion concerns (headers/TLS/proxy/stealth/captcha)
in exactly one place.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import random
from dataclasses import dataclass
from typing import Any, Optional
from urllib.parse import quote_plus

logger = logging.getLogger("scraper.http")
# Keep full request URLs (which carry API keys for the query-auth vendors and the
# CAPTCHA solver) out of logs: silence httpx/h11 INFO access logging.
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

# ---- optional deps: import lazily, record availability, never crash on absence.
try:  # curl_cffi is a real, popular open-source TLS-impersonation client.
    from curl_cffi.requests import AsyncSession as _CurlSession  # type: ignore
    _HAVE_CURL_CFFI = True
except Exception:  # noqa: BLE001
    _CurlSession = None
    _HAVE_CURL_CFFI = False

try:
    import httpx  # already a hard dep
    _HAVE_HTTPX = True
except Exception:  # noqa: BLE001
    _HAVE_HTTPX = False

# ---- realistic browser headers ------------------------------------------------
_ACCEPT = (
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,"
    "image/webp,*/*;q=0.8"
)


def _browser_headers(extra: Optional[dict[str, str]] = None) -> dict[str, str]:
    ua = os.environ.get("SCRAPER_USER_AGENT")
    if not ua:
        try:  # reuse the repo's UA rotator if present
            from fake_useragent import UserAgent
            ua = UserAgent().random
        except Exception:  # noqa: BLE001
            ua = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
    h = {
        "User-Agent": ua,
        "Accept": _ACCEPT,
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Connection": "keep-alive",
    }
    if extra:
        h.update(extra)
    return h


def _proxies() -> list[str]:
    raw = os.environ.get("ROTATING_PROXIES", "")
    out = [p.strip() for p in raw.split(",") if p.strip()]
    one = os.environ.get("PROXY_URL", "").strip()
    if one:
        out.append(one)
    if not out and os.environ.get("ALLOW_FREE_PROXIES", "") == "1":
        # Off by DEFAULT. Public volunteer proxies can MITM/log/serve poisoned
        # HTML. Opt-in only, and never for PII-bearing calls. Operator sets it
        # when they accept that trade-off for extra job-board evasion.
        try:
            from free_proxy import FreeProxy
            fp = FreeProxy(anonym=True).get_proxy_list()
            out = [f"http://{p}" for p in fp[:10]]
        except Exception:  # noqa: BLE001
            out = []
    return out


def _norm_proxy(p: str) -> str:
    """Ensure a proxy URL carries a scheme; Playwright/httpx/curl all need one.
    'user:pass@host:port' -> 'http://user:pass@host:port'. Already-schemed pass through."""
    p = p.strip()
    if not p:
        return p
    if "://" not in p:
        return "http://" + p
    return p


def _pick_proxy() -> Optional[str]:
    ps = _proxies()
    return _norm_proxy(random.choice(ps)) if ps else None


# ---- block detection ---------------------------------------------------------
_BLOCK_MARKERS = (
    "captcha", "recaptcha", "unusual traffic", "access denied", "are you a robot",
    "blocked", "cloudflare", "enable javascript and cookies", "px-captcha",
    "verify you are human", "request blocked",
)


def _looks_blocked(status: int, text: str) -> bool:
    if status in (403, 429, 503):
        return True
    # Marker scan is done REGARDLESS of length: a tiny interstitial (Just a
    # moment / Enable JavaScript / captcha) served with a 200 is still a block,
    # so we must not skip the check for short bodies (this is how a scraper
    # silently eats an empty shell and thinks it succeeded). Scan a bounded
    # window so a large legit page merely mentioning 'blocked' cannot false-hit.
    if any(m in text[:4000].lower() for m in _BLOCK_MARKERS):
        return True
    # empty/near-empty body is almost always a soft block or SPA shell -> flag.
    return len(text) < 250


# ---- captcha solver (env-gated; best-effort) ---------------------------------
async def solve_recaptcha(sitekey: str, pageurl: str, *, timeout: int = 110) -> Optional[str]:
    """Return a solved reCAPTCHA-v2 token via a configured solver, else None.

    Supports 2captcha and anticaptcha. Only active when CAPTCHA_PROVIDER +
    CAPTCHA_API_KEY are set. This is best-effort: many public search pages gate
    via TLS/fingerprint (handled by curl_cffi/Playwright) rather than a solvable
    recaptcha, so we never *depend* on it.
    """
    provider = os.environ.get("CAPTCHA_PROVIDER", "").lower()
    key = os.environ.get("CAPTCHA_API_KEY", "")
    if not provider or not key or not sitekey or not _HAVE_HTTPX:
        return None
    try:
        async with httpx.AsyncClient(timeout=timeout + 15) as c:
            if provider == "2captcha":
                r = await c.post("https://2captcha.com/in.php", data={
                    "key": key, "method": "userdefined", "pageurl": pageurl,
                    "googlekey": sitekey, "json": 1})
                rid = r.json().get("request")
                for _ in range(timeout // 5):
                    await asyncio.sleep(5)
                    # POST so the API key is not in the URL (query strings are
                    # logged by httpx's INFO logger and by egress proxies).
                    s = await c.post("https://2captcha.com/res.php", data={
                        "key": key, "action": "get", "id": rid, "json": 1})
                    j = s.json()
                    if j.get("status") == 1:
                        return j.get("request")
            elif provider == "anticaptcha":
                r = await c.post("https://api.anti-captcha.com/createTask", json={
                    "clientKey": key, "task": {
                        "type": "RecaptchaV2TaskProxyless",
                        "websiteURL": pageurl, "websiteKey": sitekey}})
                tid = r.json().get("taskId")
                for _ in range(timeout // 5):
                    await asyncio.sleep(5)
                    s = await c.post("https://api.anti-captcha.com/getTaskResult",
                                     json={"clientKey": key, "taskId": tid})
                    j = s.json()
                    if j.get("status") == "ready":
                        return j.get("solution", {}).get("g-recaptcha-response")
    except Exception as e:  # noqa: BLE001
        logger.debug(f"captcha solve failed: {e}")
    return None


# ---- the three engines -------------------------------------------------------
async def _t_httpx(url: str, headers: dict, proxy: Optional[str], timeout: int) -> tuple[int, str]:
    async with httpx.AsyncClient(timeout=timeout, proxy=proxy,
                                 follow_redirects=True, headers=headers) as c:
        r = await c.get(url)
        return r.status_code, r.text


async def _t_curl(url: str, headers: dict, proxy: Optional[str], timeout: int) -> tuple[int, str]:
    imp = os.environ.get("HTTP_IMPERSONATE", "chrome")
    async with _CurlSession(impersonate=imp, proxy=proxy, timeout=timeout,
                            headers=headers) as s:
        r = await s.get(url, allow_redirects=True)
        return r.status_code, r.text


# Minimal but effective Chromium stealth patch (no extra dependency).
_STEALTH_JS = """
Object.defineProperty(navigator,'webdriver',{get:()=>undefined});
window.chrome={runtime:{}};
Object.defineProperty(navigator,'plugins',{get:()=>[1,2,3,4,5]});
Object.defineProperty(navigator,'languages',{get:()=>['en-US','en']});
const q=window.navigator.permissions.query;
window.navigator.permissions.query=(p)=>
  (p.name==='notifications'?Promise.resolve({state:Notification.permission}):q(p));
"""


async def _t_playwright(url: str, headers: dict, proxy: Optional[str], timeout: int) -> tuple[int, str]:
    from playwright.async_api import async_playwright  # hard dep in this repo
    launched = []
    async with async_playwright() as p:
        launch_kwargs = {"headless": os.environ.get("HEADLESS", "1") != "0"}
        if proxy:
            proxy = _norm_proxy(proxy)
            if "@" in proxy:  # scheme://user:pass@host:port
                scheme, rest = proxy.split("://", 1)
                creds, _, hostport = rest.rpartition("@")
                pp = {"server": f"{scheme}://{hostport}"}
                u, _, pw = creds.partition(":")
                pp["username"], pp["password"] = u, pw
                launch_kwargs["proxy"] = pp
            else:
                launch_kwargs["proxy"] = {"server": proxy}
        browser = await p.chromium.launch(**launch_kwargs)
        launched.append(browser)
        ctx = await browser.new_context(user_agent=headers.get("User-Agent"),
                                        locale="en-US", viewport={"width": 1366, "height": 900})
        await ctx.add_init_script(_STEALTH_JS)
        page = await ctx.new_page()
        resp = await page.goto(url, timeout=timeout * 1000, wait_until="domcontentloaded")
        # best-effort captcha solve when a solver is configured and a recaptcha is present
        if _captcha_configured():
            try:
                key = await page.evaluate(
                    "()=>{const e=document.querySelector('[data-sitekey]');"
                    "if(e)return e.getAttribute('data-sitekey');"
                    "const f=[...document.querySelectorAll('iframe')]"
                    ".find(i=>i.src&&i.src.includes('recaptcha'));if(f){"
                    "const m=f.src.match(/k=([\\w-]+)/);return m&&m[1];}return null;}")
                if key:
                    token = await solve_recaptcha(key, url)
                    if token:
                        await page.evaluate(
                            "(t)=>{const a=document.querySelector('[name=g-recaptcha-response]')"
                            "||document.querySelector('#g-recaptcha-response');if(a){a.value=t;"
                            "const f=a.closest('form');if(f&&f.submit)f.submit();}}", token)
                        await page.wait_for_load_state("domcontentloaded")
            except Exception as e:  # noqa: BLE001
                logger.debug(f"captcha inline solve skipped: {e}")
        await page.wait_for_timeout(1200)
        html = await page.content()
        status = resp.status if resp else 200
        await browser.close()
        return status, html


def _captcha_configured() -> bool:
    return bool(os.environ.get("CAPTCHA_API_KEY")) and \
        os.environ.get("CAPTCHA_PROVIDER", "").lower() in ("2captcha", "anticaptcha")


@dataclass
class Response:
    status: int
    text: str
    engine: str


async def fetch(url: str, *, timeout: int = 20, headers: Optional[dict] = None,
                max_engine: str = "playwright", min_engine: str = "httpx") -> Response:
    """Fetch `url`, escalating engines until one returns a non-blocked document.

    `min_engine`/`max_engine`: one of "httpx" | "curl" | "playwright". Most public
    JSON/SSR sites want the cheap default (min=httpx). JavaScript-rendered portals
    (Naukri/LinkedIn/Indeed...) should set min=max="playwright" to skip the tiers
    that only ever return the empty SPA shell.
    Raises the LAST engine's exception only if every available tier errored;
    returns whatever the best-effort result was otherwise (never raises just
    because a page looked blocked — the caller decides).
    """
    ranks = {"httpx": 0, "curl": 1, "playwright": 2}
    # Never fetch non-web schemes; a redirect-following generic client handed a
    # file://gopher:// URL would be an SSRF footgun. All call sites are https
    # today; this guards future ones.
    if not url.lower().startswith(("http://", "https://")):
        raise ValueError(f"refusing to fetch non-http(s) URL: {url!r}")
    lo = ranks.get(min_engine, 0)
    hi = ranks.get(max_engine, 2)
    order = [e for i, e in enumerate(["httpx", "curl", "playwright"]) if lo <= i <= hi]
    h = _browser_headers(headers)
    last_err: Optional[Exception] = None
    for engine in order:
        proxy = _pick_proxy()
        try:
            if engine == "curl" and not _HAVE_CURL_CFFI:
                continue
            if engine == "httpx" and not _HAVE_HTTPX:
                continue
            if engine == "httpx":
                status, text = await _t_httpx(url, h, proxy, timeout)
            elif engine == "curl":
                status, text = await _t_curl(url, h, proxy, timeout)
            else:
                status, text = await _t_playwright(url, h, proxy, timeout)
            if _looks_blocked(status, text) and engine != order[-1] and max_engine != "httpx":
                # try a stronger engine before giving up
                continue
            return Response(status, text, engine)
        except asyncio.TimeoutError:
            last_err = asyncio.TimeoutError(f"{engine} timeout {url}")
            continue
        except Exception as e:  # noqa: BLE001  (a tier failing is expected; escalate)
            last_err = e
            continue
    if last_err:
        raise last_err
    return Response(0, "", "none")


async def fetch_json(url: str, **kw) -> Any:
    r = await fetch(url, **kw)
    try:
        return json.loads(r.text)
    except (json.JSONDecodeError, TypeError):
        return None
