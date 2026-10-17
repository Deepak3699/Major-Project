import random
import logging

logger = logging.getLogger(__name__)

class UserAgentMiddleware:
    """SRS §3.7: Anti-blocking — rotate User-Agent per request."""

    def process_request(self, request, spider):
        try:
            from fake_useragent import UserAgent
            ua = UserAgent().random
        except Exception:
            ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        request.headers["User-Agent"] = ua
        return None
