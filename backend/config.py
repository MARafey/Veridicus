from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    LLM_PROVIDER: str = "anthropic"
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_MODEL: str = "claude-opus-4-6"
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o"
    OLLAMA_MODEL: str = "llama3.2"
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    NVIDIA_API_KEY: str = ""
    NVIDIA_MODEL: str = "meta/llama-4-maverick-17b-128e-instruct"
    NVIDIA_BASE_URL: str = "https://integrate.api.nvidia.com/v1"
    ARLIAI_API_KEY: str = ""
    ARLIAI_MODEL: str = "Mistral-Nemo-12B-Instruct-2407"
    ARLIAI_BASE_URL: str = "https://api.arliai.com/v1"
    CEREBRAS_API_KEY: str = ""
    CEREBRAS_MODEL: str = "llama-3.3-70b"
    CEREBRAS_BASE_URL: str = "https://api.cerebras.ai/v1"
    DATABASE_URL: str = "sqlite:///./polygraph.db"
    DOWNLOADS_DIR: str = "./downloads"
    CORS_ORIGINS: str = "http://localhost:3000"
    GITHUB_TOKEN: str = ""  # optional; enables 5000 req/hour vs 60


settings = Settings()
