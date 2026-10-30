class LLMProviderError(Exception):
    def __init__(
        self,
        message: str,
        provider: str = "anthropic",
        status_code: int = 502,  # Bad Gateway (upstream AI provider failure)
        is_retryable: bool = False,
        original_error: Exception | None = None,
    ):
        super().__init__(message)
        self.message = message
        self.provider = provider
        self.status_code = status_code
        self.is_retryable = is_retryable
        self.original_error = original_error

    def __str__(self) -> str:
        return f"[{self.provider.upper()}] {self.message} (status={self.status_code}, retryable={self.is_retryable})"
