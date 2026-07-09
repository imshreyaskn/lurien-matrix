from huggingface_hub import HfApi

api = HfApi()
spaces = api.list_spaces(author="imDrizzle")
print(f"--- Spaces for imDrizzle ---")
for space in spaces:
    print(f"Name: {space.id}")
    print(f"SDK: {space.sdk}")
    print(f"Likes: {space.likes}")
    print(f"Private: {space.private}")
    print("-" * 30)
