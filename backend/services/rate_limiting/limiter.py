"""
services.rate_limiting — Rate Limiting
======================================

Simple rate limiting decorator for Cotrade handlers.
"""

import time
import threading
from typing import Dict, Tuple, Callable, Any

# In a production system, we might use Redis or memcached for distributed rate limiting.
# For now, we use a simple in-memory store.

# Structure: {key: (timestamp, count)}
# We'll use a fixed window counter.
_request_log: Dict[str, Tuple[float, int]] = {}
_lock = threading.RLock()

# Default limits: 100 requests per minute
DEFAULT_LIMIT = 100
DEFAULT_WINDOW = 60  # seconds


def rate_limit(limit: int = DEFAULT_LIMIT, window: int = DEFAULT_WINDOW,
               key_func: Callable[[Any], str] = lambda request: request.client_address[0]):
    """
    Decorator to limit the rate of requests to a handler.

    Args:
        limit: Maximum number of requests allowed in the window.
        window: Time window in seconds.
        key_func: Function that takes the request handler and returns a string key
                  for grouping requests (e.g., IP address, API key).

    Returns:
        A decorator that wraps the handler method.
    """
    def decorator(func: Callable) -> Callable:
        def wrapper(self, *args, **kwargs):
            # Generate the key for this request
            key = key_func(self)
            now = time.time()

            with _lock:
                # Clean up old entries (optional, but we do it on every request for simplicity)
                # We could do this in a background thread, but for simplicity we do it here.
                # Remove entries older than 2*window to prevent unbounded growth.
                expired = [k for k, (t, _) in _request_log.items() if now - t > 2 * window]
                for k in expired:
                    del _request_log[k]

                # Get current count for this key
                if key in _request_log:
                    timestamp, count = _request_log[key]
                    # If we are still in the same window, increment
                    if now - timestamp < window:
                        if count >= limit:
                            # Rate limit exceeded
                            self.send_error_json("Rate limit exceeded", 429, "RateLimitExceeded")
                            return
                        else:
                            _request_log[key] = (timestamp, count + 1)
                    else:
                        # Window has passed, reset
                        _request_log[key] = (now, 1)
                else:
                    # First request in this window
                    _request_log[key] = (now, 1)

            # If we are here, we are within the limit, so call the original function
            return func(self, *args, **kwargs)

        # Preserve the original function's name and docstring
        wrapper.__name__ = func.__name__
        wrapper.__doc__ = func.__doc__
        return wrapper
    return decorator


def allow_request(key: str, limit: int = DEFAULT_LIMIT, window: int = DEFAULT_WINDOW) -> bool:
    """
    Check if a request with the given key is allowed under the rate limit.

    Args:
        key: The key to check (e.g., IP address).
        limit: Maximum number of requests allowed in the window.
        window: Time window in seconds.

    Returns:
        True if the request is allowed, False otherwise.
    """
    now = time.time()
    with _lock:
        # Clean up old entries (we do it on every call for simplicity)
        expired = [k for k, (t, _) in _request_log.items() if now - t > 2 * window]
        for k in expired:
            del _request_log[k]

        if key in _request_log:
            timestamp, count = _request_log[key]
            # If we are still in the same window, check if we can increment
            if now - timestamp < window:
                if count >= limit:
                    return False
                else:
                    _request_log[key] = (timestamp, count + 1)
                    return True
            else:
                # Window has passed, reset and allow
                _request_log[key] = (now, 1)
                return True
        else:
            # First request in this window
            _request_log[key] = (now, 1)
            return True
