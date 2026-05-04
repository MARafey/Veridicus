from backend.config import settings


def get_llm(temperature: float = 0.2):
    if settings.LLM_PROVIDER == "anthropic":
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(
            model=settings.ANTHROPIC_MODEL,
            api_key=settings.ANTHROPIC_API_KEY,
            temperature=temperature,
        )
    elif settings.LLM_PROVIDER == "ollama":
        from langchain_ollama import ChatOllama
        return ChatOllama(
            model=settings.OLLAMA_MODEL,
            base_url=settings.OLLAMA_BASE_URL,
            temperature=temperature,
        )
    elif settings.LLM_PROVIDER == "cerebras":
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            model=settings.CEREBRAS_MODEL,
            api_key=settings.CEREBRAS_API_KEY,
            base_url=settings.CEREBRAS_BASE_URL,
            temperature=temperature,
        )
    elif settings.LLM_PROVIDER == "arliai":
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            model=settings.ARLIAI_MODEL,
            api_key=settings.ARLIAI_API_KEY,
            base_url=settings.ARLIAI_BASE_URL,
            temperature=temperature,
        )
    elif settings.LLM_PROVIDER == "nvidia":
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            model=settings.NVIDIA_MODEL,
            api_key=settings.NVIDIA_API_KEY,
            base_url=settings.NVIDIA_BASE_URL,
            temperature=temperature,
        )
    else:
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            model=settings.OPENAI_MODEL,
            api_key=settings.OPENAI_API_KEY,
            temperature=temperature,
        )
