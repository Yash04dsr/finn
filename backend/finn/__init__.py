import os

# litellm otherwise downloads its model price list from GitHub on first import.
os.environ.setdefault("LITELLM_LOCAL_MODEL_COST_MAP", "True")
