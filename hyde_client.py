import os

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

client = OpenAI(
    api_key=os.environ["HYDE_API_KEY"],
    base_url=os.getenv("HYDE_BASE_URL", "https://inference.hyde.tech/v1"),
)
MODEL = os.getenv("HYDE_MODEL", "hyde/glm-5.3-flash")


def chat(prompt: str, model: str = MODEL) -> str:
    response = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.choices[0].message.content


if __name__ == "__main__":
    print(chat("Say hello in one short sentence."))
