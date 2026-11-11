"""Smoke-test: one ADK agent call through LiteLlm -> Hyde gateway.

Validates the model wiring before building everything on top.
Run: uv run python -m finn.smoke_adk
"""
import asyncio


async def main() -> None:
    import os

    from finn.config import HYDE_API_KEY, HYDE_BASE_URL, MODEL_FAST

    os.environ.setdefault("OPENAI_API_KEY", HYDE_API_KEY)
    os.environ.setdefault("OPENAI_API_BASE", HYDE_BASE_URL)

    from google.adk import Runner
    from google.adk.agents import LlmAgent
    from google.adk.models.lite_llm import LiteLlm
    from google.adk.sessions import InMemorySessionService
    from google.genai import types

    agent = LlmAgent(
        name="finn_smoke",
        model=LiteLlm(model=f"openai/{MODEL_FAST}"),
        instruction="You are FINN, a terse financial assistant. Answer in one sentence.",
    )
    runner = Runner(
        app_name="finn",
        agent=agent,
        session_service=InMemorySessionService(),
    )
    session = await runner.session_service.create_session(app_name="finn", user_id="smoke")
    events = []
    async for event in runner.run_async(
        user_id="smoke",
        session_id=session.id,
        new_message=types.Content(role="user", parts=[types.Part(text="What is EBITDA?")]),
    ):
        events.append(event)
        if event.content and event.content.parts:
            for part in event.content.parts:
                if part.text:
                    print("MODEL:", part.text[:300])

    final = events[-1] if events else None
    print("events:", len(events), "| is_final:", getattr(final, "is_final_response", lambda: None)())


if __name__ == "__main__":
    asyncio.run(main())
